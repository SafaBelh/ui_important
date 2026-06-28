import { Database, Layers } from "lucide-react";

export const BUDGET_DATE_MODES = [
  { id: "YEAR_COLUMN", label: "Colonne année", hint: "ex: budgets.year" },
  { id: "START_END_COLUMNS", label: "Début + Fin", hint: "période par ligne" },
  { id: "DATE_COLUMN", label: "Colonne date", hint: "une date par ligne" },
  { id: "NO_DATE", label: "Exercice courant", hint: "aucune colonne date" },
];

export const BUDGET_TARGET_MODES = [
  { id: "TODAY", label: "Aujourd'hui" },
  { id: "END_OF_MONTH", label: "Fin du mois" },
  { id: "END_OF_YEAR", label: "Fin d'année" },
  { id: "CUSTOM", label: "Date…" },
];

export const BUDGET_KIND_META = {
  COMMANDE: { label: "Commandes", color: "#3B82F6", Icon: Layers },
  FACTURE: { label: "Factures", color: "#D94F3D", Icon: Database },
};

export const BUDGET_STATUS_META = {
  ok: { label: "OK", color: "#22c55e" },
  warning: { label: "Attention", color: "#f59e0b" },
  exceeded: { label: "Dépassé", color: "#D94F3D" },
};

export function defaultBudgetTemplate() {
  return {
    enabled: true,
    mode: "BY_AXES",
    budgetSource: { table: "", allocatedAmountColumn: "", dateMode: "NO_DATE", fiscalYearStartMonth: 1, fiscalSourceMode: "MANUAL", fiscalTable: "", fiscalStartColumn: "", fiscalEndColumn: "", fiscalTenantColumn: "", tenantColumn: "", yearColumn: "", startDateColumn: "", endDateColumn: "", dateColumn: "", currencyColumn: "", labelColumn: "" },
    axes: [],
    consumptionSources: [
      { kind: "COMMANDE", enabled: false, table: "", amountColumn: "", dateColumn: "", statusColumn: "", supplierColumn: "", idColumn: "", tenantColumn: "", finalStatuses: [], axisMappings: {}, joins: [], settlementTable: "", settlementLinkColumn: "", sourceKeyColumn: "", settlementStatusColumn: "", settlementFinalStatuses: [] },
      { kind: "FACTURE", enabled: false, table: "", amountColumn: "", dateColumn: "", statusColumn: "", supplierColumn: "", idColumn: "", tenantColumn: "", finalStatuses: [], axisMappings: {}, joins: [], settlementTable: "", settlementLinkColumn: "", sourceKeyColumn: "", settlementStatusColumn: "", settlementFinalStatuses: [] },
    ],
    formula: { mode: "DEFAULT", tokens: [], includeCommandes: true, includeFactures: true },
    forecast: { defaultTargetDateMode: "END_OF_YEAR", seasonalityMode: "SERIES", ignoredYears: [], ignoredYearNotes: {} },
    previewSettings: { limit: 50, sampleAxes: [] },
  };
}

export function migrateLegacyBudget(data) {
  const template = defaultBudgetTemplate();
  if (data.budgetSourceTables?.length) template.budgetSource.table = data.budgetSourceTables[0];
  if (data.budgetFormula?.length) {
    template.formula.mode = "CUSTOM";
    template.formula.tokens = data.budgetFormula;
  }
  return template;
}

export function suggestBudgetTemplate(tables = []) {
  const colsOf = (table) => (table?.cols || []).map((column) => (typeof column === "string" ? column : column.name));
  const find = (pattern, list) => list.find((item) => pattern.test(String(item)));
  const budgetTable = tables.find((table) => /budget/i.test(table.name));
  if (!budgetTable) return null;
  const budgetColumns = colsOf(budgetTable);
  const template = defaultBudgetTemplate();
  template.budgetSource.table = budgetTable.name;
  template.budgetSource.allocatedAmountColumn = find(/allou|alloc/i, budgetColumns) || find(/amount|montant|total/i, budgetColumns) || "";
  const yearColumn = find(/^year$|annee|exercice/i, budgetColumns);
  if (yearColumn) { template.budgetSource.dateMode = "YEAR_COLUMN"; template.budgetSource.yearColumn = yearColumn; }
  template.budgetSource.labelColumn = find(/label|libelle|designation/i, budgetColumns) || "";
  template.axes = budgetColumns.filter((column) => /ligne_budgetaire|cle_budgetaire|centre|article|pointeur/i.test(column)).map((column) => ({ key: column, label: column, budgetColumn: column, type: "string" }));
  const wire = (kind, tablePattern, datePattern, finalStatus) => {
    const table = tables.find((item) => tablePattern.test(item.name) && !/budget/i.test(item.name));
    const source = template.consumptionSources.find((item) => item.kind === kind);
    if (!table || !source) return;
    const columns = colsOf(table);
    source.table = table.name;
    source.amountColumn = find(/^amount$|montant|total/i, columns) || "";
    source.dateColumn = find(datePattern, columns) || find(/date/i, columns) || "";
    source.statusColumn = find(/^status$|statut/i, columns) || "";
    if (source.statusColumn) source.finalStatuses = [finalStatus];
    source.axisMappings = {};
    template.axes.forEach((axis) => { if (columns.includes(axis.budgetColumn)) source.axisMappings[axis.key] = axis.budgetColumn; });
    const allMapped = template.axes.every((axis) => source.axisMappings[axis.key]);
    source.enabled = Boolean(source.amountColumn && source.dateColumn && (template.axes.length === 0 || allMapped));
  };
  wire("COMMANDE", /commande/i, /date_cmd|date_commande/i, "LIVRE");
  wire("FACTURE", /facture/i, /^date$|date_fact/i, "COMPTABILISE");
  const cmdSource = template.consumptionSources.find((item) => item.kind === "COMMANDE");
  const factSource = template.consumptionSources.find((item) => item.kind === "FACTURE");
  if (cmdSource?.table && factSource?.table) {
    const factColumns = colsOf(tables.find((table) => table.name === factSource.table));
    const cmdColumns = colsOf(tables.find((table) => table.name === cmdSource.table));
    const linkColumn = find(/commande/i, factColumns);
    const keyColumn = find(/^commande_id$/i, cmdColumns) || find(/commande_id|^id$/i, cmdColumns);
    if (linkColumn && keyColumn) {
      cmdSource.settlementTable = factSource.table;
      cmdSource.settlementLinkColumn = linkColumn;
      cmdSource.sourceKeyColumn = keyColumn;
      cmdSource.settlementStatusColumn = factSource.statusColumn || "";
      cmdSource.settlementFinalStatuses = factSource.statusColumn ? ["COMPTABILISE_CMD", "COMPTABILISE"] : [];
    }
  }
  return template;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function budgetTargetDate(mode, custom) {
  const now = new Date();
  if (mode === "TODAY") return isoDate(now);
  if (mode === "END_OF_MONTH") return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (mode === "CUSTOM" && custom) return custom;
  return `${now.getFullYear()}-12-31`;
}

export const fmtBudget = (value) => (value == null || Number.isNaN(Number(value))) ? "—" : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
