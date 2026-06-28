import { GitBranch } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/shared/ui/Badge";
import { CHART_COLORS, COLORS } from "@/constants/colors";
import { AdminSectionDivider } from "@/features/dashboard/components/AdminDashboardChrome";
import styles from "./AdminPipelinesSection.module.css";

const toneClassByColor = {
  [COLORS.info]: styles.toneInfo,
  [COLORS.success]: styles.toneSuccess,
  [COLORS.warning]: styles.toneWarning,
  [COLORS.grey500]: styles.toneGrey500,
};

const avatarClassByColor = {
  [COLORS.red]: styles.avatarRed,
  [COLORS.info]: styles.avatarInfo,
  [COLORS.success]: styles.avatarSuccess,
  [COLORS.warning]: styles.avatarWarning,
  [COLORS.purple]: styles.avatarPurple,
  [COLORS.teal]: styles.avatarTeal,
  [COLORS.orange]: styles.avatarOrange,
  [COLORS.pink]: styles.avatarPink,
  [COLORS.redMid]: styles.avatarRedMid,
  [COLORS.grey400]: styles.avatarGrey400,
  "#10B981": styles.avatarEmerald,
  "#06B6D4": styles.avatarCyan,
  "#84CC16": styles.avatarLime,
};

const getToneClass = (color) => toneClassByColor[color] || styles.toneInfo;
const getAvatarClass = (color) => avatarClassByColor[color] || styles.avatarGrey400;

export function AdminPipelinesSection({ allPipelines, activePipelineCount, connData, allTenants }) {
  const freqMap = {};
  allPipelines.forEach((pipeline) => { freqMap[pipeline.freq] = (freqMap[pipeline.freq] || 0) + 1; });
  const freqData = Object.entries(freqMap).map(([freq, count], index) => ({ freq, count, color: CHART_COLORS[index % CHART_COLORS.length] }));

  return (
    <div className="fade-in">
      <AdminSectionDivider label="Analyse des pipelines" lucide={GitBranch} />

      <div className={styles.kpiGrid}>
        {[
          { label: "Total pipelines", val: allPipelines.length, color: COLORS.info },
          { label: "Actifs", val: activePipelineCount, color: COLORS.success },
          { label: "En warning", val: allPipelines.filter((pipeline) => pipeline.status === "warning").length, color: COLORS.warning },
          { label: "En pause", val: allPipelines.filter((pipeline) => pipeline.status === "paused").length, color: COLORS.grey500 },
        ].map((kpi) => (
          <div key={kpi.label} className={["glass-card-sm", styles.kpiCard, getToneClass(kpi.color)].join(" ")}>
            <div className={styles.kpiValue}>{kpi.val}</div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={["glass-card", styles.chartCard].join(" ")}>
          <div className={styles.cardTitle}>Taux d'anomalies par pipeline</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={allPipelines.map((pipeline) => ({ name: pipeline.name.slice(0, 14), rate: Number.isFinite(pipeline.anomalyRate) ? parseFloat((pipeline.anomalyRate * 100).toFixed(2)) : 0, status: pipeline.status }))} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip formatter={(value) => [`${value}%`, "Taux anomalies"]} />
              <Bar dataKey="rate" name="Taux %" radius={[0, 6, 6, 0]}>
                {allPipelines.map((pipeline) => <Cell key={pipeline.id} fill={pipeline.status === "actif" ? COLORS.success : pipeline.status === "warning" ? COLORS.warning : COLORS.grey400} />)}
                <LabelList dataKey="rate" position="right" formatter={(value) => `${value}%`} className={styles.labelGrey500Sm} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={["glass-card", styles.chartCard].join(" ")}>
          <div className={styles.cardTitle}>Factures traitées par pipeline</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={allPipelines.map((pipeline) => ({ name: pipeline.name.slice(0, 14), inv: pipeline.invoicesProcessed || 0, conn: pipeline.connector }))} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip formatter={(value) => [value.toLocaleString("fr-FR"), "Factures"]} />
              <Bar dataKey="inv" name="Factures" radius={[0, 6, 6, 0]}>
                {allPipelines.map((pipeline, index) => <Cell key={pipeline.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                <LabelList dataKey="inv" position="right" formatter={(value) => value.toLocaleString("fr-FR")} className={styles.labelGrey500Sm} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={["glass-card", styles.chartCard, styles.chartLegendSmall].join(" ")}>
          <div className={styles.cardTitle}>Répartition connecteurs (donut)</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={connData.map((item, index) => ({ ...item, fill: CHART_COLORS[index % CHART_COLORS.length] }))} dataKey="count" nameKey="conn" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                {connData.map((item, index) => <Cell key={item.conn} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                <LabelList dataKey="conn" position="outside" className={styles.labelGrey600Sm} />
              </Pie>
              <Tooltip formatter={(value, name) => [value + " pipelines", name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={["glass-card", styles.chartCard].join(" ")}>
          <div className={styles.cardTitle}>Fréquence d'exécution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={freqData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="freq" tick={{ fontSize: 11, fill: COLORS.grey700 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Pipelines" radius={[8, 8, 0, 0]}>
                {freqData.map((item) => <Cell key={item.freq} fill={item.color} />)}
                <LabelList dataKey="count" position="top" className={styles.labelGrey500Strong} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={["glass-card", styles.chartCard].join(" ")}>
        <div className={styles.cardTitle}>Tous les pipelines</div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHeadRow}>
                {["Pipeline", "Tenant", "Connecteur", "Fréquence", "Factures", "Taux", "Statut", "Dernière exéc."].map((header) => <th key={header} className={styles.th}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {allPipelines.map((pipeline) => {
                const tenant = allTenants.find((item) => item.id === pipeline.tenantId);
                return (
                  <tr key={pipeline.id} className={["table-row", styles.tableRow].join(" ")}>
                    <td className={styles.nameCell}>{pipeline.name}</td>
                    <td className={styles.td}>
                      <div className={styles.tenantCell}>
                        <div className={[styles.tenantAvatar, getAvatarClass(tenant?.color)].join(" ")}>{tenant?.logo}</div>
                        <span className={styles.tenantName}>{tenant?.name}</span>
                      </div>
                    </td>
                    <td className={styles.td}><Badge type="mute">{pipeline.connector}</Badge></td>
                    <td className={styles.freqCell}>{pipeline.freq}</td>
                    <td className={styles.invoiceCell}>{(pipeline.invoicesProcessed || 0).toLocaleString("fr-FR")}</td>
                    <td className={styles.td}><span className={[styles.anomalyRate, (Number.isFinite(pipeline.anomalyRate) ? pipeline.anomalyRate : 0) > 0.02 ? styles.anomalyHigh : styles.anomalyOk].join(" ")}>{((Number.isFinite(pipeline.anomalyRate) ? pipeline.anomalyRate : 0) * 100).toFixed(2)}%</span></td>
                    <td className={styles.td}><Badge type={pipeline.status === "actif" ? "ok" : pipeline.status === "warning" ? "warn" : "mute"}>{pipeline.status}</Badge></td>
                    <td className={styles.dateCell}>{pipeline.lastRun ? new Date(pipeline.lastRun).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
