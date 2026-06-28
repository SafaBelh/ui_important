/**
 * Pure data transforms between the IntegrationsView connector-wizard state and the
 * backend API / widgets cache. No React and no component state — just shape mapping.
 * Extracted from IntegrationsView so the view file stays focused on UI.
 */

import { logError } from "@/shared/utils/logError";

// localStorage key the widgets app reads ERP connectors from (best-effort mirror).
const WIDGETS_ERP_STORAGE_KEY = "anomalyiq.erpConnectors";

export function publishErpConnectorsForWidgets(connectors) {
  try {
    const erps = connectors
      .filter(c => (c.category === "erp" || c.connectorType === "ERP" || c.type === "ERP") && c.status !== "coming_soon")
      .map(c => ({
        id: c.id,
        name: c.name,
        logo: c.logo,
        color: c.color,
        category: c.category || "erp",
        status: c.status,
        connectorType: c.connectorType || c.type || "ERP",
        type: c.type || "ERP",
        authType: c.authType,
        description: c.description,
        connectionType: c.connectionType,
        jdbcUrl: c.jdbcUrl,
        jdbcUsername: c.jdbcUsername,
        jdbcPassword: c.jdbcPassword,
        jdbcDriverClassName: c.jdbcDriverClassName,
        apiEndpoint: c.apiEndpoint,
        apiAuthToken: c.apiAuthToken,
        apiResources: c.apiResources || [],
        csvFiles: c.csvFiles || [],
        selectedTables: c.selectedTables || [],
        pipelines: c.pipelines || {},
        pipelineTemplatesJson: c.pipelineTemplatesJson,
        tableRoles: c.tableRoles || {},
        budgetSourceTables: c.budgetSourceTables || [],
        budgetFormula: c.budgetFormula || [],
        customPipelines: c.customPipelines || [],
        tenants: c.tenants || [],
      }));
    localStorage.setItem(WIDGETS_ERP_STORAGE_KEY, JSON.stringify(erps));
  } catch (error) {
    // Widgets sync is best-effort and must not block the integrations page.
    logError("integrations.publishErpConnectorsForWidgets", error);
  }
}

export function normalizeConnectorFromApi(connector = {}) {
  const pipelineTemplates = connector.pipelineTemplates || (connector.pipelineTemplatesJson ? JSON.parse(connector.pipelineTemplatesJson) : {});
  return {
    ...connector,
    category: "erp",
    type: connector.connectorType || connector.type || "ERP",
    connectorType: connector.connectorType || connector.type || "ERP",
    status: connector.status === "ACTIVE" ? "connected" : (connector.status || "connected"),
    connectionType: connector.connectionType || (connector.jdbcUrl ? "jdbc" : connector.apiEndpoint ? "api" : "jdbc"),
    selectedTables: connector.selectedTables || [],
    tableRoles: connector.tableRoles || {},
    budgetSourceTables: connector.budgetSourceTables || [],
    budgetFormula: connector.budgetFormula || [],
    budgetTemplate: connector.budgetTemplate || null,
    widgetConfig: connector.widgetConfig || null,
    customPipelines: connector.customPipelines || [],
    tenants: connector.tenants || [],
    pipelines: pipelineTemplates,
    pipelineTemplatesJson: JSON.stringify(pipelineTemplates || {}),
    // Hydrate the JWT auth fields so the public key + config survive reopen/edit.
    publicKey: connector.publicKey && connector.publicKey !== "N/A" ? connector.publicKey : "",
    issuer: connector.authConfig?.issuer || "",
    audience: connector.authConfig?.audience || "",
    kid: connector.authConfig?.kid || "",
    algorithm: connector.authConfig?.algorithm || "RS256",
  };
}

// The visual join builder stores joins as { type, table, on }. The backend
// query builder needs the canonical { type, toAlias, condition, fromAlias }.
// Emit both so the saved config is unambiguous and works on either reader.
function normalizePipelineTemplateJoins(templates = {}) {
  const out = {};
  for (const [key, pl] of Object.entries(templates || {})) {
    if (!pl || typeof pl !== "object") { out[key] = pl; continue; }
    const tbls = Array.isArray(pl.tables) ? pl.tables : [];
    const base = tbls.length ? tbls[0] : null;
    const joins = (pl.joins || []).map((j, idx) => ({
      ...j,
      type: j.type || "INNER",
      // Chained joins (A→B→C): the from-table is the one the user picked (j.from),
      // else the base. The backend uses the explicit ON, but fromAlias keeps the chain intent.
      fromAlias: j.from || j.fromAlias || base || null,
      // Positional fallback recovers the target table for configs saved with an
      // empty join.table by the earlier serialization bug (joins are ordered for tables[1..]).
      toAlias: j.toAlias || j.table || tbls[idx + 1] || null,
      condition: j.condition || j.on || null,
    }));
    out[key] = { ...pl, joins };
  }
  return out;
}

export function toConnectorApiPayload(connector = {}) {
  const pipelineTemplates = normalizePipelineTemplateJoins(connector.pipelineTemplates || connector.pipelines || {});
  return {
    id: connector.id,
    name: connector.name,
    connectorType: connector.connectorType || connector.type || "ERP",
    authType: connector.authType || "NONE",
    publicKey: connector.publicKey || "N/A",
    // JWT verification config (issuer/audience/kid/algorithm) for the ERP public key.
    authConfig: {
      issuer: connector.issuer || null,
      audience: connector.audience || null,
      kid: connector.kid || null,
      algorithm: connector.algorithm || "RS256",
    },
    color: connector.color,
    logo: connector.logo,
    description: connector.description,
    connectionType: connector.connectionType || "jdbc",
    jdbcUrl: connector.jdbcUrl,
    jdbcUsername: connector.jdbcUsername,
    jdbcPassword: connector.jdbcPassword,
    jdbcDriverClassName: connector.jdbcDriverClassName || "org.postgresql.Driver",
    apiEndpoint: connector.apiEndpoint,
    apiAuthHeader: connector.apiAuthHeader,
    apiAuthToken: connector.apiAuthToken,
    selectedTables: connector.selectedTables || [],
    tableRoles: connector.tableRoles || {},
    budgetSourceTables: connector.budgetSourceTables || [],
    budgetFormula: connector.budgetFormula || [],
    customPipelines: connector.customPipelines || [],
    tenants: connector.tenants || [],
    pipelineTemplates,
    budgetTemplate: connector.budgetTemplate,
    widgetConfig: connector.widgetConfig,
    tenantDefaults: connector.tenantDefaults,
    // Discovered schema FK relations → connector-level joins the backend can use
    // to reconstruct a pipeline's JOIN graph when per-pipeline joins are missing.
    // Only sent when relations were (re)discovered, so an edit that skips discovery
    // doesn't overwrite the stored relations (backend guards null = keep existing).
    ...((connector.schemaRels && connector.schemaRels.length) ? {
      schemaTables: (connector.selectedTables || []).map(n => ({ name: n, alias: String(n).toLowerCase() })),
      schemaJoins: connector.schemaRels
        .filter(r => r && r.from && r.to && r.col)
        .map(r => ({ type: "LEFT", fromAlias: r.from, toAlias: r.to, condition: `${r.from}.${r.col} = ${r.to}.${r.toCol || r.col}` })),
    } : {}),
  };
}
