import { getAlerts } from "@/features/alerts/api/alertsApi";
import { alertsCacheUpdated } from "@/features/alerts/model/alertsSlice";
import { getCommandes, getInvoices } from "@/features/documents/api/documentsApi";
import { commandesCacheUpdated, invoicesCacheUpdated } from "@/features/documents/model/documentsSlice";
import { partnersCacheUpdated } from "@/features/partners/model/partnersSlice";
import { getPipelines } from "@/features/pipelines/api/pipelinesApi";
import { pipelinesCacheUpdated } from "@/features/pipelines/model/pipelinesSlice";
import { getTenantStats, getTenants } from "@/features/tenants/api/tenantsApi";
import { tenantStatsCacheUpdated, tenantsCacheUpdated } from "@/features/tenants/model/tenantsSlice";
import { apiClient, getErrorMessage } from "@/shared/api/apiClient";
import { getUser } from "@/shared/api/authStorage";
import { dispatchApp, getAppState } from "@/shared/model/storeBridge";

// Centralizes backend loading, response normalization, and Redux cache refreshes.
let tenantsPromise = null;

async function getData(url, params) {
  try {
    const response = await apiClient.get(url, { params });
    return response.data;
  } catch (error) {
    error.message = getErrorMessage(error);
    throw error;
  }
}

/** Builds tenant-scoped query params only for engine-admin cross-tenant reads. */
function adminParams(tenantId, size) {
  const user = getUser();
  // Only engine admins pass an explicit tenant; tenant admins are scoped by the backend session.
  return user?.isEngineAdmin ? { adminTenantId: tenantId, size } : { size };
}

/** Converts backend pipeline variants into the UI pipeline shape used by dashboards. */
function normalizePipeline(pipeline = {}, tenantId) {
  const config = pipeline.config || (typeof pipeline.configJson === "string" ? (() => {
    try { return JSON.parse(pipeline.configJson); } catch { return {}; }
  })() : pipeline.configJson) || {};
  const activationFailed = pipeline.activationStatus === "FAILED";
  const status = activationFailed ? "failed"
    : pipeline.status === "ACTIVE" ? "actif"
    : pipeline.status === "DRAFT" ? "paused"
    : (pipeline.status || "paused").toLowerCase();
  const connector = pipeline.sourceType === "JDBC" ? "JDBC"
    : pipeline.sourceType === "API" ? "REST"
    : pipeline.sourceType || config.connection?.type?.toUpperCase() || "ERP";
  const lastRun = pipeline.lastRunAt || pipeline.lastRunStats?.finishedAt || pipeline.lastRunStats?.startedAt || null;

  return {
    ...pipeline,
    tenantId: pipeline.tenantId || tenantId,
    status,
    connector,
    config,
    configJson: pipeline.configJson || JSON.stringify(config || {}),
    freq: config.schedule?.freq || config.schedule?.mode || config.schedule?.scheduleMode || "MANUAL",
    workspaceStarted: pipeline.status === "ACTIVE" || status === "actif",
    invoicesProcessed: pipeline.documentCount ?? pipeline.lastRunStats?.invoicesImported ?? pipeline.lastRunStats?.rowsImported ?? 0,
    currentAnomalyCount: pipeline.currentAnomalyCount ?? 0,
    anomalyRate: pipeline.documentCount ? (pipeline.currentAnomalyCount ?? 0) / pipeline.documentCount : 0,
    lastRun,
  };
}

/** Converts backend anomaly records into the compact alert rows rendered by the UI. */
function normalizeAlert(alert = {}) {
  const type = String(alert.anomalyType || "Alerte").replaceAll("_", " ");
  const series = alert.seriesName || alert.seriesSupplier || "série inconnue";

  return {
    ...alert,
    message: alert.message || alert.explanation || `${type} · ${series}`,
    timestamp: alert.timestamp || alert.detectedAt || alert.createdAt || alert.detectionDate || null,
    severity: String(alert.severity || "warning").toLowerCase(),
    read: alert.read === true || String(alert.status || "").toUpperCase() === "READ" || String(alert.status || "").toUpperCase() === "RESOLVED",
  };
}

/** Normalizes invoice identity and workflow fields across tenant-specific ERP exports. */
function normalizeInvoice(invoice = {}) {
  const extraFields = invoice.extraFields || {};
  const extraKeys = Object.keys(extraFields);
  // Imported ERP files use tenant-specific column names, so invoice identity fields are matched by aliases.
  const pickExtra = (needles) => {
    for (const needle of needles) {
      const key = extraKeys.find((item) => item.toLowerCase().includes(needle));
      if (key && extraFields[key] != null && String(extraFields[key]).trim() !== "") return extraFields[key];
    }
    return undefined;
  };

  return {
    ...invoice,
    date: invoice.date || invoice.invoiceDate || "",
    amount: invoice.amount ?? 0,
    status: String(invoice.status || "").toLowerCase(),
    reference: invoice.reference
      || pickExtra(["ref_facture", "reffacture", "facture_ref", "num_facture", "numfacture", "numero_facture", "ref_piece", "piece", "invoice_ref", "reference"])
      || invoice.invoice_ref || invoice.externalId || invoice.id,
    establishment: invoice.establishment
      || pickExtra(["etablissement", "etab", "jrneta", "societe", "entite", "site", "establishment"]) || "",
    extStatus: invoice.extStatus
      || pickExtra(["epfextsta", "ext_status", "extstatus", "statut_externe", "statut", "etat_workflow", "etat"])
      || invoice.accountingStatus || "",
  };
}

/** Loads pipelines for one tenant, normalizes backend variants, and refreshes the Redux cache. */
export async function loadPipelinesForTenant(tenantId) {
  if (!tenantId) return [];
  const response = await getPipelines(adminParams(tenantId, 200));
  const pipelines = (response?.content || response || []).map((pipeline) => normalizePipeline(pipeline, tenantId));
  dispatchApp(pipelinesCacheUpdated({ tenantId, pipelines }));
  return pipelines;
}

/** Loads alerts for one tenant and stores UI-ready alert rows in the Redux cache. */
export async function loadAlertsForTenant(tenantId) {
  if (!tenantId) return [];
  const response = await getAlerts(adminParams(tenantId, 200));
  const alerts = (response?.content || response || []).map(normalizeAlert);
  dispatchApp(alertsCacheUpdated({ tenantId, alerts }));
  return alerts;
}

/** Loads invoices for one tenant, preserving ERP-derived identifiers used by the UI. */
export async function loadInvoicesForTenant(tenantId, size = 1000) {
  if (!tenantId) return [];
  const response = await getInvoices(adminParams(tenantId, size));
  const invoices = (response?.content || response || []).map(normalizeInvoice);
  dispatchApp(invoicesCacheUpdated({ tenantId, invoices }));
  return invoices;
}

/** Loads purchase orders for one tenant and tolerates both paged and raw-array API responses. */
export async function loadCommandesForTenant(tenantId, size = 1000) {
  if (!tenantId) return [];
  const response = await getCommandes(adminParams(tenantId, size));
  const commandes = response?.content || response?.commandes || response || [];
  const list = Array.isArray(commandes) ? commandes : [];
  dispatchApp(commandesCacheUpdated({ tenantId, commandes: list }));
  return list;
}

/** Loads ERP partner connections from the admin or tenant endpoint based on the current role. */
export async function loadPartnersForTenant(tenantId) {
  if (!tenantId) return [];
  const user = getUser();
  const response = user?.isEngineAdmin
    ? await getData("/admin/tenant-connections", { tenantId })
    : await getData("/tenant/erp-connections");
  const partners = (Array.isArray(response) ? response : response?.content || []).map((connection) => ({
    ...connection,
    name: connection.connectorName || connection.tenantExternalLabel || connection.externalId || "ERP",
  }));
  dispatchApp(partnersCacheUpdated({ tenantId, partners }));
  return partners;
}

/** Loads tenant options once per session unless a refresh is explicitly requested. */
export async function loadTenants(force = false) {
  const state = getAppState();
  if (!force && state.tenants.tenants.length > 0) return state.tenants.tenants;
  if (tenantsPromise) return tenantsPromise;
  tenantsPromise = getTenants({ size: 500 })
    .then((response) => {
      const tenants = response?.content || response || [];
      dispatchApp(tenantsCacheUpdated(tenants));
      return getAppState().tenants.tenants;
    })
    .finally(() => { tenantsPromise = null; });
  return tenantsPromise;
}

/** Loads and caches aggregate tenant statistics for dashboard views. */
export async function loadTenantStats(tenantId) {
  if (!tenantId) return null;
  const stats = await getTenantStats(tenantId);
  dispatchApp(tenantStatsCacheUpdated({ tenantId, stats: stats || {} }));
  return stats;
}
