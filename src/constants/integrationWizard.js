import { Calculator, Database, GitBranch, Layers, Network, Plug, Sparkles, Tag } from "lucide-react";

export const AUTH_FIELDS = {
  NONE: [],
  BASIC: ["username", "password"],
  API_KEY: ["apiKey"],
  OAUTH2: ["clientId", "clientSecret", "tokenUrl"],
};

export const PIPELINE_DEFS = {
  facture: {
    label: "Factures",
    color: "#D94F3D",
    Icon: Database,
    defaultGroupByCols: ["supplierName", "label"],
    fixedFields: ["date", "amount", "supplierName", "label", "status"],
  },
  commande: {
    label: "Commandes",
    color: "#3B82F6",
    Icon: Layers,
    defaultGroupByCols: ["budgetCode"],
    fixedFields: ["date", "amount", "status", "budgetCode"],
  },
};

export const CONNECTOR_CONFIG = {
  step7_templates: {
    facture: { enabled: true, groupByCols: PIPELINE_DEFS.facture.defaultGroupByCols },
    commande: { enabled: true, groupByCols: PIPELINE_DEFS.commande.defaultGroupByCols },
  },
};

export const GENERIC_SCHEMA = { tables: [], rels: [] };
export const TABLE_PALETTE = [
  { fill: "#D94F3D", light: "#fca5a5", dark: "#b33b2d" },
  { fill: "#3B82F6", light: "#93c5fd", dark: "#1d4ed8" },
  { fill: "#22C55E", light: "#86efac", dark: "#15803d" },
  { fill: "#F59E0B", light: "#fcd34d", dark: "#b45309" },
  { fill: "#8B5CF6", light: "#c4b5fd", dark: "#6d28d9" },
];
export const BUDGET_PRESETS = { generic: [] };
export const ERD_OFFSETS = {};
export const CUSTOM_PIPELINE_COLORS = ["#8B5CF6", "#14B8A6", "#F97316", "#EC4899"];

export const WIZARD_STEPS = [
  { id: 1, label: "Identité", Icon: Tag },
  { id: 2, label: "Connexion", Icon: Plug },
  { id: 3, label: "Exploration", Icon: Network },
  { id: 4, label: "Pipelines", Icon: GitBranch },
  { id: 5, label: "Budget", Icon: Calculator },
  { id: 6, label: "Tenants", Icon: Layers },
  { id: 7, label: "Aperçu", Icon: Sparkles },
  { id: 8, label: "Résumé", Icon: Database },
];

export const CARD_W = 260;
export const MAX_COLS = 6;
export const PAD = 28;

export function inferColType(name = "") {
  const value = String(name).toLowerCase();
  if (value.includes("date")) return "date";
  if (value.includes("amount") || value.includes("montant") || value.includes("total")) return "number";
  if (value.includes("id") || value.includes("ref")) return "id";
  return "string";
}

export function normalizeTableName(name = "") {
  return String(name).trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").toUpperCase();
}

export function buildCsvSchema(files = []) {
  return {
    tables: files.map((file) => ({
      name: normalizeTableName(file.tableName || file.name || "CSV_TABLE"),
      cols: file.cols || file.columns || [],
      rowCount: file.rowCount || 0,
    })),
    rels: [],
  };
}

export function buildApiSchema(resources = []) {
  return {
    tables: resources.map((resource) => ({
      name: normalizeTableName(resource.name || resource.path || "API_RESOURCE"),
      cols: resource.cols || [],
      rowCount: resource.rowCount || 0,
    })),
    rels: [],
  };
}

export function inferSchemaRelations(tables = [], existingRels = []) {
  const tableMap = new Map(tables.map(table => [String(table.name), new Set((table.cols || []).map(String))]));
  const tableNames = [...tableMap.keys()];
  const existingKeys = new Set((existingRels || []).map(rel => `${rel.from}:${rel.to}:${rel.col}`));
  const inferred = [...(existingRels || [])];
  const knownTargets = {
    supplier_code: "suppliers",
    category_code: "categories",
    facture_id: "factures",
    ligne_budgetaire: "budgets",
    budget_id: "budgets",
    tenant_id: null,
  };
  const findTarget = (from, col) => {
    const lower = String(col).toLowerCase();
    const known = knownTargets[lower];
    if (known) return tableNames.find(name => name.toLowerCase() === known && name !== from);
    if (!lower.endsWith("_id") && !lower.endsWith("_code")) return null;
    const base = lower.replace(/_(id|code)$/, "");
    return tableNames.find(name => {
      const normalized = name.toLowerCase();
      return name !== from && (normalized === base || normalized === `${base}s` || normalized.includes(base));
    });
  };
  const add = (from, to, col, toCol = col, source = "ui_inferred") => {
    if (!from || !to || from === to || !col) return;
    const key = `${from}:${to}:${col}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    inferred.push({ from, to, col, toCol, type: "N:1", source });
  };
  for (const [from, cols] of tableMap.entries()) {
    for (const col of cols) {
      const target = findTarget(from, col);
      if (target && tableMap.get(target)?.has(col)) add(from, target, col);
    }
  }
  return inferred;
}

export function buildWizardDataFromAnswers(answers = {}) {
  return answers;
}

export function getSchemaForUrl() {
  return null;
}

export const CSV_SOURCE_PRESETS = [];
export const DEFAULT_API_RESOURCE = { name: "resource", path: "/api/resource", cols: ["id", "date", "amount", "status"], rowCount: 0 };
export const TENANT_IDS_PLACEHOLDER = "";
export const INTEGRATION_CATEGORIES = [{ id: "all", label: "Tout" }, { id: "erp", label: "ERP" }];
export const INTEGRATION_CONNECTION_TYPES = [
  { id: "jdbc", label: "JDBC", icon: "Database", desc: "Base SQL directe" },
  { id: "api", label: "API REST", icon: "Network", desc: "Endpoint HTTP" },
  { id: "csv", label: "CSV", icon: "Layers", desc: "Import fichier" },
];
export const INTEGRATION_JOIN_TYPES = ["INNER", "LEFT", "RIGHT", "FULL"];
export const INTEGRATION_REPORT_FALLBACK_TENANTS = [];
export const VISUAL_JOIN_PALETTE = [
  { bg: "rgba(217,79,61,.1)", border: "rgba(217,79,61,.35)", text: "#D94F3D" },
  { bg: "rgba(59,130,246,.1)", border: "rgba(59,130,246,.35)", text: "#1d4ed8" },
];

export const JSON_IMPORT_TEMPLATE = {
  identity: { name: "", connectorType: "ERP", authType: "BASIC", logo: "ERP", color: "#D94F3D", description: "" },
  connection: { type: "jdbc", jdbcUrl: "", jdbcUsername: "", jdbcPassword: "" },
  tables: { selected: [], budgetSources: [] },
  pipelines: CONNECTOR_CONFIG.step7_templates,
  tenants: [],
};

export const TENANT_JSON_IMPORT_TEMPLATE = { tenants: [] };
