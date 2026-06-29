import { getAlerts } from "@/features/alerts/api/alertsApi";
import { alertsCacheUpdated } from "@/features/alerts/model/alertsSlice";
import { getDocuments } from "@/features/documents/api/documentsApi";
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

function pageItems(response) {
  return response?.content || response?.commandes || response || [];
}

function firstNonBlank(...values) {
  return values.find((value) => value != null && String(value).trim() !== "");
}

function parseGroupKey(groupKey) {
  if (!groupKey) return {};
  return String(groupKey).split("|").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index <= 0) return acc;
    acc[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    return acc;
  }, {});
}

function pickExtra(extraFields = {}, needles) {
  const extraKeys = Object.keys(extraFields);
  for (const needle of needles) {
    const key = extraKeys.find((item) => item.toLowerCase().includes(needle));
    if (key && extraFields[key] != null && String(extraFields[key]).trim() !== "") return extraFields[key];
  }
  return undefined;
}

function pickGroupValue(groupValues, aliases) {
  const entries = Object.entries(groupValues || {});
  const match = entries.find(([key]) => aliases.some((alias) => key.toLowerCase() === alias.toLowerCase()));
  return match?.[1];
}

function cleanSourceKey(value) {
  if (value == null) return undefined;
  const text = String(value);
  return text.includes("\u001f") ? undefined : text;
}

function normalizeDocumentStatus(status, recordType) {
  const raw = String(status || "").toUpperCase();
  if (recordType === "COMMANDE") return raw === "ANOMALY" ? "OVER_BUDGET" : raw ? "ON_TRACK" : "";
  return raw === "ANOMALY" ? "anomaly" : raw.toLowerCase();
}

function normalizeDocument(document = {}, fallbackRecordType = "INVOICE") {
  const extraFields = document.extraFields || {};
  const groupValues = parseGroupKey(document.groupKey);
  const recordType = String(document.recordType || fallbackRecordType).toUpperCase();
  const sourceKey = cleanSourceKey(document.sourceKey);
  const reference = firstNonBlank(
    document.reference,
    pickExtra(extraFields, ["ref_facture", "reffacture", "facture_ref", "num_facture", "numfacture", "numero_facture", "ref_piece", "piece", "invoice_ref", "commande", "reference"]),
    sourceKey,
    document.invoice_ref,
    document.externalId,
    document.id,
  );
  const supplier = firstNonBlank(
    document.supplier,
    document.supplierName,
    pickGroupValue(groupValues, ["supplier", "supplier_code", "supplierName", "vendor", "vendor_code", "fournisseur"]),
    pickExtra(extraFields, ["supplier", "fournisseur", "vendor"]),
  );
  const label = firstNonBlank(
    document.label,
    pickGroupValue(groupValues, ["label", "category", "categoryName", "libelle"]),
    pickExtra(extraFields, ["label", "libelle", "category"]),
    recordType === "INVOICE" ? document.groupLabel : undefined,
  );
  const budgetCode = firstNonBlank(
    document.budgetCode,
    document.budgetAxisKey,
    pickGroupValue(groupValues, ["budgetCode", "budget_code", "ligne_budgetaire", "budget", "centre", "article"]),
    pickExtra(extraFields, ["budget", "budget_code", "ligne_budgetaire", "centre", "article"]),
    recordType === "COMMANDE" ? document.groupLabel : undefined,
  );
  const date = document.date || document.invoiceDate || document.commandeDate || "";
  const amount = document.amount ?? document.orderedAmount ?? 0;

  return {
    ...document,
    extraFields,
    recordType,
    date,
    amount,
    status: normalizeDocumentStatus(document.status, recordType),
    reference,
    invoice_ref: recordType === "INVOICE" ? firstNonBlank(document.invoice_ref, reference) : document.invoice_ref,
    commandeRef: recordType === "COMMANDE" ? firstNonBlank(document.commandeRef, reference) : document.commandeRef,
    supplier,
    supplierName: firstNonBlank(document.supplierName, supplier),
    label,
    establishment: document.establishment
      || pickExtra(extraFields, ["etablissement", "etab", "jrneta", "societe", "entite", "site", "establishment"]) || "",
    extStatus: document.extStatus
      || document.sourceStatus
      || pickExtra(extraFields, ["epfextsta", "ext_status", "extstatus", "statut_externe", "statut", "etat_workflow", "etat"])
      || document.accountingStatus || "",
    budgetCode,
    orderedAmount: recordType === "COMMANDE" ? amount : document.orderedAmount,
    commandeDate: recordType === "COMMANDE" ? date : document.commandeDate,
  };
}

/** Normalizes invoice identity and workflow fields across tenant-specific ERP exports. */
function normalizeInvoice(invoice = {}) {
  return normalizeDocument(invoice, "INVOICE");
}

/** Normalizes purchase-order documents to the commande row shape expected by the UI. */
function normalizeCommande(commande = {}) {
  return normalizeDocument(commande, "COMMANDE");
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
  const response = await getDocuments({ ...adminParams(tenantId, size), recordType: "INVOICE" });
  const invoices = pageItems(response).map(normalizeInvoice);
  dispatchApp(invoicesCacheUpdated({ tenantId, invoices }));
  return invoices;
}

/** Loads purchase orders for one tenant and tolerates both paged and raw-array API responses. */
export async function loadCommandesForTenant(tenantId, size = 1000) {
  if (!tenantId) return [];
  const response = await getDocuments({ ...adminParams(tenantId, size), recordType: "COMMANDE" });
  const commandes = pageItems(response).map(normalizeCommande);
  const list = Array.isArray(commandes) ? commandes : [];
  dispatchApp(commandesCacheUpdated({ tenantId, commandes: list }));
  return list;
}

/** Loads all document records for one tenant while refreshing the legacy split caches. */
export async function loadDocumentsForTenant(tenantId, size = 1000) {
  if (!tenantId) return [];
  const response = await getDocuments(adminParams(tenantId, size));
  const documents = pageItems(response).map((document) => normalizeDocument(document, document.recordType || "INVOICE"));
  dispatchApp(invoicesCacheUpdated({ tenantId, invoices: documents.filter((document) => document.recordType === "INVOICE") }));
  dispatchApp(commandesCacheUpdated({ tenantId, commandes: documents.filter((document) => document.recordType === "COMMANDE") }));
  return documents;
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
