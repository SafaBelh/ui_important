/* eslint-disable react-refresh/only-export-components */
import { Clock, Database, Layers } from "lucide-react";

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
  FACTURE_EN_COURS: { label: "Factures en cours", color: "#F59E0B", Icon: Clock },
};

export const BUDGET_POINTER_OPTIONS = [
  { id: "consumptionRate", label: "Taux de consommation", hint: "liquidé / alloué" },
  { id: "factureEnCours", label: "Facture en cours", hint: "INVOICE non validée" },
  { id: "disponibleProjete", label: "Disponible projeté", hint: "restant - engagé - facture en cours" },
  { id: "monthlyBurn", label: "Burn mensuel", hint: "rythme réel par mois" },
  { id: "yearEndProjection", label: "Projection fin d'année", hint: "liquidé projeté + engagé + facture en cours" },
];

export const DEFAULT_BUDGET_POINTERS = BUDGET_POINTER_OPTIONS.map((item) => item.id);

export const FIXED_BUDGET_FORMULA = { mode: "DEFAULT", includeOrders: false, includeFactures: true };

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
    consumptionSources: [],
    formula: FIXED_BUDGET_FORMULA,
    forecast: { defaultTargetDateMode: "END_OF_YEAR", seasonalityMode: "SERIES", ignoredYears: [], ignoredYearNotes: {} },
    previewSettings: { limit: 50, sampleAxes: DEFAULT_BUDGET_POINTERS },
  };
}

export function migrateLegacyBudget(data) {
  const template = defaultBudgetTemplate();
  if (data.budgetSourceTables?.length) template.budgetSource.table = data.budgetSourceTables[0];
  return template;
}

export function deterministicBudgetTemplate(template = defaultBudgetTemplate()) {
  return {
    ...defaultBudgetTemplate(),
    ...template,
    budgetSource: { ...defaultBudgetTemplate().budgetSource, ...(template.budgetSource || {}) },
    consumptionSources: [],
    formula: FIXED_BUDGET_FORMULA,
    forecast: { ...defaultBudgetTemplate().forecast, ...(template.forecast || {}) },
    previewSettings: {
      ...defaultBudgetTemplate().previewSettings,
      ...(template.previewSettings || {}),
    },
  };
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
