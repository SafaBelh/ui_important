import { useEffect, useMemo, useState } from "react";
import { Bell, FileText, GitBranch, ShieldAlert, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/shared/ui/Badge";
import { CustomTip } from "@/shared/ui/CustomTip";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectAlertsForTenant } from "@/features/alerts/model/alertSelectors";
import { selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadAlertsForTenant, loadPipelinesForTenant } from "@/shared/model/dataLoaders";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import { getTenantStatsCharts, getTenantStatsSummary } from "@/features/dashboard/api/DashboardApi";
import { getDocuments } from "@/features/documents/api/documentsApi";
import { ChartSectionDivider, TenantSectionNav } from "@/features/dashboard/components/TenantDashboardChrome";
import { buildTenantDashboardData } from "@/features/dashboard/model/tenantDashboardModel";
import { logError } from "@/shared/utils/logError";
import { TenantPipelinesSection } from "@/features/dashboard/components/TenantPipelinesSection";
import { TenantAlertsSection } from "@/features/dashboard/components/TenantAlertsSection";
import styles from "./TenantDashboardView.module.css";

const toneClassByColor = {
  [COLORS.red]: styles.toneRed,
  [COLORS.warning]: styles.toneWarning,
  [COLORS.info]: styles.toneInfo,
  [COLORS.success]: styles.toneSuccess,
  [COLORS.purple]: styles.tonePurple,
  [COLORS.teal]: styles.toneTeal,
  [COLORS.orange]: styles.toneOrange,
  [COLORS.pink]: styles.tonePink,
  [COLORS.redMid]: styles.toneRedMid,
  [COLORS.grey400]: styles.toneGrey400,
  [COLORS.grey600]: styles.toneGrey600,
};

const chartToneClassByIndex = [
  styles.toneRed,
  styles.toneWarning,
  styles.toneInfo,
  styles.tonePurple,
];

const toneClass = (color) => toneClassByColor[color] || styles.toneInfo;
const chartToneClass = (index) => chartToneClassByIndex[index % chartToneClassByIndex.length];
const pipelineStatusToneClass = (status) => status === "actif" ? styles.toneSuccess : status === "warning" ? styles.toneWarning : styles.toneGrey400;
const anomalyScoreToneClass = (score) => score > 0.85 ? styles.toneRed : score > 0.7 ? styles.toneWarning : styles.toneSuccess;


export function TenantDashboardView({ onNavigate }) {
  const { tenant } = useSession();
  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const tenantId = tenant?.id;
  const pipelines = useAppSelector((state) => selectPipelinesForTenant(state, tenantId));
  const tenantAlerts = useAppSelector((state) => selectAlertsForTenant(state, tenantId));
  const allTenants = useAppSelector(selectTenants);
  const subAccounts = useMemo(() => allTenants.filter((item) => item.parentId === tenantId), [allTenants, tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    loadPipelinesForTenant(tenantId).catch((error) => logError("loadPipelinesForTenant", error));
    loadAlertsForTenant(tenantId).catch((error) => logError("loadAlertsForTenant", error));
    // All KPIs / charts / stats are backend-aggregated (no raw invoice rows loaded).
    getTenantStatsSummary({ adminTenantId: tenantId }).then(setStats).catch(() => setStats(null));
    getTenantStatsCharts({ adminTenantId: tenantId }).then(setCharts).catch(() => setCharts(null));
    // Recent anomaly invoices feed = a paginated list (not an aggregation): the
    // backend returns the rows ready to render.
    getDocuments({ status: "ANOMALY", recordType: "INVOICE", size: 10, adminTenantId: tenantId })
      .then(res => setRecentAnomalies((res?.content || res || []).map((document) => ({
        ...document,
        reference: document.reference || document.sourceKey || document.id,
        supplier: document.supplier || document.groupLabel || document.groupKey,
        anomalyScore: document.anomalyScore ?? document.score,
      }))))
      .catch(() => setRecentAnomalies([]));
  }, [tenantId]);

  // ── Monthly trend (backend-bucketed; only label/ratio formatting here) ──
  // Defined before the early return below so the hook order stays stable across renders.
  const monthlyTrend = useMemo(
    () => (stats?.monthlyTrend ?? []).map((b) => ({
      m: b.month.slice(5), // show MM only
      total: b.total,
      anomalies: b.anomalies,
      normal: b.total - b.anomalies,
      amount: b.amount,
      anomalyAmount: b.anomalyAmount,
      rate: b.total ? parseFloat(((b.anomalies / b.total) * 100).toFixed(2)) : 0,
    })),
    [stats]
  );

  if (!tenant) return null;

  const {
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
  } = buildTenantDashboardData({ stats, charts, pipelines, monthlyTrend });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Monitoring"
        title={tenant.name}
        subtitle={`${tenant.plan} · ${subAccounts.length} partenaire ERP${subAccounts.length > 1 ? "s" : ""} · ${activePipelines.length}/${pipelines.length} pipelines actifs`}
        actions={(
          <>
          {criticalAlertsCount > 0 && (
            <div className={styles.criticalPill}>
              <span
                className={`pulse-dot ${styles.criticalDot}`}
              />
              <span className={styles.criticalText}>
                {criticalAlertsCount} critique
                {criticalAlertsCount > 1 ? "s" : ""}
              </span>
            </div>
          )}
          <button
            onClick={() => onNavigate("anomalies")}
            className={`btn-ghost ${styles.headerButton}`}
          >
            <TriangleAlert size={13} /> {anomalyCount} anomalies
          </button>
          <button
            onClick={() => onNavigate("pipelines")}
            className={`btn-primary ${styles.headerButton}`}
          >
            <GitBranch size={13} color="#fff" /> Pipelines
          </button>
          </>
        )}
      />

      <TenantSectionNav activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* ═══ OVERVIEW ══════════════════════════════════════════════════ */}
      {activeSection === "overview" && (
        <div className="fade-in">
          {/* KPI row */}
          <div className={styles.kpiGridSix}>
            {[
              {
                label: "Factures totales",
                val: invoiceCount.toLocaleString("fr-FR"),
                sub: `${formatCompactEuro(Math.round(totalAmount))} total`,
                color: COLORS.info,
                LucideComp: FileText,
              },
              {
                label: "Anomalies",
                val: anomalyCount,
                sub: `Taux ${(anomalyRate * 100).toFixed(1)}%`,
                color: COLORS.red,
                LucideComp: TriangleAlert,
              },
              {
                label: "Montant suspect",
                val: formatCompactEuro(Math.round(anomalyAmount)),
                sub: `${(
                  (anomalyAmount / Math.max(1, totalAmount)) *
                  100
                ).toFixed(1)}% du total`,
                color: COLORS.warning,
                LucideComp: ShieldAlert,
              },
              {
                label: "Pipelines actifs",
                val: activePipelines.length,
                sub: `sur ${pipelines.length} total`,
                color: COLORS.success,
                LucideComp: GitBranch,
              },
              {
                label: "Alertes non-lues",
                val: unreadAlertsCount,
                sub: `${criticalAlertsCount} critiques`,
                color: criticalAlertsCount > 0 ? COLORS.red : COLORS.warning,
                LucideComp: Bell,
              },
              {
                label: "Fournisseurs",
                val: suppliersCount,
                sub: `${topSuppliersByAnomaly.length} avec anomalies`,
                color: COLORS.purple,
                LucideComp: Users,
              },
            ].map((k, i) => (
              <div
                key={k.label}
                className={`kpi-card fade-up-${Math.min(3, i)} ${styles.kpiCard} ${toneClass(k.color)}`}
              >
                <div className={styles.kpiIconBox}>
                  <k.LucideComp size={14} color={k.color} strokeWidth={2} />
                </div>
                <div className={styles.kpiValue}>
                  {k.val}
                </div>
                <div className={styles.kpiLabel}>
                  {k.label}
                </div>
                <div className={styles.kpiSub}>
                  {k.sub}
                </div>
              </div>
            ))}
          </div>

          <ChartSectionDivider label="Tendances mensuelles" LucideComp={TrendingUp} />

          {/* Composed chart: volume + taux */}
          <div className={styles.gridTwoOne}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartHeaderRow}>
                <div className={styles.chartTitle}>
                  Volume mensuel + taux d'anomalies
                </div>
                <Badge type="mute">12 mois</Badge>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={monthlyTrend}
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                >
                  <defs>
                    <linearGradient id="cliNorm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={COLORS.info} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cliAnom" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="m"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: COLORS.grey400 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTip />} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke={COLORS.info}
                    fill="url(#cliNorm)"
                    strokeWidth={2}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="anomalies"
                    name="Anomalies"
                    stroke={COLORS.red}
                    fill="url(#cliAnom)"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Taux %"
                    stroke={COLORS.warning}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS.warning }}
                    strokeDasharray="4 2"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Anomaly type donut */}
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Types d'anomalies
              </div>
              {anomTypeData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={anomTypeData}
                        dataKey="count"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={60}
                        paddingAngle={3}
                      >
                        {anomTypeData.map((d) => (
                          <Cell key={d.type} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v + " anomalies", n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={styles.legendListTight}>
                    {anomTypeData.map((d, index) => (
                      <div key={d.type}>
                        <div className={styles.legendRowSpace}>
                          <div className={styles.legendItemLabel}>
                            <div className={`${styles.legendDotSmall} ${chartToneClass(index)}`} />
                            <span className={styles.legendName}>
                              {d.type}
                            </span>
                          </div>
                          <span className={`${styles.legendValue} ${chartToneClass(index)}`}>
                            {d.count} · {(d.pct * 100).toFixed(0)}%
                          </span>
                        </div>
                        <progress className={`${styles.progressLine} ${chartToneClass(index)}`} value={d.pct} max="1" />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  Aucune anomalie détectée
                </div>
              )}
            </div>
          </div>

          {/* Stacked bar: normal vs anomaly amounts monthly */}
          <div className={styles.gridTwoEqual}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Montants normaux vs suspects · mensuel
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={composedData}
                  margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="m"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCompactEuro}
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTip />} />
                  <Legend />
                  <Bar
                    dataKey="normalAmt"
                    name="Normal €"
                    stackId="a"
                    fill={COLORS.info}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="anomalyAmt"
                    name="Suspect €"
                    stackId="a"
                    fill={COLORS.red}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Alert severity donut */}
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Sévérité des alertes
              </div>
              {sevData.length > 0 ? (
                <div className={styles.donutWithLegend}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={sevData}
                        dataKey="c"
                        nameKey="s"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={3}
                        startAngle={90}
                        endAngle={450}
                      >
                        {sevData.map((d) => (
                          <Cell key={d.s} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v + " alertes", n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={styles.legendColumn}>
                    {sevData.map((d) => (
                      <div key={d.s}>
                        <div className={styles.legendRowSpace}>
                          <div className={styles.legendItemLabel}>
                            <div className={`${styles.legendDot} ${toneClass(d.color)}`} />
                            <span className={styles.legendName}>
                              {d.s}
                            </span>
                          </div>
                          <span className={`${styles.legendValueLarge} ${toneClass(d.color)}`}>
                            {d.c}
                          </span>
                        </div>
                        <progress className={`${styles.progressLine} ${toneClass(d.color)}`} value={d.c} max={Math.max(1, alertsTotal)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Aucune alerte
                </div>
              )}
            </div>
          </div>

          {/* Pipeline quick status */}
          <ChartSectionDivider label="Vos pipelines" LucideComp={GitBranch} />
          <div className={pipelines.length <= 1 ? styles.pipelineGridOne : pipelines.length === 2 ? styles.pipelineGridTwo : styles.pipelineGridThree}>
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate("pipelines")}
                className={`glass-card card-hover ${styles.pipelineCard}`}
              >
                <div className={styles.pipelineHeader}>
                  <div className={styles.pipelineTitleRow}>
                    <div className={`${styles.pipelineIconBox} ${pipelineStatusToneClass(p.status)}`}>
                      <GitBranch
                        size={14}
                        color={
                          p.status === "actif"
                            ? COLORS.success
                            : p.status === "warning"
                            ? COLORS.warning
                            : COLORS.grey400
                        }
                        strokeWidth={2}
                      />
                    </div>
                    <span className={styles.pipelineName}>
                      {p.name}
                    </span>
                  </div>
                  <Badge
                    type={
                      p.status === "actif"
                        ? "ok"
                        : p.status === "warning"
                        ? "warn"
                        : "mute"
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
                <div className={styles.pipelineMetricGrid}>
                  {[
                    {
                      label: "Factures",
                      val: p.invoicesProcessed.toLocaleString("fr-FR"),
                      color: COLORS.info,
                    },
                    {
                      label: "Taux anomalies",
                      val: `${(p.anomalyRate * 100).toFixed(2)}%`,
                      color: p.anomalyRate > 0.02 ? COLORS.red : COLORS.success,
                    },
                    { label: "Connecteur", val: p.connector, color: COLORS.grey600 },
                    { label: "Fréquence", val: p.freq, color: COLORS.grey600 },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className={styles.pipelineMetricLabel}>
                        {item.label}
                      </div>
                      <div className={`${styles.pipelineMetricValue} ${toneClass(item.color)}`}>
                        {item.val}
                      </div>
                    </div>
                  ))}
                </div>
                {p.lastRun && (
                  <div className={styles.pipelineLastRun}>
                    Dernière exéc.{" "}
                    {new Date(p.lastRun).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FACTURES SECTION ══════════════════════════════════════════ */}
      {activeSection === "factures" && (
        <div className="fade-in">
          <ChartSectionDivider label="Analyse des factures" LucideComp={FileText} />

          {/* KPIs */}
          <div className={styles.kpiGridFour}>
            {[
              {
                label: "Total factures",
                val: invoiceCount.toLocaleString("fr-FR"),
                color: COLORS.info,
              },
              {
                label: "Montant total",
                val: formatCompactEuro(Math.round(totalAmount)),
                color: COLORS.success,
              },
              {
                label: "Montant moyen",
                val: formatCompactEuro(
                  Math.round(totalAmount / Math.max(1, invoiceCount))
                ),
                color: COLORS.teal,
              },
              {
                label: "Fournisseurs",
                val: suppliersCount,
                color: COLORS.purple,
              },
            ].map((k) => (
              <div
                key={k.label}
                className={`glass-card-sm ${styles.miniKpiCard} ${toneClass(k.color)}`}
              >
                <div className={styles.miniKpiValue}>
                  {k.val}
                </div>
                <div className={styles.miniKpiLabel}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          {/* Invoice distribution + supplier volume */}
          <div className={styles.gridTwoEqual}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Distribution des montants
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={buckets.map(({ range, count }) => ({ range, count }))}
                  margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 10, fill: COLORS.grey700 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="Factures" radius={[8, 8, 0, 0]}>
                    {buckets.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      fill={COLORS.grey500}
                      fontSize={10}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Supplier volume horizontal bar */}
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Volume par fournisseur
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={supplierData.slice(0, 6)}
                  layout="vertical"
                  margin={{ top: 4, right: 50, bottom: 4, left: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: COLORS.grey700 }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip />
                  <Bar dataKey="total" name="Factures" radius={[0, 6, 6, 0]}>
                    {supplierData.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="total"
                      position="right"
                      fill={COLORS.grey500}
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scatter plot: invoice amounts */}
          <div className={`glass-card ${styles.chartCard} ${styles.spacedCard}`}>
            <div className={styles.chartTitleSpaced}>
              Nuage de points — montants factures (rouge = anomalie)
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Index"
                  tick={{ fontSize: 10, fill: COLORS.grey500 }}
                  tickLine={false}
                  label={{
                    value: "Index",
                    position: "insideBottom",
                    offset: -2,
                    fill: COLORS.grey400,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Montant €"
                  tickFormatter={formatCompactEuro}
                  tick={{ fontSize: 10, fill: COLORS.grey500 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Montant €",
                    angle: -90,
                    position: "insideLeft",
                    fill: COLORS.grey400,
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className={styles.scatterTooltip}>
                        <div className={styles.scatterTooltipTitle}>
                          {d?.name}
                        </div>
                        <div className={styles.infoText}>
                          Montant: {formatEuro(d?.y)}
                        </div>
                        {d?.isAnomaly && (
                          <div className={styles.dangerText}>
                            <TriangleAlert size={11} color={COLORS.red} /> Anomalie
                            détectée
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Scatter
                  name="Normal"
                  data={normalScatter}
                  fill={COLORS.info}
                  fillOpacity={0.5}
                  r={3}
                />
                <Scatter
                  name="Anomalie"
                  data={anomalyScatter}
                  fill={COLORS.red}
                  fillOpacity={0.85}
                  r={5}
                />
                <Legend />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Supplier amount radar */}
          <div className={`glass-card ${styles.chartCard}`}>
            <div className={styles.chartTitleSpaced}>
              Radar · profil fournisseurs (top 5)
            </div>
            {(() => {
              const top5 = supplierData.slice(0, 5);
              const maxAmt = Math.max(...top5.map((s) => s.amount), 1);
              const maxAnomAmt = Math.max(
                ...top5.map((s) => s.anomalyAmount),
                1
              );
              const supplierRadar = [
                { metric: "Volume" },
                { metric: "Montant total" },
                { metric: "Anomalies" },
                { metric: "Montant suspect" },
                { metric: "Taux" },
              ].map((row) => ({
                ...row,
                ...Object.fromEntries(
                  top5.map((s) => [
                    s.name.slice(0, 10),
                    row.metric === "Volume"
                      ? Math.round(
                          (s.total / Math.max(...top5.map((x) => x.total), 1)) *
                            100
                        )
                      : row.metric === "Montant total"
                      ? Math.round((s.amount / maxAmt) * 100)
                      : row.metric === "Anomalies"
                      ? Math.round(
                          (s.anomalies /
                            Math.max(...top5.map((x) => x.anomalies), 1)) *
                            100
                        )
                      : row.metric === "Montant suspect"
                      ? Math.round(
                          (s.anomalyAmount / Math.max(maxAnomAmt, 1)) * 100
                        )
                      : Math.min(100, Math.round(s.rate * 10)),
                  ])
                ),
              }));
              return (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    data={supplierRadar}
                  >
                    <PolarGrid stroke={COLORS.grey200} />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: COLORS.grey600, fontSize: 11, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: COLORS.grey400, fontSize: 8 }}
                    />
                    {top5.map((s, i) => (
                      <Radar
                        key={s.name}
                        name={s.name}
                        dataKey={s.name.slice(0, 10)}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                    <Tooltip formatter={(v) => [`${v}/100`]} />
                  </RadarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══ ANOMALIES SECTION ══════════════════════════════════════════ */}
      {activeSection === "anomalies" && (
        <div className="fade-in">
          <ChartSectionDivider label="Détail des anomalies" LucideComp={TriangleAlert} />

          {/* KPIs */}
          <div className={styles.kpiGridFour}>
            {[
              { label: "Total anomalies", val: anomalyCount, color: COLORS.red },
              {
                label: "Taux global",
                val: `${(anomalyRate * 100).toFixed(2)}%`,
                color: COLORS.warning,
              },
              {
                label: "Montant suspect",
                val: formatCompactEuro(Math.round(anomalyAmount)),
                color: COLORS.red,
              },
              {
                label: "Fournisseurs touchés",
                val: topSuppliersByAnomaly.length,
                color: COLORS.purple,
              },
            ].map((k) => (
              <div
                key={k.label}
                className={`glass-card-sm ${styles.miniKpiCard} ${toneClass(k.color)}`}
              >
                <div className={styles.miniKpiValue}>
                  {k.val}
                </div>
                <div className={styles.miniKpiLabel}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          {/* Anomaly evolution + type breakdown */}
          <div className={styles.gridTwoOne}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Évolution anomalies · 12 mois
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={monthlyTrend}
                  margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
                >
                  <defs>
                    <linearGradient id="cliAnomEv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cliRateEv" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={COLORS.warning}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="95%"
                        stopColor={COLORS.warning}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="m"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: COLORS.grey400 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTip />} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="anomalies"
                    name="Anomalies"
                    stroke={COLORS.red}
                    fill="url(#cliAnomEv)"
                    strokeWidth={2.5}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="rate"
                    name="Taux %"
                    stroke={COLORS.warning}
                    fill="url(#cliRateEv)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Anomaly type full donut */}
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Répartition par type
              </div>
              {anomTypeData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={anomTypeData}
                        dataKey="count"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={4}
                        startAngle={90}
                        endAngle={450}
                      >
                        {anomTypeData.map((d) => (
                          <Cell key={d.type} fill={d.color} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="inside"
                          fill="#fff"
                          fontSize={11}
                          fontWeight={700}
                        />
                      </Pie>
                      <Tooltip formatter={(v, n) => [v + " anomalies", n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={styles.legendList}>
                    {anomTypeData.map((d, index) => (
                      <div
                        key={d.type}
                        className={styles.legendRow}
                      >
                        <div className={`${styles.legendDotSmall} ${chartToneClass(index)}`} />
                        <span className={styles.legendNameFlex}>
                          {d.type}
                        </span>
                        <span className={`${styles.legendValue} ${chartToneClass(index)}`}>
                          {d.count}
                        </span>
                        <span className={styles.legendPct}>
                          {(d.pct * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  Aucune anomalie
                </div>
              )}
            </div>
          </div>

          {/* Top suppliers by anomaly + anomaly amount bar */}
          <div className={styles.gridTwoEqual}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Fournisseurs avec le plus d'anomalies
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={topSuppliersByAnomaly}
                  layout="vertical"
                  margin={{ top: 4, right: 50, bottom: 4, left: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: COLORS.grey700 }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="anomalies"
                    name="Anomalies"
                    radius={[0, 6, 6, 0]}
                  >
                    {topSuppliersByAnomaly.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="anomalies"
                      position="right"
                      fill={COLORS.grey500}
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Anomaly rate per supplier */}
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.chartTitleSpaced}>
                Taux d'anomalies par fournisseur
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={supplierData.slice(0, 6)}
                  margin={{ top: 4, right: 8, bottom: 20, left: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={COLORS.grey100}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 9,
                      fill: COLORS.grey700,
                      angle: -20,
                      textAnchor: "end",
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: COLORS.grey500 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(v) => [`${v}%`, "Taux"]} />
                  <Bar dataKey="rate" name="Taux %" radius={[6, 6, 0, 0]}>
                    {supplierData.slice(0, 6).map((s, i) => (
                      <Cell
                        key={i}
                        fill={
                          s.rate > 2
                            ? COLORS.red
                            : s.rate > 1
                            ? COLORS.warning
                            : COLORS.success
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="rate"
                      position="top"
                      formatter={(v) => `${v}%`}
                      fill={COLORS.grey500}
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent anomaly invoices feed */}
          <div className={`glass-card ${styles.chartCard}`}>
            <div className={styles.chartTitleSpaced}>
              Dernières factures anomalies
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.anomalyTable}>
                <thead>
                  <tr className={styles.tableHeadRow}>
                    {[
                      "Référence",
                      "Fournisseur",
                      "Montant",
                      "Type anomalie",
                      "Score",
                      "Statut",
                      "Date",
                    ].map((h) => (
                      <th
                        key={h}
                        className={styles.tableHeadCell}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentAnomalies.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`table-row ${styles.tableRow}`}
                    >
                      <td className={styles.referenceCell}>
                        {inv.reference}
                      </td>
                      <td className={styles.supplierCell}>
                        {inv.supplier || inv.supplierName}
                      </td>
                      <td className={styles.amountCell}>
                        {formatEuro(Math.round(inv.amount))}
                      </td>
                      <td className={styles.tableCell}>
                        <span
                          className={`badge badge-${
                            inv.anomalyType === "montant"
                              ? "red"
                              : inv.anomalyType === "doublon"
                              ? "warn"
                              : "info"
                          } ${styles.anomalyTypeBadge}`}
                        >
                          {inv.anomalyType || "autre"}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        <span
                          className={`${styles.scoreText} ${anomalyScoreToneClass(inv.anomalyScore)}`}
                        >
                          {inv.anomalyScore
                            ? (inv.anomalyScore * 100).toFixed(0)
                            : "—"}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        <Badge type="red">Anomalie</Badge>
                      </td>
                      <td className={styles.dateCell}>
                        {inv.date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PIPELINES SECTION ══════════════════════════════════════════ */}
      {activeSection === "pipelines" && (
        <TenantPipelinesSection pipelines={pipelines} radarData={radarData} radarPipelines={radarPipelines} />
      )}

      {/* ═══ ALERTES SECTION ═══════════════════════════════════════════ */}
      {activeSection === "alertes" && (
        <TenantAlertsSection
          alertsTotal={alertsTotal}
          unreadAlertsCount={unreadAlertsCount}
          criticalAlertsCount={criticalAlertsCount}
          treatedAlertsCount={treatedAlertsCount}
          alertTypeData={alertTypeData}
          sevData={sevData}
          tenantAlerts={tenantAlerts}
        />
      )}
    </div>
  );
}
