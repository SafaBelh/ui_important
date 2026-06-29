/**
 * Deterministic ERP connector import: JSON/JSONC parsing, validation, and
 * normalization into the exact IntegrationsView wizard state.
 *
 * This module is intentionally framework-free (no React, no store) so it can be
 * unit-reasoned and reused by the assistant mini chat and by IntegrationsView.
 *
 * IMPORTANT: nothing here persists, deploys, activates or runs anything. It only
 * parses text, reports problems, and produces an in-memory object shaped like the
 * wizard's `data` state (see ConnectorWizardModal). Wizard validations stay active.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * 1. TEMPLATE
 * A complete, generic skeleton covering every field the wizard consumes. The
 * `_docs` block documents each section (strict JSON has no comments). Values are
 * neutral placeholders — NOT hardcoded for any specific ERP.
 * ───────────────────────────────────────────────────────────────────────────── */
export const CONNECTOR_TEMPLATE = {
  _docs: {
    about: "ERP connector config for assistant-driven prefill. Edit the placeholders, then import. Nothing is saved until you review and confirm in the wizard.",
    identity: "name (required), connectorType (ERP|DATA_SOURCE|ACCOUNTING), authType (NONE|BASIC|API_KEY|OAUTH2|JWT_SIGNED|SAML), logo (2 letters), color (#hex), description.",
    connection: "type (jdbc|api|csv). For jdbc: jdbcUrl (required), jdbcUsername, jdbcPassword (kept local, masked in summaries), jdbcDriverClassName. For api: apiEndpoint, apiAuthToken.",
    tenantMatching: "How ERP rows map to platform tenants. platformTenantField = the platform tenant key; externalTenantIdColumn = column holding the ERP tenant id; externalTenantFilter = optional SQL-safe filter value.",
    schema: "tables[].name + columns[]; relations[] declare joins between tables (from/to + columns).",
    pipelines: "facture & commande (and any customPipelines). enabled flag, sourceTables, fieldMappings (logical field -> column), joins, groupBy, conditions, userFields (extra columns), tolerance (anomaly sensitivity).",
    budget: "Budget source table + allocated amount column, fiscal year, and axes (budget dimensions). Consumption is derived by the backend from Documents record_type/is_final.",
    tenants: "One entry per ERP tenant to onboard. externalTenantId (ERP id), platformTenantId (matched platform tenant), storageMode (shared|isolated), per-pipeline statuses.",
    safety: "Table/column names must be SQL-safe identifiers. Blank passwords only produce a warning. Import never deploys/activates/runs anything.",
  },
  identity: {
    name: "My ERP Connector",
    connectorType: "ERP",
    authType: "BASIC",
    logo: "ER",
    color: "#D94F3D",
    description: "ERP connector imported from JSON",
  },
  connection: {
    type: "jdbc",
    jdbcUrl: "jdbc:postgresql://host:5432/erp_db",
    jdbcUsername: "erp_user",
    jdbcPassword: "",
    jdbcDriverClassName: "org.postgresql.Driver",
    apiEndpoint: "",
    apiAuthToken: "",
  },
  tenantMatching: {
    platformTenantField: "tenant_id",
    externalTenantIdColumn: "tenant_id",
    externalTenantFilter: "",
  },
  schema: {
    tables: [
      { name: "factures", columns: ["id", "date", "amount", "supplier", "status", "tenant_id", "commande_id", "budget_code"] },
      { name: "commandes", columns: ["id", "date", "amount", "status", "budget_code", "tenant_id"] },
      { name: "budgets", columns: ["id", "year", "allocated_amount", "budget_code", "label", "tenant_id"] },
    ],
    relations: [
      { from: "factures", to: "commandes", fromColumn: "commande_id", toColumn: "id", type: "N:1" },
      { from: "commandes", to: "budgets", fromColumn: "budget_code", toColumn: "budget_code", type: "N:1" },
    ],
  },
  pipelines: {
    facture: {
      enabled: true,
      sourceTables: ["factures"],
      fieldMappings: { date: "date", amount: "amount", supplierName: "supplier", status: "status", label: "supplier" },
      joins: [],
      conditions: [],
      groupBy: ["supplierName", "label"],
      userFields: [],
      tolerance: { tolerancePct: 15, kFactor: 3.5 },
    },
    commande: {
      enabled: true,
      sourceTables: ["commandes"],
      fieldMappings: { date: "date", amount: "amount", status: "status", budgetCode: "budget_code" },
      joins: [],
      conditions: [],
      groupBy: ["budgetCode"],
      userFields: [],
      tolerance: { tolerancePct: 20, kFactor: 3.5 },
    },
  },
  customPipelines: [],
  budget: {
    enabled: true,
    mode: "BY_AXES",
    budgetSource: {
      table: "budgets",
      allocatedAmountColumn: "allocated_amount",
      dateMode: "YEAR_COLUMN",
      yearColumn: "year",
      fiscalYearStartMonth: 1,
      fiscalSourceMode: "MANUAL",
      labelColumn: "label",
    },
    axes: [
      { key: "budget_code", label: "Budget code", budgetColumn: "budget_code", type: "string" },
    ],
    consumptionSources: [],
    formula: { mode: "DEFAULT", includeOrders: false, includeFactures: true },
    forecast: { defaultTargetDateMode: "END_OF_YEAR", seasonalityMode: "SERIES" },
  },
  tenants: [
    {
      externalTenantId: "erp_tenant_a",
      label: "Tenant A",
      active: false,
      platformTenantId: null,
      platformTenantName: null,
      storageMode: "shared",
      database: { jdbcUrl: "", jdbcUsername: "", jdbcPassword: "" },
      statuses: {
        facture: { provisional: ["EN_ATTENTE"], final: ["PAYE"], statusColumn: "status" },
        commande: { provisional: ["EN_COURS"], final: ["LIVRE"], statusColumn: "status" },
      },
    },
  ],
};

export function connectorTemplateString() {
  return JSON.stringify(CONNECTOR_TEMPLATE, null, 2);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 2. PARSING (JSONC tolerant)
 * Strips line and block comments and trailing commas without touching string
 * contents, then JSON.parse. Returns a structured result (never throws).
 * ───────────────────────────────────────────────────────────────────────────── */
export function stripJsonc(text = "") {
  let out = "";
  let inString = false;
  let quote = "";
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") { out += next ?? ""; i++; continue; }
      if (c === quote) { inString = false; quote = ""; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; out += c; continue; }
    if (c === "/" && next === "/") { inLine = true; i++; continue; }
    if (c === "/" && next === "*") { inBlock = true; i++; continue; }
    out += c;
  }
  // Remove trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseConnectorConfig(raw = "") {
  if (!raw || !String(raw).trim()) {
    return { ok: false, error: "Le contenu est vide. Collez ou chargez une configuration JSON.", value: null };
  }
  // First try strict JSON (so we surface precise messages for plain JSON), then
  // fall back to JSONC stripping for comment/trailing-comma tolerance.
  try {
    return { ok: true, value: JSON.parse(raw), jsonc: false };
  } catch (strictErr) {
    try {
      const cleaned = stripJsonc(raw);
      return { ok: true, value: JSON.parse(cleaned), jsonc: true };
    } catch (jsoncErr) {
      const msg = jsoncErr?.message || strictErr?.message || "JSON invalide";
      return { ok: false, error: "JSON invalide : " + msg, value: null };
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 3. HELPERS
 * ───────────────────────────────────────────────────────────────────────────── */
const SQL_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSafeSqlIdentifier(name) {
  if (typeof name !== "string") return false;
  const v = name.trim();
  return v.length > 0 && v.length <= 64 && SQL_ID.test(v);
}

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const colName = (c) => (typeof c === "string" ? c : c?.name);
const tableColumns = (t) => asArray(t?.columns || t?.cols).map(colName).filter(Boolean);

function tableNameSet(config) {
  return new Set(asArray(config?.schema?.tables).map((t) => t?.name).filter(Boolean));
}

function columnSetFor(config, tableName) {
  const t = asArray(config?.schema?.tables).find((x) => x?.name === tableName);
  return new Set(tableColumns(t));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 4. VALIDATION
 * Returns { ok, errors[], warnings[], missing[] } where each entry is
 * { stage, path, message }. `ok` is true only when there are zero errors.
 * `knownPlatformTenantIds` (optional) lets callers flag unknown platform tenants.
 * ───────────────────────────────────────────────────────────────────────────── */
export function validateConnectorConfig(config, { knownPlatformTenantIds = null } = {}) {
  const errors = [];
  const warnings = [];
  const missing = [];
  const err = (stage, path, message) => errors.push({ stage, path, message });
  const warn = (stage, path, message) => warnings.push({ stage, path, message });
  const miss = (stage, path, message) => { missing.push({ stage, path, message }); errors.push({ stage, path, message }); };

  // Stage: root shape
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    err("syntax", "$", "La configuration racine doit être un objet JSON.");
    return { ok: false, errors, warnings, missing };
  }

  // Stage: connector identity
  const identity = config.identity || {};
  if (!identity.name || !String(identity.name).trim()) miss("identity", "identity.name", "Le nom du connecteur est requis.");
  if (!identity.connectorType) warn("identity", "identity.connectorType", "Type de connecteur absent — « ERP » sera utilisé par défaut.");
  else if (!["ERP", "DATA_SOURCE", "ACCOUNTING"].includes(identity.connectorType)) warn("identity", "identity.connectorType", `Type « ${identity.connectorType} » inhabituel.`);
  if (identity.authType && !["NONE", "BASIC", "API_KEY", "OAUTH2", "JWT_SIGNED", "SAML"].includes(identity.authType))
    warn("identity", "identity.authType", `Mode d'authentification « ${identity.authType} » non reconnu.`);

  // Stage: platform tenant mapping
  const tm = config.tenantMatching || {};
  if (!tm.platformTenantField) warn("platformTenant", "tenantMatching.platformTenantField", "Champ de correspondance tenant plateforme non défini.");

  // Stage: external tenant mapping
  if (tm.externalTenantIdColumn && !isSafeSqlIdentifier(tm.externalTenantIdColumn))
    err("externalTenant", "tenantMatching.externalTenantIdColumn", `Identifiant SQL non sûr : « ${tm.externalTenantIdColumn} ».`);

  // Stage: connection config shape
  const conn = config.connection || {};
  const connType = conn.type || "jdbc";
  if (!["jdbc", "api", "csv"].includes(connType)) warn("connection", "connection.type", `Type de connexion « ${connType} » non reconnu.`);
  if (connType === "jdbc") {
    if (!conn.jdbcUrl || !String(conn.jdbcUrl).trim()) miss("connection", "connection.jdbcUrl", "URL JDBC requise pour une connexion JDBC.");
    else if (!String(conn.jdbcUrl).startsWith("jdbc:")) warn("connection", "connection.jdbcUrl", "L'URL JDBC ne commence pas par « jdbc: ».");
    if (!conn.jdbcUsername) warn("connection", "connection.jdbcUsername", "Utilisateur JDBC non renseigné.");
    if (!conn.jdbcPassword) warn("connection", "connection.jdbcPassword", "Mot de passe JDBC vide — autorisé, mais à compléter avant déploiement.");
  } else if (connType === "api") {
    if (!conn.apiEndpoint) miss("connection", "connection.apiEndpoint", "Endpoint API requis pour une connexion API.");
  }

  // Stage: table names / SQL identifier safety
  const tables = asArray(config.schema?.tables);
  if (tables.length === 0) warn("tables", "schema.tables", "Aucune table déclarée — le schéma sera vide tant que la connexion n'est pas testée.");
  tables.forEach((t, i) => {
    if (!t?.name) { err("tables", `schema.tables[${i}].name`, "Nom de table manquant."); return; }
    if (!isSafeSqlIdentifier(t.name)) err("tables", `schema.tables[${i}].name`, `Identifiant SQL non sûr : « ${t.name} ».`);
    tableColumns(t).forEach((c) => {
      if (!isSafeSqlIdentifier(c)) err("tables", `schema.tables[${i}].columns`, `Colonne SQL non sûre : « ${c} » (table ${t.name}).`);
    });
  });
  const knownTables = tableNameSet(config);

  // Stage: relation/join config shape
  asArray(config.schema?.relations).forEach((r, i) => {
    if (!r?.from || !r?.to) { warn("relations", `schema.relations[${i}]`, "Relation incomplète (from/to manquant)."); return; }
    if (knownTables.size && !knownTables.has(r.from)) warn("relations", `schema.relations[${i}].from`, `Table « ${r.from} » absente du schéma (relation mismatch).`);
    if (knownTables.size && !knownTables.has(r.to)) warn("relations", `schema.relations[${i}].to`, `Table « ${r.to} » absente du schéma (relation mismatch).`);
  });

  // Stage: pipeline mappings + groupBy + tolerance
  const pipelines = config.pipelines || {};
  const customIds = new Set(asArray(config.customPipelines).map((c) => c?.id).filter(Boolean));
  const enabledKeys = Object.keys(pipelines).filter((k) => pipelines[k] && pipelines[k].enabled !== false);
  if (enabledKeys.length === 0) warn("pipelines", "pipelines", "Aucun pipeline activé.");
  Object.entries(pipelines).forEach(([key, pl]) => {
    if (!pl || typeof pl !== "object") { warn("pipelines", `pipelines.${key}`, "Pipeline ignoré (format invalide)."); return; }
    if (key !== "facture" && key !== "commande" && !customIds.has(key))
      warn("pipelines", `pipelines.${key}`, `Type de pipeline « ${key} » non supporté (attendu: facture, commande, ou un id de customPipelines).`);
    if (pl.enabled === false) return;
    const srcTables = asArray(pl.sourceTables || pl.tables);
    if (srcTables.length === 0) err("pipelines", `pipelines.${key}.sourceTables`, `Pipeline « ${key} » : au moins une table source est requise.`);
    srcTables.forEach((tn) => {
      if (!isSafeSqlIdentifier(tn)) err("pipelines", `pipelines.${key}.sourceTables`, `Table « ${tn} » non sûre (pipeline ${key}).`);
      else if (knownTables.size && !knownTables.has(tn)) warn("pipelines", `pipelines.${key}.sourceTables`, `Table « ${tn} » absente du schéma (pipeline ${key}).`);
    });
    const fm = pl.fieldMappings || {};
    if (!fm.date) warn("pipelines", `pipelines.${key}.fieldMappings.date`, `Pipeline « ${key} » : champ « date » non mappé.`);
    if (!fm.amount) warn("pipelines", `pipelines.${key}.fieldMappings.amount`, `Pipeline « ${key} » : champ « amount » non mappé.`);
    // groupBy fields
    asArray(pl.groupBy || pl.groupByCols).forEach((g) => {
      if (typeof g !== "string" || !g.trim()) warn("groupBy", `pipelines.${key}.groupBy`, `Champ de regroupement vide (pipeline ${key}).`);
    });
    // joins
    asArray(pl.joins).forEach((j, ji) => {
      const on = j?.on || j?.condition;
      const jt = j?.table || j?.toAlias;
      if (!jt) warn("relations", `pipelines.${key}.joins[${ji}]`, `Jointure sans table cible (pipeline ${key}).`);
      if (!on) warn("relations", `pipelines.${key}.joins[${ji}]`, `Jointure sans condition (pipeline ${key}).`);
    });
    // tolerance
    if (pl.tolerance) {
      const tp = pl.tolerance.tolerancePct;
      const kf = pl.tolerance.kFactor;
      if (tp != null && (typeof tp !== "number" || tp < 0 || tp > 100)) warn("tolerance", `pipelines.${key}.tolerance.tolerancePct`, "tolerancePct doit être un nombre entre 0 et 100.");
      if (kf != null && (typeof kf !== "number" || kf <= 0 || kf > 20)) warn("tolerance", `pipelines.${key}.tolerance.kFactor`, "kFactor doit être un nombre raisonnable (0–20).");
    }
  });

  // Stage: budget source / axes. Consumption is derived from Documents.
  const budget = config.budget;
  if (budget && budget.enabled !== false) {
    const bs = budget.budgetSource || {};
    if (!bs.table) miss("budgetSource", "budget.budgetSource.table", "Table source budget requise.");
    else if (!isSafeSqlIdentifier(bs.table)) err("budgetSource", "budget.budgetSource.table", `Table budget non sûre : « ${bs.table} ».`);
    else if (knownTables.size && !knownTables.has(bs.table)) warn("budgetSource", "budget.budgetSource.table", `Table budget « ${bs.table} » absente du schéma.`);
    if (!bs.allocatedAmountColumn) miss("budgetSource", "budget.budgetSource.allocatedAmountColumn", "Colonne du montant alloué requise.");
    const fym = bs.fiscalYearStartMonth;
    if (fym != null && (typeof fym !== "number" || fym < 1 || fym > 12)) warn("budgetSource", "budget.budgetSource.fiscalYearStartMonth", "Le mois de début d'exercice doit être entre 1 et 12.");

    const budgetCols = bs.table ? columnSetFor(config, bs.table) : new Set();
    const axisKeys = new Set();
    asArray(budget.axes).forEach((a, i) => {
      if (!a?.key) { err("budgetAxes", `budget.axes[${i}].key`, "Clé d'axe budgétaire manquante."); return; }
      axisKeys.add(a.key);
      const bc = a.budgetColumn || a.key;
      if (!isSafeSqlIdentifier(bc)) err("budgetAxes", `budget.axes[${i}].budgetColumn`, `Colonne d'axe non sûre : « ${bc} ».`);
      else if (budgetCols.size && !budgetCols.has(bc)) warn("budgetAxes", `budget.axes[${i}].budgetColumn`, `Colonne d'axe « ${bc} » absente de la table budget (budget axis mismatch).`);
    });

    if (asArray(budget.consumptionSources).length > 0) {
      warn("budgetConsumption", "budget.consumptionSources", "Les sources de consommation importées seront ignorées : le budget lit les Documents par record_type/is_final.");
    }
  }

  // Stage: external/unknown tenant + per-tenant shape
  asArray(config.tenants).forEach((t, i) => {
    const tenant = typeof t === "string" ? { externalTenantId: t } : t;
    const ext = tenant.externalTenantId || tenant.id;
    if (!ext) warn("externalTenant", `tenants[${i}].externalTenantId`, "Tenant ERP sans identifiant externe.");
    if (tenant.platformTenantId && Array.isArray(knownPlatformTenantIds) && !knownPlatformTenantIds.includes(tenant.platformTenantId))
      warn("platformTenant", `tenants[${i}].platformTenantId`, `Tenant plateforme « ${tenant.platformTenantId} » introuvable.`);
    if (tenant.storageMode && !["shared", "isolated"].includes(tenant.storageMode))
      warn("externalTenant", `tenants[${i}].storageMode`, `storageMode « ${tenant.storageMode} » non reconnu (shared|isolated).`);
  });

  // Stage: wizard compatibility — must be able to normalize.
  try {
    normalizeConnectorConfig(config);
  } catch (e) {
    err("wizard", "$", "Configuration incompatible avec le wizard : " + (e?.message || e));
  }

  return { ok: errors.length === 0, errors, warnings, missing };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 5. NORMALIZATION → wizard `data` state (ConnectorWizardModal)
 * Produces exactly the keys the wizard's useState initializer uses, plus
 * __importSource / __importedSchema markers the wizard reads for the banner and
 * for seeding the schema preview. NEVER includes an `id` (always a new connector).
 * ───────────────────────────────────────────────────────────────────────────── */
const STD_PIPELINE = () => ({ enabled: true, tables: [], joins: [], conditions: [], fieldMappings: {}, extraFields: [], userFields: [], groupByCols: [] });

// The wizard's field-mapping selects store QUALIFIED column refs ("table.column").
// Imported configs use bare column names ("date"), so we qualify each mapping value to
// the source table that actually contains it (falling back to the first source table) —
// otherwise the select can't match the value and shows "-- Sélectionner colonne --".
function qualifyMappings(fm, sourceTables, schemaTables) {
  if (!fm || typeof fm !== "object") return {};
  const tableCols = new Map((schemaTables || []).map((t) => [t.name, new Set(t.cols || [])]));
  const out = {};
  for (const [k, v] of Object.entries(fm)) {
    if (typeof v !== "string" || !v || v.includes(".")) { out[k] = v; continue; }
    const table = (sourceTables || []).find((t) => tableCols.get(t)?.has(v)) || (sourceTables || [])[0];
    out[k] = table ? `${table}.${v}` : v;
  }
  return out;
}

function normalizePipeline(pl = {}, schemaTables = []) {
  const base = STD_PIPELINE();
  const tables = asArray(pl.sourceTables || pl.tables);
  return {
    ...base,
    enabled: pl.enabled !== false,
    tables,
    joins: asArray(pl.joins).map((j) => ({
      type: j.type || "INNER",
      table: j.table || j.toAlias || "",
      on: j.on || j.condition || "",
      ...(j.fromAlias ? { fromAlias: j.fromAlias } : {}),
    })),
    conditions: asArray(pl.conditions),
    fieldMappings: qualifyMappings(pl.fieldMappings, tables, schemaTables),
    extraFields: asArray(pl.extraFields),
    userFields: asArray(pl.userFields),
    groupByCols: asArray(pl.groupBy || pl.groupByCols).filter(Boolean),
    ...(pl.tolerance ? { tolerance: pl.tolerance } : {}),
  };
}

function defaultBudgetTemplateLocal() {
  return {
    enabled: true,
    mode: "BY_AXES",
    budgetSource: { table: "", allocatedAmountColumn: "", dateMode: "NO_DATE", fiscalYearStartMonth: 1, fiscalSourceMode: "MANUAL", fiscalTable: "", fiscalStartColumn: "", fiscalEndColumn: "", fiscalTenantColumn: "", yearColumn: "", startDateColumn: "", endDateColumn: "", dateColumn: "", currencyColumn: "", labelColumn: "" },
    axes: [],
    consumptionSources: [],
    formula: { mode: "DEFAULT", includeOrders: false, includeFactures: true },
    forecast: { defaultTargetDateMode: "END_OF_YEAR", seasonalityMode: "SERIES", ignoredYears: [], ignoredYearNotes: {} },
    previewSettings: { limit: 50, sampleAxes: [] },
  };
}

function normalizeBudget(budget) {
  if (!budget) return null;
  const tpl = defaultBudgetTemplateLocal();
  const out = {
    ...tpl,
    enabled: budget.enabled !== false,
    mode: budget.mode || tpl.mode,
    budgetSource: { ...tpl.budgetSource, ...(budget.budgetSource || {}) },
    axes: asArray(budget.axes).map((a) => ({ key: a.key, label: a.label || a.key, budgetColumn: a.budgetColumn || a.key, type: a.type || "string" })),
    formula: tpl.formula,
    forecast: { ...tpl.forecast, ...(budget.forecast || {}) },
    previewSettings: { ...tpl.previewSettings, ...(budget.previewSettings || {}) },
  };
  out.consumptionSources = [];
  return out;
}

function normalizeTenant(t, pipelineKeys) {
  const tenant = typeof t === "string" ? { externalTenantId: t } : (t || {});
  const id = tenant.externalTenantId || tenant.id || "";
  const baseStatuses = Object.fromEntries(pipelineKeys.map((k) => [k, { provisional: [], final: [], statusColumn: "" }]));
  return {
    id,
    label: tenant.label || id,
    active: tenant.active === true,
    platformTenantId: tenant.platformTenantId || null,
    platformTenantName: tenant.platformTenantName || null,
    storageMode: tenant.storageMode === "isolated" ? "isolated" : "shared",
    database: {
      jdbcUrl: tenant.database?.jdbcUrl || tenant.jdbcUrl || "",
      jdbcUsername: tenant.database?.jdbcUsername || tenant.jdbcUsername || "",
      jdbcPassword: tenant.database?.jdbcPassword || tenant.jdbcPassword || "",
    },
    statuses: { ...baseStatuses, ...(tenant.statuses || {}) },
  };
}

function importedSchema(config) {
  const tables = asArray(config.schema?.tables)
    .filter((t) => t?.name)
    .map((t) => ({ name: t.name, cols: tableColumns(t), rowCount: t.rowCount || 0 }));
  if (tables.length === 0) return null;
  const rels = asArray(config.schema?.relations)
    .filter((r) => r?.from && r?.to)
    .map((r) => ({ from: r.from, to: r.to, col: r.fromColumn || r.col, toCol: r.toColumn || r.toCol || r.fromColumn || r.col, type: r.type || "N:1", source: "json_import" }));
  return { tables, rels };
}

export function normalizeConnectorConfig(config = {}) {
  const identity = config.identity || {};
  const conn = config.connection || {};
  const pipelinesIn = config.pipelines || {};
  const customPipelines = asArray(config.customPipelines).map((c) => ({ id: c.id, label: c.label || c.id, color: c.color || "#8B5CF6" }));
  const pipelineKeys = ["facture", "commande", ...customPipelines.map((c) => c.id)];

  const schema = importedSchema(config);
  const schemaTables = schema?.tables || [];

  const pipelines = {};
  Object.entries(pipelinesIn).forEach(([key, pl]) => { pipelines[key] = normalizePipeline(pl, schemaTables); });

  const declaredSelected = asArray(config.tables?.selected);
  const selectedTables = declaredSelected.length ? declaredSelected : (schema ? schema.tables.map((t) => t.name) : []);

  const budgetTemplate = normalizeBudget(config.budget);
  const budgetSourceTables = budgetTemplate?.budgetSource?.table
    ? [budgetTemplate.budgetSource.table]
    : asArray(config.tables?.budgetSources);

  const tenantMatching = config.tenantMatching || {};

  return {
    // ── Identity ──
    name: identity.name || "",
    connectorType: identity.connectorType || "ERP",
    authType: identity.authType || "NONE",
    description: identity.description || "",
    color: identity.color || "#D94F3D",
    logo: identity.logo || "",
    // ── Connection ──
    connectionType: conn.type || "jdbc",
    jdbcUrl: conn.jdbcUrl || "",
    jdbcUsername: conn.jdbcUsername || "",
    jdbcPassword: conn.jdbcPassword || "",
    jdbcDriverClassName: conn.jdbcDriverClassName || "org.postgresql.Driver",
    apiEndpoint: conn.apiEndpoint || "",
    apiAuthToken: conn.apiAuthToken || "",
    apiResources: asArray(conn.apiResources),
    csvFiles: asArray(conn.csvFiles),
    // ── Tables / schema ──
    selectedTables,
    tableRoles: config.tableRoles && typeof config.tableRoles === "object" ? config.tableRoles : {},
    // ── Pipelines ──
    pipelines,
    customPipelines,
    // ── Budget ──
    budgetSourceTables,
    budgetAmountCols: [],
    budgetFormula: [],
    budgetPreset: null,
    budgetAgg: "SUM",
    budgetTemplate,
    // ── Tenants ──
    tenants: asArray(config.tenants).map((t) => normalizeTenant(t, pipelineKeys)),
    tenantDefaults: {
      platformTenantField: tenantMatching.platformTenantField || null,
      externalTenantIdColumn: tenantMatching.externalTenantIdColumn || null,
      externalTenantFilter: tenantMatching.externalTenantFilter || null,
    },
    // ── Misc ──
    widgetConfig: null,
    generatedData: {},
    // ── Import markers (read by the wizard; not persisted by toConnectorApiPayload) ──
    __importSource: "assistant-json-import",
    __importedSchema: schema,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 6. Convenience: parse → validate → normalize in one call.
 * ───────────────────────────────────────────────────────────────────────────── */
export function processConnectorImport(raw, opts = {}) {
  const parsed = parseConnectorConfig(raw);
  if (!parsed.ok) {
    return { stage: "parse", ok: false, parseError: parsed.error, validation: null, normalized: null };
  }
  const validation = validateConnectorConfig(parsed.value, opts);
  const normalized = validation.ok ? normalizeConnectorConfig(parsed.value) : null;
  return { stage: "validate", ok: validation.ok, parseError: null, jsonc: parsed.jsonc, config: parsed.value, validation, normalized };
}

/** Build a masked, human-readable summary (passwords never shown). */
export function summarizeConfig(config = {}) {
  const identity = config.identity || {};
  const conn = config.connection || {};
  const pipelineKeys = Object.keys(config.pipelines || {}).filter((k) => config.pipelines[k]?.enabled !== false);
  return {
    name: identity.name || "—",
    connectorType: identity.connectorType || "ERP",
    authType: identity.authType || "NONE",
    connectionType: conn.type || "jdbc",
    jdbcUrl: conn.jdbcUrl || "",
    hasPassword: !!conn.jdbcPassword,
    tables: asArray(config.schema?.tables).length,
    pipelines: pipelineKeys,
    axes: asArray(config.budget?.axes).length,
    tenants: asArray(config.tenants).length,
  };
}
