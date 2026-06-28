import { GitBranch } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/shared/ui/Badge";
import { CHART_COLORS, COLORS } from "@/constants/colors";
import { ChartSectionDivider } from "@/features/dashboard/components/TenantDashboardChrome";
import styles from "./TenantPipelinesSection.module.css";

export function TenantPipelinesSection({ pipelines, radarData, radarPipelines }) {
  return (
    <div className="fade-in">
      <ChartSectionDivider label="Vos pipelines" LucideComp={GitBranch} />

      <div className={styles.chartGrid}>
        <div className={`glass-card ${styles.card}`}>
          <div className={styles.sectionTitle}>Radar · santé des pipelines</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart cx="50%" cy="50%" outerRadius={100} data={radarData}>
                <PolarGrid stroke={COLORS.grey200} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: COLORS.grey600, fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: COLORS.grey400, fontSize: 8 }} />
                {radarPipelines.map((name, index) => <Radar key={name} name={name} dataKey={name} stroke={CHART_COLORS[index % CHART_COLORS.length]} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.12} strokeWidth={2} />)}
                <Legend />
                <Tooltip formatter={(value) => [`${value}/100`]} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.emptyState}>Aucun pipeline</div>
          )}
        </div>

        <div className={`glass-card ${styles.card}`}>
          <div className={styles.sectionTitle}>Taux d'anomalies par pipeline</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelines.map((pipeline) => ({ name: pipeline.name.slice(0, 16), rate: parseFloat((pipeline.anomalyRate * 100).toFixed(2)), inv: pipeline.invoicesProcessed }))} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} width={100} />
              <Tooltip formatter={(value) => [`${value}%`, "Taux"]} />
              <Bar dataKey="rate" name="Taux anomalies" radius={[0, 6, 6, 0]}>
                {pipelines.map((pipeline) => <Cell key={pipeline.id} fill={pipeline.anomalyRate > 0.02 ? COLORS.red : pipeline.anomalyRate > 0.015 ? COLORS.warning : COLORS.success} />)}
                <LabelList dataKey="rate" position="right" formatter={(value) => `${value}%`} className={styles.rateLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`glass-card ${styles.card}`}>
        <div className={styles.sectionTitle}>Détail des pipelines</div>
        <div className={styles.tableScroller}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headerRow}>
                {["Pipeline", "Connecteur", "Fréquence", "Factures", "K-Factor", "Tolérance", "Taux", "Statut", "Dernière exéc."].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {pipelines.map((pipeline) => (
                <tr key={pipeline.id} className={`table-row ${styles.dataRow}`}>
                  <td className={styles.pipelineName}>{pipeline.name}</td>
                  <td><Badge type="mute">{pipeline.connector}</Badge></td>
                  <td className={styles.frequency}>{pipeline.freq}</td>
                  <td className={styles.invoiceCount}>{pipeline.invoicesProcessed.toLocaleString("fr-FR")}</td>
                  <td className={styles.kFactor}>{pipeline.kFactor.toFixed(1)}</td>
                  <td className={styles.tolerance}>{pipeline.tolerancePct}%</td>
                  <td><span className={pipeline.anomalyRate > 0.02 ? styles.anomalyHigh : styles.anomalyOk}>{(pipeline.anomalyRate * 100).toFixed(2)}%</span></td>
                  <td><Badge type={pipeline.status === "actif" ? "ok" : pipeline.status === "warning" ? "warn" : "mute"}>{pipeline.status}</Badge></td>
                  <td className={styles.lastRun}>{pipeline.lastRun ? new Date(pipeline.lastRun).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
