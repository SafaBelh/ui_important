import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Euro, LineChart as LineChartIcon, Microscope, TriangleAlert } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { CustomTip } from "@/shared/ui/CustomTip";
import { formatCompactEuro } from "@/utils/formatters";
import styles from "./DashboardTabs.module.css";

function KpiCard({ item, index }) {
  const Icon = item.icon;

  return (
    <div className={`kpi-card fade-up-${index + 1} ${styles.kpiCard} ${styles[item.tone]}`}>
      <div className={styles.kpiValue}>
        <Icon size={22} color={item.color} strokeWidth={1.8} />
        {item.val}
      </div>
      <div className={styles.kpiLabel}>{item.lbl}</div>
      {item.sub && <div className={styles.kpiSub}>{item.sub}</div>}
    </div>
  );
}

export function DashboardOverviewTab({
  total,
  totalInvoices,
  alertsCount,
  criticalCount,
  seriesCount,
  feedbackCount,
  monthlyChart,
  supplierBarData,
  supplierColor,
  onOpenInsights,
}) {
  const kpis = [
    { lbl: "Total facturé", val: formatCompactEuro(Math.round(total)), icon: Euro, color: COLORS.success, tone: "toneSuccess", sub: `${totalInvoices.toLocaleString()} factures` },
    { lbl: "Alertes actives", val: alertsCount, icon: TriangleAlert, color: COLORS.red, tone: "toneRed", sub: `${criticalCount} critiques` },
    { lbl: "Séries", val: seriesCount, icon: BarChart3, color: COLORS.info, tone: "toneInfo", sub: `${feedbackCount} feedbacks` },
  ];

  return (
    <>
      <div className={styles.kpiGrid}>
        {kpis.map((item, index) => <KpiCard key={item.lbl} item={item} index={index} />)}
      </div>

      <div className={`glass-card ${styles.forecastCard}`}>
        <div>
          <div className={styles.forecastTitle}>
            <Microscope size={18} color={COLORS.purple} />
            Prévisions d'Activité
          </div>
          <div className={styles.forecastText}>
            Notre modèle prédictif a analysé vos cycles de facturation et anticipe <strong>24 factures</strong> à venir pour le mois prochain.
          </div>
        </div>
        <button className={`btn-primary ${styles.purpleButton}`} onClick={onOpenInsights}>Détails des prévisions</button>
      </div>

      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartTitle}>
          <LineChartIcon size={13} color={COLORS.grey500} /> Dépenses mensuelles
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={monthlyChart} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="wsdashag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.18} />
                <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
            <XAxis dataKey="m" tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} />
            <YAxis tickFormatter={formatCompactEuro} tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTip />} />
            <Legend />
            <Area type="monotone" dataKey="total" name="Total €" fill="url(#wsdashag)" stroke={COLORS.red} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartTitle}>Fournisseurs</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={supplierBarData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
            <XAxis dataKey="id" tick={{ fontSize: 10, fill: COLORS.grey700 }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: COLORS.grey500 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTip />} />
            <Bar dataKey="count" name="# Factures" radius={[6, 6, 0, 0]}>
              {supplierBarData.map((supplier) => <Cell key={supplier.id} fill={supplierColor(supplier.id)} />)}
              <LabelList dataKey="count" position="top" fill={COLORS.grey500} fontSize={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
