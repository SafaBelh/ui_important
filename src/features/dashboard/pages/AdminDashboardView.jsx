import { useMemo, useState, useEffect } from "react";
import { Bell, Building2, GitBranch, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/shared/ui/Badge";
import { CustomTip } from "@/shared/ui/CustomTip";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { formatCompactEuro } from "@/utils/formatters";
import { getAdminAlerts, getAdminPipelines, getAdminStats } from "@/features/dashboard/api/DashboardApi";
import { getTenantStats, getTenants } from "@/features/tenants/api/tenantsApi";
import { selectEnrichedTenants, selectTenantStatsById } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { setTenantsCache, setTenantStatsCache } from "@/features/tenants/model/tenantActions";
import { ADMIN_PIPELINE_STATUS_DEFS, ADMIN_RADAR_METRICS } from "@/constants/uiConstants";
import { AdminSectionDivider, AdminSectionNav } from "@/features/dashboard/components/AdminDashboardChrome";
import { normalizeAnomalyType } from "@/features/dashboard/model/adminDashboardModel";
import { AdminAnomaliesSection } from "@/features/dashboard/components/AdminAnomaliesSection";
import { AdminPipelinesSection } from "@/features/dashboard/components/AdminPipelinesSection";
import { AdminTenantsSection } from "@/features/dashboard/components/AdminTenantsSection";
import { logError } from "@/shared/utils/logError";
import styles from "./AdminDashboardView.module.css";

const toneClassByColor = {
  [COLORS.red]: styles.toneRed,
  [COLORS.success]: styles.toneSuccess,
  [COLORS.warning]: styles.toneWarning,
  [COLORS.info]: styles.toneInfo,
  [COLORS.purple]: styles.tonePurple,
  [COLORS.teal]: styles.toneTeal,
  [COLORS.orange]: styles.toneOrange,
  [COLORS.pink]: styles.tonePink,
  [COLORS.redMid]: styles.toneRedMid,
};

const getToneClass = (color) => toneClassByColor[color] || styles.toneInfo;

export function AdminDashboardView({ onNavigate }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [apiStats, setApiStats] = useState(null);
  const enrichedTenants = useAppSelector(selectEnrichedTenants);
  const tenantStatsById = useAppSelector(selectTenantStatsById);
  const tenants = enrichedTenants;
  const [allPipelines, setAllPipelines] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);

  // All business aggregates (platform totals, monthly trend, anomaly-type histogram,
  // per-tenant stats) come pre-computed from /admin/stats and /admin/stats/tenant/{id}.
  // No raw invoice/anomaly rows are fetched or bucketed in the client.
  useEffect(() => {
    Promise.all([
      getTenants({ size: 500 }).catch(() => ({ content: [] })),
      getAdminStats().catch(() => null),
      getAdminPipelines({ size: 100 }).catch(() => ({ content: [] })),
      getAdminAlerts({ size: 100 }).catch(() => ({ content: [] })),
    ]).then(async ([tenantsRes, stats, pipelinesRes, alertsRes]) => {
      const tenantRows = tenantsRes?.content ?? [];
      setTenantsCache(tenantRows);
      await Promise.all(tenantRows.map(async (tenant) => {
        try {
          const tenantStats = await getTenantStats(tenant.id);
          setTenantStatsCache(tenant.id, tenantStats);
        } catch (error) {
          logError("adminDashboard.loadTenantStats", error);
        }
      }));
      const pipelines = (pipelinesRes?.content ?? []).map((p) => {
        const processed = p.invoicesProcessed ?? p.lastRunStats?.invoicesImported ?? p.lastRunStats?.processedCount ?? p.lastRunStats?.importedCount ?? 0;
        const anomalies = p.lastRunStats?.anomaliesDetected ?? p.lastRunStats?.anomalyCount ?? p.anomalyCount ?? 0;
        return {
          ...p,
          status: p.status === "ACTIVE" ? "actif" : p.status === "DRAFT" ? "draft" : (p.status || "paused").toLowerCase(),
          invoicesProcessed: processed,
          anomalyRate: processed > 0 ? anomalies / processed : 0,
          connector: p.connector || p.connectorName || p.sourceType || p.connectorId || "Aucun",
          freq: p.freq || p.frequency || "Manuel",
          lastRun: p.lastRun || p.lastRunAt || null,
        };
      });
      const alerts = (alertsRes?.content ?? []).map((a) => ({
        ...a,
        timestamp: a.timestamp || a.detectedAt || a.createdAt,
        severity: String(a.severity || "info").toLowerCase(),
      }));
      setApiStats(stats);
      setAllPipelines(pipelines);
      setAllAlerts(alerts);
    }).catch(err => console.error("Failed to fetch admin data:", err));
  }, []);

  // ── Aggregate data across ALL tenants ──────────────────────────────────
  const totalInvoiceCount = apiStats?.invoicesCount ?? apiStats?.totalInvoices ?? 0;
  const totalAnomalyCount = apiStats?.anomaliesCount ?? apiStats?.totalAnomalies ?? 0;
  const overallAnomalyRate = totalInvoiceCount
    ? ((totalAnomalyCount / totalInvoiceCount) * 100).toFixed(2)
    : 0;
  const activePipelineCount = apiStats?.activePipelinesCount ?? allPipelines.filter((p) => p.status === "actif").length;
  const alertsByStatus = apiStats?.alertsByStatus ?? {};
  const criticalAlerts = alertsByStatus.CRITICAL ?? 0;
  const unreadAlerts = alertsByStatus.UNREAD ?? 0;

  // Backend-computed global total (no client row aggregation).
  const totalInvoiceAmount = apiStats?.totalInvoiceAmount ?? 0;

  const allTenants = enrichedTenants;

  // ── Database storage mode distribution (donut) ─────────────────────────
  const storageModeDist = useMemo(() => {
    const m = { "Base partagée": 0, "Base isolée": 0 };
    tenants.forEach((t) => {
      const mode = t.storage === "dedicated" || t.storage === "isolated" ? "Base isolée" : "Base partagée";
      m[mode] = (m[mode] || 0) + 1;
    });
    return Object.entries(m).map(([mode, count], i) => ({
      mode,
      count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [tenants]);

  // ── Invoice amount per tenant (bar) ───────────────────────────────────
  const invoiceVolumeData = enrichedTenants
    .map((t) => ({
      name: t.name,
      amount: tenantStatsById[t.id]?.totalInvoiceAmount ?? 0,   // backend per-tenant total
      color: t.color,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ── Monthly trend across platform (backend-bucketed) ──────────────────
  const monthlyTrend = useMemo(
    () => (apiStats?.monthlyTrend ?? []).map((b) => ({
      m: b.month,
      total: b.total,
      anomalies: b.anomalies,
      amount: b.amount,
    })),
    [apiStats]
  );

  // ── Anomaly type distribution (backend histogram, enum→label only) ────
  const anomTypeData = useMemo(
    () => (apiStats?.anomaliesByType ?? []).map((b, i) => ({
      type: normalizeAnomalyType(b.type),
      count: b.count,
      color: [COLORS.red, COLORS.warning, COLORS.info, COLORS.purple][i % 4],
    })),
    [apiStats]
  );

  // ── Per-tenant anomaly rates ───────────────────────────────────────────
  const clientAnomalyData = useMemo(() => enrichedTenants.map((t) => {
    // Backend per-tenant stats (no client row aggregation).
    const ts = tenantStatsById[t.id] || {};
    const invoiceCount = ts.invoicesCount ?? t.invoiceCount ?? 0;
    const anomalyCount = ts.anomaliesCount ?? t.anomalyCount ?? 0;
    return {
      name: t.name.slice(0, 10),
      rate: invoiceCount ? parseFloat(((anomalyCount / invoiceCount) * 100).toFixed(2)) : 0,
      invoices: invoiceCount,
      color: t.color,
      plan: t.role || "unknown",
      type: t.role || "unknown",
    };
  }), [enrichedTenants, tenantStatsById]);

  // ── Pipeline status breakdown ──────────────────────────────────────────
  const pipelineStatusData = ADMIN_PIPELINE_STATUS_DEFS.map((def) => ({
    status: def.status,
    count: allPipelines.filter((p) => def.matches.includes(p.status)).length,
    color: COLORS[def.colorKey],
  }));

  // ── Connector usage ────────────────────────────────────────────────────
  const connData = useMemo(() => {
    const connMap = {};
    allPipelines.forEach((p) => {
      const c = p.connector || p.connectorId || "Aucun";
      connMap[c] = (connMap[c] || 0) + 1;
    });
    return Object.entries(connMap).map(([conn, count]) => ({
      conn: conn === "none" ? "Aucun" : conn,
      count,
    }));
  }, [allPipelines]);

  // ── Alert timeline (last 8) ────────────────────────────────────────────
  const recentAlerts = allAlerts
    .filter((a) => a.severity === "critical" || a.severity === "warning")
    .slice(0, 8);

  // ── Radar — client health metrics ─────────────────────────────────────
  const RADAR_METRICS = ADMIN_RADAR_METRICS;
  const tInvoiceCounts = useMemo(() => enrichedTenants.map(t => t.invoiceCount || 0), [enrichedTenants]);
  const tAnomalyCounts = useMemo(() => enrichedTenants.map(t => t.anomalyCount || 0), [enrichedTenants]);
  const maxInv = Math.max(...tInvoiceCounts, 1);
  const maxAnm = Math.max(...tAnomalyCounts, 1);
  const radarData = RADAR_METRICS.map((metric) => ({
    metric,
    ...Object.fromEntries(
      tenants.map((t, i) => [
        t.name.slice(0, 8),
        metric === "Factures"
          ? Math.round((tInvoiceCounts[i] / maxInv) * 100)
          : metric === "Anomalies"
          ? Math.round((tAnomalyCounts[i] / maxAnm) * 100)
          : metric === "Pipelines"
          ? Math.min(100, allPipelines.filter(p => p.tenantId === t.id).length * 25)
          : metric === "Alertes"
          ? Math.min(100, allAlerts.filter(a => a.tenantId === t.id && a.status !== "READ").length * 10)
          : Math.round((t.anomalyRate || 0) * 100),
      ])
    ),
  }));

  // ── Composed chart: invoices + anomaly rate per month ─────────────────
  const composedData = monthlyTrend.map((d) => ({
    ...d,
    rate: d.total ? parseFloat(((d.anomalies / d.total) * 100).toFixed(2)) : 0,
  }));

  // ── Scatter: invoice volume vs anomaly rate per client ─────────────────
  const scatterData = enrichedTenants.map((t) => ({
      x: t.invoiceCount || 0,
      y: parseFloat(((t.anomalyRate || 0) * 100).toFixed(2)),
      z: Math.max(1, tenantStatsById[t.id]?.invoicesCount ?? 0),
      name: t.name,
      color: t.color,
  }));

  // ── Stacked bar: anomalies per type per tenant (backend histogram) ─────
  const stackedData = enrichedTenants.map((t) => {
    const mc = {};
    (tenantStatsById[t.id]?.anomaliesByType ?? []).forEach((tc) => {
      mc[normalizeAnomalyType(tc.type)] = tc.count;
    });
    return {
      name: t.name.slice(0, 8),
      montant: mc.montant || 0,
      doublon: mc.doublon || 0,
      fréquence: mc["fréquence"] || 0,
    };
  });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Monitoring"
        title="Command Center"
        subtitle="Vue analytique globale · AnomalyIQ Admin"
        actions={(
          <>
          {criticalAlerts > 0 && (
            <div className={styles.criticalPill}>
              <span className={`pulse-dot ${styles.criticalDot}`} />
              <span className={styles.criticalText}>
                {criticalAlerts} critique{criticalAlerts > 1 ? "s" : ""}
              </span>
            </div>
          )}
          <button
            onClick={() => onNavigate("alerts")}
            className={`btn-ghost ${styles.headerButton}`}
          >
            <Icon name="bell" size={13} /> {unreadAlerts} alertes
          </button>
          <button
            onClick={() => onNavigate("tenants")}
            className={`btn-primary ${styles.headerButton}`}
          >
            <Icon name="clients" size={13} color="#fff" /> Gérer tenants
          </button>
          </>
        )}
      />

      <AdminSectionNav activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* ═══ OVERVIEW SECTION ═══════════════════════════════════════════ */}
      {activeSection === "overview" && (
        <div className="fade-in">
          {/* KPI Row */}
          <div className={styles.kpiGrid}>
            {[
              {
                label: "Tenants",
                val: tenants.length,
                sub: `${tenants.filter((t) => t.storage === "dedicated" || t.storage === "isolated").length} bases isolées`,
                color: COLORS.info,
                LucideComp: Building2,
              },
              {
                label: "Montant facturé",
                val: formatCompactEuro(totalInvoiceAmount),
                sub: "D'après factures backend",
                color: COLORS.success,
                icon: "chart",
              },
              {
                label: "Factures",
                val: totalInvoiceCount.toLocaleString("fr-FR"),
                sub: "Toutes entités",
                color: COLORS.info,
                icon: "fileText",
              },
              {
                label: "Anomalies",
                val: totalAnomalyCount.toLocaleString("fr-FR"),
                sub: `Taux ${overallAnomalyRate}%`,
                color: COLORS.red,
                icon: "triangle",
              },
              {
                label: "Pipelines",
                val: allPipelines.length,
                sub: `${activePipelineCount} actifs`,
                color: COLORS.success,
                icon: "pipelines",
              },
              {
                label: "Alertes",
                val: unreadAlerts,
                sub: `${criticalAlerts} critiques`,
                color: criticalAlerts > 0 ? COLORS.red : COLORS.warning,
                icon: "bell",
              },
              {
                label: "Taux global",
                val: `${overallAnomalyRate}%`,
                sub: "Anomalies / factures",
                color: COLORS.purple,
                icon: "bolt",
              },
            ].map((k, i) => {
              const KpiIcon = k.LucideComp;
              return (
              <div
                key={k.label}
                className={`kpi-card fade-up-${Math.min(3, i)} ${styles.kpiCard} ${getToneClass(k.color)}`}
              >
                <div className={styles.kpiIcon}>
                  {KpiIcon ? <KpiIcon size={14} color={k.color} /> : <Icon name={k.icon} size={14} color={k.color} />}
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
            );})}
          </div>

          <AdminSectionDivider label="Tendances plateforme" lucide={TrendingUp} />

          {/* Composed chart: invoices + anomaly rate */}
          <div className={styles.platformGrid}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.cardHeaderRow}>
                <div className={styles.cardTitle}>
                  Volume + Taux d'anomalies · 12 mois
                </div>
                <Badge type="mute">Composé</Badge>
              </div>
              <div className={styles.legendChartWrap}>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart
                  data={composedData}
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                >
                  <defs>
                    <linearGradient id="adgTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COLORS.info} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adgAnom" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.25} />
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
                    tick={{ fontSize: 10, fill: COLORS.grey400 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={40}
                  />
                  <Tooltip content={<CustomTip />} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="Factures"
                    stroke={COLORS.info}
                    fill="url(#adgTotal)"
                    strokeWidth={2}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="anomalies"
                    name="Anomalies"
                    stroke={COLORS.red}
                    fill="url(#adgAnom)"
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
            </div>

            {/* Pipeline status donut */}
            <div className={`glass-card ${styles.chartCard} ${styles.pipelineCard}`}>
              <div className={styles.cardTitleWithMargin}>
                Statut des pipelines
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={pipelineStatusData}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                    startAngle={90}
                    endAngle={450}
                  >
                    {pipelineStatusData.map((d) => (
                      <Cell key={d.status} fill={d.color} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="inside"
                      fill="#fff"
                      fontSize={11}
                      fontWeight={700}
                    />
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.statusList}>
                {pipelineStatusData.map((d) => (
                  <div
                    key={d.status}
                    className={`${styles.statusRow} ${getToneClass(d.color)}`}
                  >
                    <div className={styles.statusDot} />
                    <div className={styles.statusName}>
                      {d.status}
                    </div>
                    <div className={styles.statusCount}>
                      {d.count}
                    </div>
                    <progress
                      className={styles.statusProgress}
                      max={Math.max(1, allPipelines.length)}
                      value={d.count}
                      />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Anomaly types donut + connector bar */}
          <div className={styles.twoColumnGrid}>
            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.cardTitleWithMargin}>
                Types d'anomalies · plateforme
              </div>
              <div className={styles.donutContentGrid}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={anomTypeData}
                      dataKey="count"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {anomTypeData.map((d) => (
                        <Cell key={d.type} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v + " anomalies", n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.anomalyList}>
                  {anomTypeData.map((d) => (
                    <div key={d.type} className={getToneClass(d.color)}>
                      <div className={styles.anomalyHeader}>
                        <div className={styles.anomalyNameWrap}>
                          <div className={styles.anomalyDot} />
                          <span className={styles.anomalyName}>
                            {d.type}
                          </span>
                        </div>
                        <span className={styles.anomalyCount}>
                          {d.count}
                        </span>
                      </div>
                      <progress
                        className={styles.anomalyProgress}
                        max={Math.max(1, totalAnomalyCount)}
                        value={d.count}
                        />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`glass-card ${styles.chartCard}`}>
              <div className={styles.cardTitleWithMargin}>
                Connecteurs utilisés
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={connData}
                  layout="vertical"
                  margin={{ top: 4, right: 40, bottom: 4, left: 4 }}
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
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="conn"
                    tick={{ fontSize: 11, fill: COLORS.grey700, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip content={<CustomTip />} />
                  <Bar dataKey="count" name="Pipelines" radius={[0, 6, 6, 0]}>
                    {connData.map((d, i) => (
                      <Cell key={d.conn} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      fill={COLORS.grey500}
                      fontSize={11}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent critical alerts */}
          <AdminSectionDivider label="Alertes récentes critiques" lucide={Bell} />
          <div className={styles.alertGrid}>
            {recentAlerts.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className={`glass-card-sm ${styles.alertCard} ${a.severity === "critical" ? styles.alertCritical : styles.alertWarning}`}
              >
                <div className={styles.alertDot} />
                <div className={styles.alertBody}>
                  <div className={styles.alertMessage}>
                    {a.message}
                  </div>
                  <div className={styles.alertTimestamp}>
                    {new Date(a.timestamp).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <span
                  className={`badge badge-${
                    a.severity === "critical" ? "red" : "warn"
                  } ${styles.alertBadge}`}
                >
                  {a.severity === "critical" ? "CRITIQUE" : "ALERTE"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "tenants" && (
        <AdminTenantsSection
          tenants={tenants}
          enrichedTenants={enrichedTenants}
          allPipelines={allPipelines}
          tenantStatsById={tenantStatsById}
          invoiceVolumeData={invoiceVolumeData}
          storageModeDist={storageModeDist}
          radarData={radarData}
          stackedData={stackedData}
          scatterData={scatterData}
        />
      )}
      {/* ═══ PIPELINES SECTION ══════════════════════════════════════════ */}
      {activeSection === "pipelines" && (
        <AdminPipelinesSection
          allPipelines={allPipelines}
          activePipelineCount={activePipelineCount}
          connData={connData}
          allTenants={allTenants}
        />
      )}

      {activeSection === "anomalies" && (
        <AdminAnomaliesSection
          totalAnomalyCount={totalAnomalyCount}
          overallAnomalyRate={overallAnomalyRate}
          anomTypeData={anomTypeData}
          composedData={composedData}
          clientAnomalyData={clientAnomalyData}
          allAlerts={allAlerts}
          tenantStatsById={tenantStatsById}
          enrichedTenants={enrichedTenants}
        />
      )}

    </div>
  );
}
