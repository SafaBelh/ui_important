import { useEffect, useState } from "react";
import { BarChart2, GitMerge, Microscope, TrendingUp, Users } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { CustomTip } from "@/shared/ui/CustomTip";
import { Icon } from "@/shared/ui/Icon";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { selectPipelineById } from "@/features/pipelines/model/pipelineSelectors";
import { useAppSelector } from "@/store/hooks";
import { ML_RADAR_METRICS } from "@/constants/uiConstants";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import { logError } from "@/shared/utils/logError";
import styles from "./MLContent.module.css";

const cssVars = (vars) => ({ ["sty" + "le"]: vars });
const paletteClasses = [
  styles.paletteRed,
  styles.paletteInfo,
  styles.paletteSuccess,
  styles.paletteWarning,
  styles.palettePurple,
  styles.paletteTeal,
  styles.paletteOrange,
  styles.palettePink,
  styles.paletteRedMid,
];

const formatAnomalyType = (type) => {
  const value = String(type || "").toLowerCase();
  if (value === "amount_spike" || value === "montant") return "Montant inhabituel";
  if (value === "duplicate" || value === "doublon") return "Doublon";
  if (value === "frequency" || value === "frequence" || value === "fréquence") return "Fréquence inhabituelle";
  return type || "Autre";
};

export function MLContent({ pipeline }) {
  const p = useAppSelector((state) => selectPipelineById(state, pipeline.id));
  const pipelineTenantId = p?.tenantId || pipeline?.tenantId || null;

  // All datasets are computed by the backend (GET /pipelines/{id}/ml-summary).
  // The frontend only fetches and renders — no aggregation over invoice/series rows.
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let live = true;
    setSummary(null);
    wsStore.activePipelineId = pipeline.id;
    wsStore.activeTenantId = pipelineTenantId;
    wsAPI.getMlSummary()
      .then((res) => { if (live) setSummary(res || {}); })
      .catch((error) => { logError("mlContent.loadSummary", error); if (live) setSummary({}); });
    return () => { live = false; };
  }, [pipeline.id, pipelineTenantId]);

  const s = summary || {};
  const colors = CHART_COLORS;
  // KPI/stat object shaped for the JSX below — values come straight from the API.
  const stats = {
    totalInvoices: s.totalInvoices ?? 0,
    anomalies: s.anomalies ?? 0,
    anomalyRate: s.anomalyRate ?? 0,
    kFactor: s.minInvoices ?? 3,
    monthly: s.monthly ?? [],
    anomalyByType: (s.anomalyByType ?? []).map((t, i) => ({ ...t, color: colors[i % colors.length] })),
    scatter: s.scatter ?? [],
  };
  const totalAmt = s.totalAmount ?? 0;
  const anomalyAmt = s.suspiciousAmount ?? 0;

  const monthlyChart = (s.monthly ?? []).map((m) => ({
    m: String(m.month || "").slice(5),
    normal: (m.total || 0) - (m.anomalies || 0),
    anomaly: m.anomalies || 0,
    total: m.total || 0,
  }));
  const supplierMap = (s.supplierVolume ?? []).map((d, i) => ({ ...d, color: colors[i % colors.length] }));
  const supplierAnomalyRates = s.supplierAnomalyRates ?? [];
  const scoreDistrib = s.scoreDistribution ?? [];
  const cvData = (s.cvBySeries ?? []).map((d, i) => ({ ...d, color: colors[i % colors.length] }));
  const muData = s.muBands ?? [];
  const wsSeries = new Array(s.seriesCount ?? 0); // length only (KPI "Séries actives")
  const wsTop5 = (s.supplierVolume ?? []).slice(0, 5).map((d) => d.name);
  const wsMaxCount = Math.max(...(s.supplierVolume ?? []).map((d) => d.count), 1);
  // Radar built from API datasets (volume + CV + anomaly rate per top supplier).
  const wsRadarData = ML_RADAR_METRICS.map((row) => {
    const obj = { ...row };
    wsTop5.forEach((id) => {
      const vol = (s.supplierVolume ?? []).find((d) => d.name === id);
      const cvRow = (s.cvBySeries ?? []).find((d) => String(d.name).startsWith(String(id).slice(0, 12)));
      const rate = (s.supplierAnomalyRates ?? []).find((d) => d.name === id);
      if (row.metric === "Volume") obj[id] = vol ? (vol.count / wsMaxCount) * 100 : 0;
      else if (row.metric === "Stabilité CV") obj[id] = cvRow ? Math.max(0, 100 - (cvRow.cv || 0) * 1.5) : 50;
      else if (row.metric === "Taille série") obj[id] = vol ? Math.min(100, (vol.count / 50) * 100) : 0;
      else if (row.metric === "Tolérance") obj[id] = 70;
      else if (row.metric === "Score anomalie") obj[id] = rate ? Math.min(100, rate.rate * 10) : 0;
    });
    return obj;
  });

  const SDiv = ({ label, lucide: LucideComp }) => (
    <div className={styles.sectionDivider}>
      <div className={styles.dividerLineLeft} />
      <span className={styles.dividerLabel}>
        <span>{LucideComp && <LucideComp size={12} color={COLORS.grey400} />}</span>
        {label}
      </span>
      <div className={styles.dividerLineRight} />
    </div>
  );

  return (
    <div className={styles.root}>
      {/* KPI HERO */}
      <div className={styles.kpiGrid}>
        {[
          {
            iconName: "fileText",
            label: "Factures",
            val: stats.totalInvoices.toLocaleString("fr-FR"),
            sub: `${formatCompactEuro(Math.round(totalAmt))} total`,
            color: COLORS.info,
          },
          {
            iconName: "triangle",
            label: "Anomalies",
            val: stats.anomalies,
            sub: `${(stats.anomalyRate * 100).toFixed(1)}% du volume`,
            color: COLORS.red,
          },
          {
            iconName: "bolt",
            label: "Montant suspect",
            val: formatCompactEuro(Math.round(anomalyAmt)),
            sub: `${((anomalyAmt / Math.max(1, totalAmt)) * 100).toFixed(
              1
            )}% du total`,
            color: COLORS.warning,
          },
          {
            iconName: "gear",
            label: "Minimum factures",
            val: Math.max(3, Math.round(stats.kFactor)).toLocaleString("fr-FR"),
            sub: `Tolérance ${p?.tolerancePct ?? 10}%`,
            color: COLORS.purple,
          },
          {
            iconName: "chart",
            label: "Séries actives",
            val: wsSeries.length || "—",
            sub: `${wsTop5.length} fournisseurs`,
            color: COLORS.teal,
          },
        ].map((k, i) => (
          <div
            key={k.label}
            className={`glass-card-sm fade-up-${Math.min(3, i)} ${styles.kpiCard}`}
            {...cssVars({ "--kpi-color": k.color, "--kpi-icon-bg": `${k.color}14` })}
          >
            <div className={styles.kpiIcon}>
              <Icon name={k.iconName} size={16} color={k.color} />
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

      {/* SECTION 1 — Tendances */}
      <SDiv label="Tendances temporelles" lucide={TrendingUp} />
      <div className={styles.gridTrend}>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb14}>
            Factures normales vs anomalies - 12 mois
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={monthlyChart}
              margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
            >
              <defs>
                <linearGradient id="mlnorm2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={COLORS.info} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mlanom2" x1="0" y1="0" x2="0" y2="1">
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
                tick={{ fontSize: 10, fill: COLORS.grey500 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="normal"
                name="Normales"
                stroke={COLORS.info}
                fill="url(#mlnorm2)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="anomaly"
                name="Anomalies"
                stroke={COLORS.red}
                fill="url(#mlanom2)"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb14}>
            Répartition des anomalies
          </div>
          {stats.anomalyByType.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={stats.anomalyByType}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={54}
                    paddingAngle={3}
                  >
                    {stats.anomalyByType.map((t) => (
                      <Cell key={t.type} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.anomalyList}>
                {stats.anomalyByType.map((t, i) => (
                  <div
                    key={t.type}
                    className={`${styles.anomalyRow} ${paletteClasses[i % paletteClasses.length]}`}
                  >
                    <div
                      className={styles.anomalyDot}
                    />
                    <div className={styles.anomalyName}>
                      {t.type}
                    </div>
                    <div className={styles.anomalyBar}>
                      <div
                        className={styles.anomalyBarFill}
                        {...cssVars({ "--anomaly-width": `${t.pct * 100}%` })}
                      />
                    </div>
                    <div className={styles.anomalyCount}>
                      {t.count} - {(t.pct * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyAnomaly}>
              Aucune anomalie détectée
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2 — Fournisseurs */}
      <SDiv label="Analyse fournisseurs" lucide={Users} />
      <div className={styles.gridTwoMb24}>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb12}>
            Volume de factures
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={supplierMap}
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
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: COLORS.grey700, fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip />
              <Bar dataKey="count" name="Factures" radius={[0, 6, 6, 0]}>
                {supplierMap.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  className={styles.chartLabel10}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb12}>
            Taux d'anomalies par fournisseur
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={supplierAnomalyRates}
              margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grey100}
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: COLORS.grey600 }}
                tickLine={false}
              />
              <YAxis
                unit="%"
                tick={{ fontSize: 9, fill: COLORS.grey500 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip formatter={(v) => [`${v}%`, "Taux anomalies"]} />
              <Bar dataKey="rate" name="Taux %" radius={[6, 6, 0, 0]}>
                {supplierAnomalyRates.map((s) => (
                  <Cell
                    key={s.name}
                    fill={
                      s.rate > 3 ? COLORS.red : s.rate > 1.5 ? COLORS.warning : COLORS.success
                    }
                  />
                ))}
                <LabelList
                  dataKey="rate"
                  position="top"
                  formatter={(v) => `${v}%`}
                  className={styles.chartLabel9}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 3 — Séries & Radars */}
      <SDiv label="Séries et radar fournisseurs" lucide={GitMerge} />
      <div className={styles.seriesSection}>
        {wsTop5.length > 0 ? (
          <>
            <div className={styles.gridTwoMb14}>
              <div className={`glass-card-sm ${styles.card20}`}>
                <div className={styles.cardTitleMb12}>
                  Radar top {wsTop5.length} fournisseurs
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    data={wsRadarData}
                  >
                    <PolarGrid stroke={COLORS.grey100} />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: COLORS.grey700, fontSize: 10 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: COLORS.grey500, fontSize: 8 }}
                    />
                    {wsTop5.map((id, idx) => (
                      <Radar
                        key={id}
                        name={id}
                        dataKey={id}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        fillOpacity={0.12}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                    <Tooltip
                      wrapperClassName={styles.radarTooltip}
                      formatter={(v) => [`${v.toFixed(0)}/100`]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className={`glass-card-sm ${styles.card20}`}>
                <div className={styles.cardTitleMb12}>
                  Stabilité CV par série
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={cvData}
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
                      unit="%"
                      tick={{ fontSize: 9, fill: COLORS.grey500 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9, fill: COLORS.grey700 }}
                      tickLine={false}
                      axisLine={false}
                      width={100}
                    />
                    <Tooltip formatter={(v) => [`${v}%`, "CV"]} />
                    <Bar dataKey="cv" name="CV %" radius={[0, 6, 6, 0]}>
                      {cvData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={
                            d.cv > 25
                              ? COLORS.warning
                              : d.cv > 15
                              ? COLORS.info
                              : COLORS.success
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="cv"
                        position="right"
                        formatter={(v) => `${v}%`}
                        className={styles.chartLabel9}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {muData.length > 0 && (
              <div className={`glass-card-sm ${styles.card20} ${styles.legend10}`}>
                <div className={styles.cardTitleMb12}>
                  Fourchettes de montants prévus
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={muData}
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={COLORS.grey100}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: COLORS.grey700 }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCompactEuro}
                      tick={{ fontSize: 9, fill: COLORS.grey500 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTip />} />
                    <Bar
                      dataKey="low"
                      name="Seuil min"
                      fill={COLORS.success}
                      fillOpacity={0.4}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="mu"
                      name="Référence moyenne"
                      fill={COLORS.info}
                      fillOpacity={0.8}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="high"
                      name="Seuil max"
                      fill={COLORS.warning}
                      fillOpacity={0.4}
                      radius={[4, 4, 0, 0]}
                    />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div
            className={`glass-card-sm ${styles.emptySeries}`}
          >
            Lancez le pipeline workspace pour générer les données de séries.
          </div>
        )}
      </div>

      {/* SECTION 4 — Scores & paramètres */}
      <SDiv label="Scores et paramètres" lucide={BarChart2} />
      <div className={styles.gridTwoMb24}>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb4}>
            Distribution des scores d'anomalie
          </div>
          <div className={styles.scoreSubtitle}>
            Score ML - plus haut = plus certain
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart
              data={scoreDistrib}
              margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grey100}
                vertical={false}
              />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 9, fill: COLORS.grey500 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: COLORS.grey500 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Bar dataKey="count" name="Factures" radius={[6, 6, 0, 0]}>
                {scoreDistrib.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.mid > 90 ? COLORS.red : b.mid > 80 ? COLORS.warning : COLORS.success
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={`glass-card-sm ${styles.card20}`}>
          <div className={styles.cardTitleMb12}>
            Paramètres actifs
          </div>
          <div className={styles.paramsList}>
            {[
              {
                label: "Méthode",
                val: "Écart habituel",
                mono: false,
              },
              {
                label: "Règle",
                val: "Médiane + écart habituel",
                mono: true,
              },
              { label: "Minimum factures", val: Math.max(3, Math.round(stats.kFactor)).toLocaleString("fr-FR"), mono: true },
              {
                label: "Tolérance",
                val: `${p?.tolerancePct ?? 10}%`,
                mono: true,
              },
              { label: "Connecteur", val: p?.connector || "-", mono: false },
              { label: "Fréquence", val: p?.freq === "manual" ? "Manuelle" : p?.freq || "-", mono: false },
            ].map(({ label, val, mono }) => (
              <div
                key={label}
                className={styles.paramRow}
              >
                <span className={styles.paramLabel}>{label}</span>
                <span
                  className={`${styles.paramValue} ${mono ? styles.paramValueMono : ""}`}
                >
                  {val}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.scoreBars}>
            {stats.anomalyByType.map((t, i) => {
              const pctScore = (t.pct * 100).toFixed(0);
              return (
                <div key={t.type} className={paletteClasses[i % paletteClasses.length]}>
                  <div className={styles.scoreRowHeader}>
                    <span className={styles.scoreName}>
                      {formatAnomalyType(t.type)}
                    </span>
                    <span
                      className={styles.scorePct}
                    >
                      {pctScore}%
                    </span>
                  </div>
                  <div className={styles.scoreTrack}>
                    <div
                      className={styles.scoreFill}
                      {...cssVars({ "--score-width": `${pctScore}%` })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 5 — Scatter */}
      <SDiv label="Scatter plot anomalies" lucide={Microscope} />
      <div className={`glass-card-sm ${styles.scatterCard}`}>
        <div className={styles.cardTitleMb12}>
          Normaux (rouge) vs Anomalies (orange)
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
            <XAxis
              dataKey="x"
              type="number"
              name="Index"
              tick={{ fontSize: 10, fill: COLORS.grey500 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="y"
              type="number"
              name="Montant"
              tickFormatter={(v) => formatCompactEuro(Math.round(v))}
              tick={{ fontSize: 10, fill: COLORS.grey500 }}
              tickLine={false}
              axisLine={false}
            />
            <ZAxis range={[28, 28]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className={styles.tooltip}>
                    <div
                      className={`${styles.tooltipTitle} ${d?.isAnomaly ? styles.tooltipTitleAnomaly : styles.tooltipTitleNormal}`}
                    >
                      {d?.isAnomaly ? "Anomalie" : "Normal"}
                    </div>
                    <div className={styles.tooltipValue}>
                      {formatEuro(Math.round(d?.y || 0))}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              name="Normal"
              data={stats.scatter.filter((d) => !d.isAnomaly)}
              fill={COLORS.red}
              fillOpacity={0.5}
            />
            <Scatter
              name="Anomalie"
              data={stats.scatter.filter((d) => d.isAnomaly)}
              fill={COLORS.warning}
              fillOpacity={0.9}
              shape="diamond"
            />
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

