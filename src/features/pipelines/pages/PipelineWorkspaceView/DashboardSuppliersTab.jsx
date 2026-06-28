import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import styles from "./DashboardTabs.module.css";
import supplierStyles from "./DashboardSuppliersTab.module.css";

function SupplierTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className={supplierStyles.tooltipContent}>
      <div className={supplierStyles.tooltipLabel}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className={supplierStyles.tooltipRow}>
          <span className={supplierStyles.tooltipName}>{entry.name}</span>
          <span className={supplierStyles.tooltipValue}>{entry.value.toFixed(0)}/100</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardSuppliersTab({ topSuppliers, radarData, supplierBarData }) {
  return (
    <div>
      <div className={styles.sectionTitle}>Vue fournisseurs</div>

      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartTitle}>
          Radar des fournisseurs — top {topSuppliers.length}
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart cx="50%" cy="50%" outerRadius={120} data={radarData}>
            <PolarGrid stroke={COLORS.grey100} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: COLORS.grey700, fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: COLORS.grey500, fontSize: 8 }} />
            {topSuppliers.map((id, index) => (
              <Radar key={id} name={id} dataKey={id} stroke={CHART_COLORS[index % CHART_COLORS.length]} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.13} strokeWidth={2} />
            ))}
            <Legend />
            <Tooltip
              content={<SupplierTooltip />}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.supplierGrid}>
        {supplierBarData.map((supplier, index) => (
          <div key={supplier.id} className={`glass-card-sm ${styles.supplierCard} ${styles[`chartColor${index % 9}`]}`}>
            <div className={styles.supplierName}>{supplier.id}</div>
            <div className={styles.supplierCount}>{supplier.count} factures</div>
          </div>
        ))}
      </div>
    </div>
  );
}
