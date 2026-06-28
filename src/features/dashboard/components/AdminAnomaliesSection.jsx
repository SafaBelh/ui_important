import { TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS } from "@/constants/colors";
import { CustomTip } from "@/shared/ui/CustomTip";
import { AdminSectionDivider } from "@/features/dashboard/components/AdminDashboardChrome";
import { normalizeAnomalyType } from "@/features/dashboard/model/adminDashboardModel";
import styles from "./AdminAnomaliesSection.module.css";

const renderLegendText = (value) => <span className={styles.legendText}>{value}</span>;

export function AdminAnomaliesSection({
  totalAnomalyCount,
  overallAnomalyRate,
  anomTypeData,
  composedData,
  clientAnomalyData,
  allAlerts,
  tenantStatsById,
  enrichedTenants,
}) {
  const severityMap = {};
  allAlerts.forEach((alert) => {
    severityMap[alert.severity] = (severityMap[alert.severity] || 0) + 1;
  });

  const severityData = Object.entries(severityMap).map(([severity, count]) => ({
    severity,
    count,
    color: severity === "critical" ? COLORS.red : severity === "warning" ? COLORS.warning : COLORS.info,
  }));

  const anomalyMetrics = ["montant", "doublon", "fréquence"];
  const tenantTypeCounts = (tenantId) => {
    const counts = {};
    (tenantStatsById[tenantId]?.anomaliesByType ?? []).forEach((typeCount) => {
      counts[normalizeAnomalyType(typeCount.type)] = typeCount.count;
    });
    return counts;
  };
  const anomalyRadarData = anomalyMetrics.map((type) => ({
    type,
    ...Object.fromEntries(
      enrichedTenants.map((tenant) => [tenant.name.slice(0, 8), tenantTypeCounts(tenant.id)[type] || 0])
    ),
  }));

  const activeAlerts = allAlerts.filter((alert) => !alert.read && alert.status !== "READ").slice(0, 12);

  return (
    <div className="fade-in">
      <AdminSectionDivider label="Analyse des anomalies" lucide={TriangleAlert} />

      <div className={styles.kpiGrid}>
        {[
          { label: "Total anomalies", val: totalAnomalyCount, tone: "red" },
          { label: "Taux global", val: `${overallAnomalyRate}%`, tone: "warning" },
          { label: "Montant (mont.)", val: anomTypeData.find((item) => item.type === "montant")?.count || 0, tone: "red" },
          { label: "Doublons", val: anomTypeData.find((item) => item.type === "doublon")?.count || 0, tone: "warning" },
          { label: "Fréquence", val: anomTypeData.find((item) => item.type === "fréquence")?.count || 0, tone: "info" },
        ].map((kpi) => (
          <div key={kpi.label} className={`glass-card-sm ${styles.kpiCard}`}>
            <div className={`${styles.kpiValue} ${styles[kpi.tone]}`}>{kpi.val}</div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.primaryGrid}>
        <div className={`glass-card ${styles.card}`}>
          <div className={styles.cardTitle}>Évolution anomalies · 12 mois</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={composedData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="adAnom2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="adRate2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.warning} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={COLORS.warning} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: COLORS.grey400 }} tickLine={false} axisLine={false} width={35} />
              <Tooltip content={<CustomTip />} />
              <Legend formatter={renderLegendText} />
              <Area yAxisId="left" type="monotone" dataKey="anomalies" name="Anomalies" stroke={COLORS.red} fill="url(#adAnom2)" strokeWidth={2} />
              <Area yAxisId="right" type="monotone" dataKey="rate" name="Taux %" stroke={COLORS.warning} fill="url(#adRate2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={`glass-card ${styles.card}`}>
          <div className={styles.cardTitle}>Taux par entité</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={clientAnomalyData} margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`${value}%`, "Taux"]} />
              <Bar dataKey="rate" name="Taux anomalies" radius={[6, 6, 0, 0]}>
                {clientAnomalyData.map((item) => <Cell key={item.name} fill={item.color} />)}
                <LabelList dataKey="rate" position="top" formatter={(value) => `${value}%`} className={styles.rateLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.secondaryGrid}>
        <div className={`glass-card ${styles.card}`}>
          <div className={styles.cardTitle}>Distribution sévérité des alertes</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={severityData} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} startAngle={90} endAngle={450}>
                {severityData.map((item) => <Cell key={item.severity} fill={item.color} />)}
                <LabelList dataKey="severity" position="outside" className={styles.severityLabel} />
              </Pie>
              <Tooltip formatter={(value, name) => [value + " alertes", name]} />
              <Legend formatter={renderLegendText} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={`glass-card ${styles.card}`}>
          <div className={styles.cardTitle}>Profil anomalies par tenant (radar)</div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart cx="50%" cy="50%" outerRadius={80} data={anomalyRadarData}>
              <PolarGrid stroke={COLORS.grey200} />
              <PolarAngleAxis dataKey="type" tick={{ fill: COLORS.grey600, fontSize: 11, fontWeight: 600 }} />
              <PolarRadiusAxis tick={{ fill: COLORS.grey400, fontSize: 8 }} />
              {enrichedTenants.map((tenant) => (
                <Radar key={tenant.id} name={tenant.name} dataKey={tenant.name.slice(0, 8)} stroke={tenant.color} fill={tenant.color} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Legend formatter={renderLegendText} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`glass-card ${styles.card}`}>
        <div className={styles.cardTitle}>Alertes actives · toutes entités</div>
        <div className={styles.alertList}>
          {activeAlerts.map((alert) => {
            const isCritical = alert.severity === "critical";
            const isWarning = alert.severity === "warning";
            return (
              <div key={alert.id} className={`${styles.alertItem} ${isCritical ? styles.criticalAlert : isWarning ? styles.warningAlert : styles.infoAlert}`}>
                <div className={styles.alertDot} />
                <div className={styles.alertContent}>
                  <div className={styles.alertMessage}>{alert.message}</div>
                  <div className={styles.alertTimestamp}>{new Date(alert.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
                </div>
                <span className={`badge badge-${isCritical ? "red" : isWarning ? "warn" : "info"} ${styles.alertBadge}`}>
                  {alert.type || alert.category || alert.severity}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
