import { CHART_COLORS, COLORS } from "@/constants/colors";

/** Returns a stable chart color for a supplier based on its top-list position. */
export const supplierColor = (supplierId, topSuppliers) => {
  const supplierIndex = (topSuppliers || []).indexOf(supplierId);
  return supplierIndex >= 0 ? CHART_COLORS[supplierIndex % CHART_COLORS.length] : CHART_COLORS[4];
};

/** Formats euro amounts compactly for chart axes and KPI cards. */
export const formatCompactEuro = (value) =>
  value >= 1e6 ? `€${(value / 1e6).toFixed(1)}M` : value >= 1000 ? `€${(value / 1000).toFixed(0)}K` : `€${value}`;

/** Formats a euro amount with French thousands separators used by the product UI. */
export const formatEuro = (value) => `€${Number(value).toLocaleString("fr-FR")}`;

/** Maps backend/UI severity labels to the shared status colors. */
export const severityColor = (severity) =>
  severity === "critical" || severity === "CRITIQUE"
    ? COLORS.red
    : severity === "warning" || severity === "ALERTE"
      ? COLORS.warning
      : COLORS.success;
