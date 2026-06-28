// SeriesView presentational components: Toggle, Badge, StatPill, SeriesCard, SectionTitle.
// Extracted from SeriesView.
import { memo, useState } from "react";
import { T, isCommandePipeline } from "@/features/series/utils/seriesHelpers";
import styles from "./seriesComponents.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

function toneClass(color) {
  switch (color) {
    case T.red:
      return styles.toneRed;
    case T.warning:
      return styles.toneWarning;
    case T.info:
      return styles.toneInfo;
    case T.success:
      return styles.toneSuccess;
    default:
      return styles.toneInk;
  }
}

export function Toggle({ on, onChange }) {
  return (
    <div
      role="switch" aria-checked={on}
      onClick={e => { e.stopPropagation(); onChange(); }}
      className={cx(styles.toggle, on ? styles.toggleOn : styles.toggleOff)}
    >
      <div className={cx(styles.toggleKnob, on && styles.toggleKnobOn)} />
    </div>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────── */
export function Badge({ children, color = T.red }) {
  return (
    <span className={cx(styles.badge, toneClass(color))}>
      {children}
    </span>
  );
}

/* ─── Stat pill ─────────────────────────────────────────────────────── */
export function StatPill({ label, value, color = T.ink700 }) {
  return (
    <div className={cx(styles.statPill, toneClass(color))}>
      <span className={styles.statPillLabel}>
        {label}
      </span>
      <span className={styles.statPillValue}>
        {value}
      </span>
    </div>
  );
}

/* ─── SeriesCard ─────────────────────────────────────────────────────── */
export const SeriesCard = memo(function SeriesCard({ series, pipeline }) {
  const cv = series.cv ?? 0;
  const flagged = series.flagged ?? (cv > 0.25 || (series.n ?? 0) < 3);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const mu = series.mu ?? 0;
  const n = series.n ?? 0;
  const sigma = series.sigma ?? 0;
  const tolerancePct = series.tolerance_pct ?? pipeline?.tolerancePct ?? 10;
  const isCommand = series.isCommandSeries || isCommandePipeline(pipeline);

  const statusColor = paused ? T.ink400 : flagged ? T.red : T.success;
  const statusTone = statusColor === T.red ? styles.statusRed : statusColor === T.success ? styles.statusSuccess : styles.statusMuted;

  return (
    <div
      className={cx(styles.seriesCard, paused && styles.paused, flagged && styles.flagged, hovered && styles.hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Status dot */}
      <div className={cx(styles.statusDot, statusTone)} />

      {/* Main info */}
      <div className={styles.cardMain}>
        <div className={styles.cardHeader}>
          <span className={cx(styles.seriesName, paused && styles.seriesNamePaused)}>
            {series.name || series.id}
          </span>
          {flagged && <Badge color={T.red}>Flag</Badge>}
          {series.high_cv && <Badge color={T.warning}>CV élevé</Badge>}
          {series.low_volume && <Badge color={T.info}>Faible vol.</Badge>}
        </div>

        {/* Metrics row */}
        <div className={styles.metricsRow}>
          {/* Commande = spend series: commandes / moy / total / statut. No
              "budget" stat — official budget lives in the ERP tabs. */}
          {(isCommand
            ? [
                { label: "commandes", val: n },
                { label: "moy", val: `€${mu.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`, mono: true },
                { label: "total", val: `€${(series.totalCommandes ?? mu * n).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`, mono: true },
                { label: "statut", val: series.status ? (series.status === "ON_TRACK" ? "OK" : "Alerte") : (flagged ? "Alerte" : "OK"), mono: true, color: flagged ? T.red : undefined },
              ]
            : [
                { label: "factures", val: n },
                { label: "moy", val: `€${mu.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`, mono: true },
                { label: "σ", val: `€${sigma.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`, mono: true },
                { label: "CV", val: `${(cv * 100).toFixed(1)}%`, mono: true, color: flagged ? T.red : undefined },
                { label: "tol", val: `${tolerancePct}%`, mono: true, color: flagged ? T.red : undefined },
              ]
          ).map((m, i) => (
            <div key={i} className={styles.metric}>
              <span className={cx(styles.metricValue, m.mono && styles.metricValueMono, m.color === T.red && styles.metricValueRed)}>
                {m.val}
              </span>
              <span className={styles.metricLabel}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Toggle */}
      <div className={styles.toggleColumn}>
        <span className={styles.toggleLabel}>
          {paused ? "En pause" : "Actif"}
        </span>
        <Toggle on={!paused} onChange={() => setPaused(v => !v)} />
      </div>
    </div>
  );
});

/* ─── Section title ─────────────────────────────────────────────────── */
export function SectionTitle({ children, icon }) {
  return (
    <div className={styles.sectionTitle}>
      {icon && <span className={styles.sectionIcon}>{icon}</span>}
      {children}
    </div>
  );
}
