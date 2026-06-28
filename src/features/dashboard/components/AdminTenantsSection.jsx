import { memo } from "react";
import { Users } from "lucide-react";
import {
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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { COLORS } from "@/constants/colors";
import { CustomTip } from "@/shared/ui/CustomTip";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import { AdminSectionDivider } from "@/features/dashboard/components/AdminDashboardChrome";
import styles from "./AdminTenantsSection.module.css";

const metricToneByLabel = {
  Montant: styles.toneSuccess,
  Factures: styles.toneInfo,
  Anomalies: styles.toneRed,
  Taux: styles.toneWarning,
  "Mode DB": styles.tonePurple,
  Pipelines: styles.toneTeal,
};

const storageToneByIndex = [styles.toneRed, styles.toneInfo];

const ChartLegend = memo(function ChartLegend({ payload = [] }) {
  return (
    <div className={styles.chartLegend}>
      {payload.map((entry) => (
        <span key={entry.value} className={styles.chartLegendItem}>
          <svg className={styles.chartLegendIcon} viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2" y="2" width="10" height="10" rx="2" fill={entry.color} />
          </svg>
          {entry.value}
        </span>
      ))}
    </div>
  );
});

export function AdminTenantsSection({
  enrichedTenants,
  allPipelines,
  tenantStatsById,
  invoiceVolumeData,
  storageModeDist,
  radarData,
  stackedData,
  scatterData,
}) {
  return (
    <div className="fade-in">
      <AdminSectionDivider label="Analyse tenants" lucide={Users} />

      <div className={styles.tenantGrid}>
        {enrichedTenants.map((tenant) => {
          const tenantPipelines = allPipelines.filter((pipeline) => pipeline.tenantId === tenant.id);
          return (
            <div key={tenant.id} className={`glass-card card-hover ${styles.tenantCard}`}>
              <div className={styles.tenantHeader}>
                <svg className={styles.tenantLogo} viewBox="0 0 40 40" aria-hidden="true">
                  <rect width="40" height="40" rx="12" fill={tenant.color} />
                  <text x="20" y="25" textAnchor="middle" className={styles.tenantLogoText}>{tenant.logo}</text>
                </svg>
                <div className={styles.tenantInfo}>
                  <div className={styles.tenantName}>
                    {tenant.name}
                  </div>
                  <span className={`badge badge-${tenant.plan === "Enterprise" ? "red" : tenant.plan === "Pro" ? "info" : "ok"} ${styles.planBadge}`}>
                    {tenant.plan}
                  </span>
                </div>
              </div>
              {[
                { label: "Montant", val: formatCompactEuro(tenantStatsById[tenant.id]?.totalInvoiceAmount ?? 0) },
                { label: "Factures", val: tenant.invoiceCount.toLocaleString("fr-FR") },
                { label: "Anomalies", val: tenant.anomalyCount },
                { label: "Taux", val: `${(tenant.anomalyRate * 100).toFixed(1)}%` },
                { label: "Mode DB", val: tenant.storage === "dedicated" || tenant.storage === "isolated" ? "Isolée" : "Partagée" },
                { label: "Pipelines", val: tenantPipelines.length },
              ].map((item) => (
                <div key={item.label} className={styles.metricRow}>
                  <span className={styles.metricLabel}>{item.label}</span>
                  <span className={`${styles.metricValue} ${metricToneByLabel[item.label]}`}>{item.val}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={`glass-card ${styles.chartCard}`}>
          <div className={styles.chartTitle}>Montant facturé par tenant</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={invoiceVolumeData} margin={{ top: 22, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={formatCompactEuro} tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [formatEuro(value), "Montant"]} />
              <Bar dataKey="amount" name="Montant" radius={[8, 8, 0, 0]}>
                {invoiceVolumeData.map((item) => <Cell key={item.name} fill={item.color} />)}
                <LabelList dataKey="amount" position="top" offset={8} formatter={formatCompactEuro} fill={COLORS.grey500} fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`glass-card ${styles.chartCard}`}>
          <div className={styles.chartTitle}>Distribution des modes DB</div>
          <div className={styles.storageBody}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={storageModeDist} dataKey="count" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={4} startAngle={90} endAngle={450}>
                  {storageModeDist.map((item) => <Cell key={item.mode} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [value + " tenants", name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.storageLegend}>
              {storageModeDist.map((item, index) => (
                <div key={item.mode} className={styles.storageLegendItem}>
                  <div className={`${styles.storageLegendDot} ${storageToneByIndex[index] ?? styles.toneRed}`} />
                  <span className={styles.storageLegendLabel}>{item.mode}</span>
                  <span className={`${styles.storageLegendValue} ${storageToneByIndex[index] ?? styles.toneRed}`}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.twoColumnGrid}>
        <div className={`glass-card ${styles.chartCard}`}>
          <div className={styles.chartTitle}>Radar · santé des tenants</div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart cx="50%" cy="50%" outerRadius={100} data={radarData}>
              <PolarGrid stroke={COLORS.grey200} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: COLORS.grey600, fontSize: 11, fontWeight: 600 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: COLORS.grey400, fontSize: 8 }} />
              {enrichedTenants.map((tenant) => (
                <Radar key={tenant.id} name={tenant.name} dataKey={tenant.name.slice(0, 8)} stroke={tenant.color} fill={tenant.color} fillOpacity={0.12} strokeWidth={2} />
              ))}
              <Legend content={<ChartLegend />} />
              <Tooltip formatter={(value) => [`${value}/100`]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className={`glass-card ${styles.chartCard}`}>
          <div className={styles.chartTitle}>Anomalies par type et tenant</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stackedData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTip />} />
              <Legend content={<ChartLegend />} />
              <Bar dataKey="montant" name="Montant" stackId="a" fill={COLORS.red} radius={[0, 0, 0, 0]} />
              <Bar dataKey="doublon" name="Doublon" stackId="a" fill={COLORS.warning} />
              <Bar dataKey="fréquence" name="Fréquence" stackId="a" fill={COLORS.info} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`glass-card ${styles.fullWidthCard}`}>
        <div className={styles.chartTitle}>Volume factures vs Taux d'anomalies · toutes entités</div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
            <XAxis type="number" dataKey="x" name="Factures" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} label={{ value: "Volume factures", position: "insideBottom", offset: -2, fill: COLORS.grey400, fontSize: 10 }} />
            <YAxis type="number" dataKey="y" name="Taux %" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} label={{ value: "Taux anomalies %", angle: -90, position: "insideLeft", fill: COLORS.grey400, fontSize: 10 }} />
            <ZAxis dataKey="z" range={[60, 280]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0]?.payload;
                return (
                  <div className={styles.scatterTooltip}>
                    <div className={styles.scatterTooltipTitle}>{item?.name}</div>
                    <div className={styles.infoText}>Volume: {item?.x?.toLocaleString("fr-FR")}</div>
                    <div className={styles.dangerText}>Taux: {item?.y}%</div>
                  </div>
                );
              }}
            />
            <Scatter data={scatterData} name="Tenants">
              {scatterData.map((item, index) => <Cell key={index} fill={item.color} fillOpacity={0.8} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
