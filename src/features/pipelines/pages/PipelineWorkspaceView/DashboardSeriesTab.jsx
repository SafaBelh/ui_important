import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Euro } from "lucide-react";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import styles from "./DashboardTabs.module.css";

function SeriesMetricCard({ metric }) {
  return (
    <div className={`glass-card-sm ${styles.seriesMetricCard} ${styles[metric.tone]}`}>
      <div className={styles.seriesMetricValue}>{metric.val}</div>
      <div className={styles.seriesMetricLabel}>{metric.lbl}</div>
    </div>
  );
}

function SeriesDetailCard({ seriesItem, index, alerts, feedback }) {
  const seriesAlerts = alerts.filter((alert) => alert.series_id === seriesItem.id);
  const seriesFeedback = feedback.filter(
    (entry) =>
      entry.series_id === seriesItem.id &&
      entry.old_tolerance_pct != null &&
      entry.new_tolerance_pct != null &&
      Math.abs(entry.new_tolerance_pct - entry.old_tolerance_pct) > 0.01,
  );

  return (
    <div className={`glass-card-sm ${styles.seriesDetailCard} ${styles[`chartColor${index % 9}`]}`}>
      <div className={styles.seriesDetailHeader}>
        <div className={styles.seriesDetailTitle}>
          {[seriesItem.supplier, seriesItem.label].filter(Boolean).join(" · ")}
        </div>
        {seriesAlerts.length > 0 && <span className="badge badge-red" />}
      </div>

      <div className={styles.seriesMiniGrid}>
        {[
          { lbl: "μ", val: formatEuro(Math.round(seriesItem.mu)), tone: `chartColor${index % 9}` },
          { lbl: "CV", val: `${(seriesItem.cv * 100).toFixed(1)}%`, tone: seriesItem.cv > 0.4 ? "toneWarning" : "toneSuccess" },
          { lbl: "n", val: seriesItem.n, tone: "toneGrey" },
        ].map((metric) => (
          <div key={metric.lbl} className={`${styles.seriesMiniMetric} ${styles[metric.tone]}`}>
            <div className={styles.seriesMiniValue}>{metric.val}</div>
            <div className={styles.seriesMiniLabel}>{metric.lbl}</div>
          </div>
        ))}
      </div>

      <div className={styles.seriesRangeText}>
        Tolérance ±{seriesItem.tolerance_pct}% · plage: {formatEuro(Math.round(seriesItem.mu * (1 - seriesItem.tolerance_pct / 100)))} – {formatEuro(Math.round(seriesItem.mu * (1 + seriesItem.tolerance_pct / 100)))}
      </div>
      <div className={styles.seriesRangeTrack}>
        <div className={styles.seriesRangeBand} />
        <div className={styles.seriesRangeMean} />
      </div>

      <div className={styles.seriesBadgeRow}>
        {seriesItem.use_seasonality && <span className="badge badge-info">Saisonnalité</span>}
        {seriesItem.forecast_start_today && <span className="badge badge-ok">Depuis aujourd'hui</span>}
        {seriesItem.median_gap_days && <span className="badge badge-mute">⏱ {seriesItem.median_gap_days}j</span>}
      </div>

      {seriesFeedback.length > 0 && (
        <div className={styles.feedbackBlock}>
          <div className={styles.feedbackTitle}>
            Adaptations (feedback)
          </div>
          {seriesFeedback.slice(-3).map((entry, feedbackIndex) => {
            const feedbackClass = entry.decision === "confirm" ? "feedbackConfirm" : "feedbackInfo";
            return (
              <div key={feedbackIndex} className={`${styles.feedbackRow} ${styles[feedbackClass]}`}>
                <span className={styles.feedbackStrong}>{entry.decision === "confirm" ? "↘" : "↗"}</span>
                <span className={styles.feedbackOld}>{entry.old_tolerance_pct?.toFixed(1)}%</span>
                <span className={styles.feedbackArrow}>→</span>
                <span className={styles.feedbackStrong}>{entry.new_tolerance_pct?.toFixed(1)}%</span>
                <span className={`badge badge-${entry.decision === "confirm" ? "red" : "info"} ${styles.feedbackBadge}`}>
                  {entry.decision}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DashboardSeriesTab({ series, sortedSeries, cvData, muData, alerts, feedback }) {
  const metrics = [
    { lbl: "Séries totales", val: series.length, tone: "toneInfo" },
    { lbl: "CV moyen", val: `${((series.reduce((sum, item) => sum + item.cv, 0) / Math.max(series.length, 1)) * 100).toFixed(1)}%`, tone: "toneWarning" },
    { lbl: "Avec saisonnalité", val: series.filter((item) => item.use_seasonality).length, tone: "tonePurple" },
    { lbl: "Démarrage aujourd'hui", val: series.filter((item) => item.forecast_start_today).length, tone: "toneSuccess" },
  ];

  return (
    <>
      <div className={styles.seriesMetricGrid}>
        {metrics.map((metric) => <SeriesMetricCard key={metric.lbl} metric={metric} />)}
      </div>

      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartTitle}>
          Coefficient de variation (CV) par série — plus bas = plus stable
        </div>
        <ResponsiveContainer width="100%" height={Math.max(160, sortedSeries.length * 28)}>
          <BarChart data={cvData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} horizontal={false} />
            <XAxis type="number" unit="%" tick={{ fill: COLORS.grey500, fontSize: 9 }} tickLine={false} domain={[0, Math.max(...cvData.map((item) => item.cv), 50)]} />
            <YAxis type="category" dataKey="name" tick={{ fill: COLORS.grey700, fontSize: 9 }} tickLine={false} width={135} />
            <Tooltip formatter={(value) => [`${value}%`, "CV"]} />
            <ReferenceLine x={40} stroke={COLORS.warning} strokeDasharray="4 2" label={{ value: "40%", fill: COLORS.warning, fontSize: 9 }} />
            <Bar dataKey="cv" name="CV%" radius={[0, 4, 4, 0]}>
              {cvData.map((item, index) => <Cell key={index} fill={item.cv > 40 ? COLORS.warning : CHART_COLORS[index % CHART_COLORS.length]} />)}
              <LabelList dataKey="cv" position="right" formatter={(value) => `${value}%`} fill={COLORS.grey500} fontSize={9} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={`glass-card ${styles.chartCard}`}>
        <div className={styles.chartTitle}>
          <Euro size={13} color={COLORS.grey500} className={styles.iconInline} /> Montant moyen (μ) + plage de tolérance par série
        </div>
        <ResponsiveContainer width="100%" height={Math.max(160, sortedSeries.length * 28)}>
          <BarChart data={muData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 140 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompactEuro} tick={{ fill: COLORS.grey500, fontSize: 9 }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: COLORS.grey700, fontSize: 9 }} tickLine={false} width={135} />
            <Tooltip formatter={(value, name) => [formatEuro(value), name]} />
            <Bar dataKey="low" name="Min tolérance" fill={`${COLORS.success}40`} stackId="range" radius={[0, 0, 0, 0]} />
            <Bar dataKey="mu" name="Moyenne μ" fill={COLORS.info} stackId="a" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="mu" position="right" formatter={formatCompactEuro} fill={COLORS.grey500} fontSize={9} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.seriesDetailHeading}>Détail par série</div>
      <div className={styles.seriesDetailGrid}>
        {sortedSeries.map((seriesItem, index) => (
          <SeriesDetailCard key={seriesItem.id || index} seriesItem={seriesItem} index={index} alerts={alerts} feedback={feedback} />
        ))}
      </div>
    </>
  );
}
