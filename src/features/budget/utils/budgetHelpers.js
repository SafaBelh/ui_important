// Pure helpers, formatters and constants for the budget views. Extracted from BudgetView.
import { COLORS } from "@/constants/colors";
export const MONTH_NAMES_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
// GitHub-style 5-level heat scales — red = réel (passé), blue = projeté (rythme à venir).
export const HEAT_LEVELS = ["rgba(217,79,61,.06)", "rgba(217,79,61,.22)", "rgba(217,79,61,.42)", "rgba(217,79,61,.66)", "rgba(217,79,61,.92)"];
export const HEAT_BLUE = ["rgba(59,130,246,.05)", "rgba(59,130,246,.20)", "rgba(59,130,246,.40)", "rgba(59,130,246,.62)", "rgba(59,130,246,.88)"];
export const heatLevel = (val, max) => (val <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((val / max) * 4))));

export const EMPTY_INVOICES = [];
export const EMPTY_COMMANDES = [];

/* ─────────────────────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────────────────────── */
export const MONTH_NAMES = MONTH_NAMES_FR;
// Distinct short labels — a naive slice(0,3) collides ("Juin"/"Juillet" → both "Jui").
export const MONTH_SHORT_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
export const monthName = (i) => MONTH_NAMES[i] || String(i + 1);
export const monthShort = (i) => MONTH_SHORT_FR[i] || String(i + 1);

export const formatCurrency = (v) =>
  v == null ? "—"
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(v));

export const formatCompactCurrency = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M €`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K €`;
  return `${sign}${Math.round(abs)} €`;
};

export const formatCurrencyDelta = (v, pct) => {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${formatCompactCurrency(v)} (${sign}${pct?.toFixed(1)}%)`;
};

export const formatBudgetComparison = ({ diff, pct, zeroLabel, ratio }) => {
  if (diff == null) return "—";
  if (Math.abs(diff) < 0.5) return ratio != null ? `${zeroLabel} · ${ratio.toFixed(0)}%` : zeroLabel;
  return formatCurrencyDelta(diff, pct);
};

export const formatDisplayDate = (date) => date
  ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date)
  : "—";

export const SPEC_INVOICE_BUDGETS = {};

export const seriesNameForInvoice = (inv) => `${inv.supplier || inv.supplierName} — ${inv.label || "Sans label"}`;
export const CURRENT_EXERCISE_YEAR = new Date().getFullYear();
export const DATA_YEAR = CURRENT_EXERCISE_YEAR;
export const CURRENT_MONTH_IDX = new Date().getMonth();

export function getStatus(real, expected, isFuture) {
  if (isFuture) return "upcoming";
  if (real > expected * 1.05) return "critical";
  if (real < expected * 0.90) return "under";
  return "normal";
}

export const STATUS_META = {
  normal: { label: "Normal", color: COLORS.success, bg: "rgba(34,197,94,.10)", border: "rgba(34,197,94,.30)" },
  critical: { label: "Dépassement", color: COLORS.red, bg: "rgba(217,79,61,.10)", border: "rgba(217,79,61,.30)" },
  under: { label: "Sous-conso", color: COLORS.info, bg: "rgba(59,130,246,.10)", border: "rgba(59,130,246,.30)" },
  upcoming: { label: "À venir", color: COLORS.grey400, bg: "rgba(0,0,0,.04)", border: "rgba(0,0,0,.12)" },
  in_progress: { label: "En cours", color: COLORS.warning, bg: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.30)" },
};

/* ─────────────────────────────────────────────────────────────
   SEASONAL RISK ENGINE
───────────────────────────────────────────────────────────── */
export function computeSeasonalForecast({ monthlyHistorical, annualBudget }) {
  const avgByMonthIdx = Array.from({ length: 12 }, () => ({ sum: 0, cnt: 0 }));
  Object.entries(monthlyHistorical).forEach(([key, val]) => {
    const mIdx = parseInt(key.slice(5)) - 1;
    if (mIdx >= 0 && mIdx < 12 && val > 0) {
      avgByMonthIdx[mIdx].sum += val;
      avgByMonthIdx[mIdx].cnt += 1;
    }
  });
  const rawAvg = avgByMonthIdx.map(({ sum, cnt }) => cnt > 0 ? sum / cnt : null);
  const scalingFactor = 1;
  const flat = annualBudget / 12;
  return rawAvg.map((avg, mIdx) => ({
    monthIdx: mIdx,
    name: monthShort(mIdx),
    nameFull: monthName(mIdx),
    expected: avg != null ? Math.round(avg) : Math.round(flat),
    flat: Math.round(flat),
    scalingFactor,
    rawAvg: avg,
  }));
}

export function computeSeasonalRisks(seriesStats, allInvoices, nowMonth) {
  return seriesStats
    .filter(s => s.projectedYearTotal > s.annualBudget)
    .map(s => {
      const monthly = s.historicalPattern || Array.from({ length: 12 }, () => 0);
      const futureMonthsAvg = monthly.slice(nowMonth + 1).reduce((a, b) => a + b, 0);
      const totalHistoricalAvg = monthly.reduce((a, b) => a + b, 0) || 1;
      const futureFraction = futureMonthsAvg / totalHistoricalAvg;
      const remaining = s.annualBudget - s.currentYearTotal;
      const pct = s.annualBudget > 0 ? Math.round((s.currentYearTotal / s.annualBudget) * 100) : 0;
      const peakFutureIdx = monthly.reduce((best, v, i) => i > nowMonth && v > (monthly[best] ?? 0) ? i : best, nowMonth + 1);
      return { ...s, futureFraction, futureMonthsAvg, remaining, pct, peakMonth: monthName(peakFutureIdx) };
    });
}


export function computeTenantStats(tenantId, allInvoices, historicalInvoices = []) {
  const nowMonth = CURRENT_MONTH_IDX;
  const dataYear = DATA_YEAR;

  const invoices = allInvoices.filter(
    inv => inv.tenantId === tenantId || inv.tenant_id === tenantId
  );

  const seriesMap = {};
  invoices.forEach(inv => {
    const s = seriesNameForInvoice(inv);
    if (!seriesMap[s]) seriesMap[s] = { name: s, monthly: {} };
    const m = inv.date?.slice(0, 7);
    if (m) seriesMap[s].monthly[m] = (seriesMap[s].monthly[m] || 0) + inv.amount;
  });

  historicalInvoices.forEach(inv => {
    const s = seriesNameForInvoice(inv);
    if (!seriesMap[s]) seriesMap[s] = { name: s, monthly: {} };
  });

  let totalRealized = 0;
  let totalBudget = 0;
  let exceededCount = 0;
  const seriesList = Object.values(seriesMap).map(s => {
    const currentYearTotal = Object.entries(s.monthly)
      .filter(([k]) => k.startsWith(String(dataYear)) && Number(k.slice(5, 7)) <= nowMonth + 1)
      .reduce((a, [, v]) => a + v, 0);

    const historicalByMonth = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));
    historicalInvoices.forEach(inv => {
      if (seriesNameForInvoice(inv) !== s.name || !inv.date) return;
      const idx = Number(inv.date.slice(5, 7)) - 1;
      historicalByMonth[idx].sum += inv.amount;
      historicalByMonth[idx].count += 1;
    });
    const historicalPattern = historicalByMonth.map(({ sum, count }) => count ? sum / count : 0);
    const projectedYearTotal = currentYearTotal + historicalPattern.slice(nowMonth + 1).reduce((a, v) => a + v, 0);
    const autoAnnualBudget = SPEC_INVOICE_BUDGETS[s.name] ?? currentYearTotal;

    totalRealized += currentYearTotal;
    totalBudget += autoAnnualBudget;
    if (projectedYearTotal > autoAnnualBudget) exceededCount++;

    return { name: s.name, currentYearTotal, autoAnnualBudget, projectedYearTotal };
  });

  // Top overrun series for this tenant
  const overrunSeries = seriesList
    .filter(s => s.projectedYearTotal > s.autoAnnualBudget)
    .sort((a, b) => (b.projectedYearTotal - b.autoAnnualBudget) - (a.projectedYearTotal - a.autoAnnualBudget))
    .slice(0, 3);

  const consumptionRate = totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0;
  const ecart = totalRealized - totalBudget;

  return { totalRealized, totalBudget, consumptionRate, ecart, exceededCount, overrunSeries, seriesCount: seriesList.length };
}
