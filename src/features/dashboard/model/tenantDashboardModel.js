import { BarChart2, Bell, FileText, GitBranch, TriangleAlert } from "lucide-react";
import { CHART_COLORS, COLORS } from "@/constants/colors";

export const TENANT_SECTIONS = [
  { id: "overview", label: "Vue générale", LucideComp: BarChart2 },
  { id: "factures", label: "Factures", LucideComp: FileText },
  { id: "anomalies", label: "Anomalies", LucideComp: TriangleAlert },
  { id: "pipelines", label: "Pipelines", LucideComp: GitBranch },
  { id: "alertes", label: "Alertes", LucideComp: Bell },
];

export function severityColor(severity) {
  const value = String(severity || "").toUpperCase();
  return value === "CRITIQUE" ? COLORS.red : value === "ALERTE" ? COLORS.warning : COLORS.info;
}

export function severityLabel(severity) {
  const value = String(severity || "").toUpperCase();
  return value === "CRITIQUE" ? "Critique" : value === "ALERTE" ? "Alerte" : value === "OK" ? "OK" : severity;
}

export function buildTenantDashboardData({ stats, charts, pipelines, monthlyTrend }) {
  const invoiceCount = stats?.invoicesCount ?? 0;
  const anomalyCount = stats?.anomaliesCount ?? 0;
  const anomalyRate = invoiceCount ? anomalyCount / invoiceCount : 0;
  const totalAmount = stats?.totalInvoiceAmount ?? 0;
  const anomalyAmount = stats?.anomalyInvoiceAmount ?? 0;
  const alertsTotal = charts?.alertsTotal ?? 0;
  const criticalAlertsCount = charts?.alertsCritical ?? 0;
  const unreadAlertsCount = alertsTotal;
  const treatedAlertsCount = 0;
  const activePipelines = pipelines.filter((pipeline) => pipeline.status === "actif");
  const anomTypeData = (stats?.anomaliesByType ?? []).map((bucket, index) => ({
    type: bucket.type,
    count: bucket.count,
    pct: bucket.count / Math.max(1, anomalyCount),
    color: [COLORS.red, COLORS.warning, COLORS.info, COLORS.purple][index % 4],
  }));
  const supplierData = charts?.supplierBreakdown ?? [];
  const suppliersCount = charts?.suppliersCount ?? 0;
  const topSuppliersByAnomaly = [...supplierData].sort((a, b) => b.anomalies - a.anomalies).slice(0, 6);
  const buckets = charts?.amountDistribution ?? [];
  const scatterAll = charts?.scatter ?? [];
  const normalScatter = scatterAll.filter((item) => !item.isAnomaly);
  const anomalyScatter = scatterAll.filter((item) => item.isAnomaly);
  const radarData = charts?.pipelineRadar ?? [];
  const radarPipelines = charts?.radarPipelines ?? [];
  const composedData = monthlyTrend.map((item) => ({
    ...item,
    normalAmt: Math.round(item.amount - item.anomalyAmount),
    anomalyAmt: Math.round(item.anomalyAmount),
  }));
  const sevData = (charts?.alertsBySeverity ?? []).map((item) => ({
    s: severityLabel(item.type),
    c: item.count,
    color: severityColor(item.type),
  }));
  const alertTypeData = (charts?.alertsByType ?? []).map((item, index) => ({
    type: item.type,
    count: item.count,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return {
    invoiceCount,
    anomalyCount,
    anomalyRate,
    totalAmount,
    anomalyAmount,
    alertsTotal,
    criticalAlertsCount,
    unreadAlertsCount,
    treatedAlertsCount,
    activePipelines,
    anomTypeData,
    supplierData,
    suppliersCount,
    topSuppliersByAnomaly,
    buckets,
    normalScatter,
    anomalyScatter,
    radarData,
    radarPipelines,
    composedData,
    sevData,
    alertTypeData,
  };
}
