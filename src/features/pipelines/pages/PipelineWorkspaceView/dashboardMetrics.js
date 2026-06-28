import { CHART_COLORS } from "@/constants/colors";
import { PIPELINE_DASHBOARD_RADAR_METRICS } from "@/constants/uiConstants";

export function buildMonthlyChart(monthly) {
  const months = Array.isArray(monthly?.months) ? monthly.months : [];
  const totals = Array.isArray(monthly?.totals) ? monthly.totals : [];
  return months.map((month, index) => ({ m: month, total: totals[index] || 0 }));
}

export function buildSupplierBarData(supplierCounts) {
  const entries = Array.isArray(supplierCounts)
    ? supplierCounts.map((item, index) => [item.supplier || item.id || `Fournisseur ${index + 1}`, Number(item.count || item.value || 0)])
    : Object.entries(supplierCounts || {}).map(([id, count]) => {
        if (count && typeof count === "object") return [count.supplier || count.id || id, Number(count.count || count.value || 0)];
        return [id, Number(count || 0)];
      });

  return entries
    .filter(([id]) => typeof id === "string" && id.length > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, count]) => ({ id, count }));
}

export function buildRadarData({ supplierBarData, topSuppliers, series, alerts }) {
  const maxCount = Math.max(...supplierBarData.map((supplier) => supplier.count), 1);
  const maxAlerts = Math.max(
    ...topSuppliers.map((id) => {
      const supplierSeries = series.find((item) => item.supplier === id && !item.label);
      return supplierSeries ? alerts.filter((alert) => alert.series_id === supplierSeries.id).length : 0;
    }),
    1,
  );

  return PIPELINE_DASHBOARD_RADAR_METRICS.map((row) => {
    const metricRow = { ...row };

    topSuppliers.forEach((id) => {
      const supplierDatum = supplierBarData.find((supplier) => supplier.id === id);
      const supplierSeries = series.find((item) => item.supplier === id && !item.label);

      if (row.metric === "Volume (factures)") {
        metricRow[id] = supplierDatum ? (supplierDatum.count / maxCount) * 100 : 0;
      } else if (row.metric === "Stabilité (CV)") {
        metricRow[id] = supplierSeries ? Math.max(0, 100 - (supplierSeries.cv || 0) * 150) : 50;
      } else if (row.metric === "Alertes actives") {
        const alertCount = supplierSeries ? alerts.filter((alert) => alert.series_id === supplierSeries.id).length : 0;
        metricRow[id] = maxAlerts ? (alertCount / maxAlerts) * 100 : 0;
      } else if (row.metric === "Taille série") {
        metricRow[id] = supplierSeries ? Math.min(100, (supplierSeries.n / 50) * 100) : 0;
      } else if (row.metric === "Tolérance") {
        metricRow[id] = supplierSeries ? Math.max(0, 100 - (supplierSeries.tolerance_pct || 10) * 2) : 50;
      }
    });

    return metricRow;
  });
}

export function normalizeSeriesForCharts(series) {
  return [...series]
    .map((item) => ({
      ...item,
      cv: item.cv ?? 0,
      mu: item.mu ?? 0,
      tolerance_pct: item.tolerance_pct ?? 10,
      n: item.n ?? 0,
    }))
    .sort((a, b) => b.n - a.n);
}

export function buildCvData(sortedSeries) {
  return sortedSeries.map((item, index) => ({
    name: [item.supplier, item.label].filter(Boolean).join(" · ").slice(0, 18),
    cv: parseFloat((item.cv * 100).toFixed(1)) || 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

export function buildMuData(sortedSeries) {
  return sortedSeries.map((item) => ({
    name: [item.supplier, item.label].filter(Boolean).join(" · ").slice(0, 18),
    mu: Math.round(item.mu),
    low: Math.round(item.mu * (1 - item.tolerance_pct / 100)),
    high: Math.round(item.mu * (1 + item.tolerance_pct / 100)),
  }));
}
