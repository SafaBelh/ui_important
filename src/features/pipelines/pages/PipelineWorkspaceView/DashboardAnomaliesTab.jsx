import { CalendarDays, CheckCircle2, VolumeX, X } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { wsAPI } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { Spinner } from "@/shared/ui/Spinner";
import { formatEuro } from "@/utils/formatters";
import styles from "./DashboardTabs.module.css";

const decisionClasses = {
  confirm: "decisionConfirm",
  reject: "decisionReject",
  ignore: "decisionIgnore",
};

const severityClasses = {
  CRITIQUE: "severityCritical",
  ALERTE: "severityAlert",
  INFO: "severityInfo",
  OK: "severityOk",
};

function AdaptationBanner({ adaptation, onDismiss }) {
  if (!adaptation) return null;

  const decision = adaptation.decision;
  const oldTolerance = adaptation.feedbackEntry?.old_tolerance_pct;
  const newTolerance = adaptation.feedbackEntry?.new_tolerance_pct;
  const toleranceChanged = oldTolerance != null && newTolerance != null && Math.abs(newTolerance - oldTolerance) > 0.01;
  const DecisionIcon = decision === "confirm" ? CheckCircle2 : decision === "reject" ? X : VolumeX;
  const decisionClass = decisionClasses[decision] || "decisionIgnore";

  return (
    <div className={`${styles.adaptationBanner} ${styles[decisionClass]}`}>
      <div className={styles.adaptationHeader}>
        <div className={styles.adaptationIdentity}>
          <div className={styles.adaptationIcon}>
            <DecisionIcon size={14} strokeWidth={2.5} />
          </div>
          <div>
            <div className={styles.adaptationTitle}>
              {decision === "confirm" ? "Anomalie confirmée — système renforcé" : decision === "reject" ? "Faux positif — tolérance assouplie" : "Feedback ignoré — aucun ajustement"}
            </div>
            <div className={styles.adaptationMeta}>Série {adaptation.series_id} · alerte #{adaptation.alertId}</div>
          </div>
        </div>
        <button onClick={onDismiss} className={styles.iconButtonBare}>×</button>
      </div>

      {toleranceChanged ? (
        <div className={styles.toleranceRow}>
          <div className={styles.toleranceBox}>
            <div className={styles.toleranceLabel}>Avant</div>
            <div className={styles.toleranceValue}>{oldTolerance?.toFixed(1)}%</div>
          </div>
          <div className={styles.toleranceArrow}>→</div>
          <div className={`${styles.toleranceBox} ${styles.toleranceBoxAfter}`}>
            <div className={styles.toleranceLabel}>Après</div>
            <div className={`${styles.toleranceValue} ${styles.toleranceValueAfter}`}>{newTolerance?.toFixed(1)}%</div>
          </div>
          <div className={styles.adaptationBodyText}>
            {decision === "confirm" ? `Resserrement de ${(oldTolerance - newTolerance).toFixed(1)}% — détection plus stricte.` : `Élargissement de ${(newTolerance - oldTolerance).toFixed(1)}% — moins de faux positifs.`}
          </div>
        </div>
      ) : (
        <div className={styles.adaptationBodyText}>
          {oldTolerance != null ? `Tolérance inchangée : ${oldTolerance?.toFixed(1)}%` : "Tolérance sera mise à jour lors de la prochaine détection."}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, index, filter, series, isActioning, onFeedback }) {
  const seriesObj = series.find((item) => item.id === alert.series_id);
  const severity = alert.severity || "ALERTE";
  const severityClass = severityClasses[severity] || "severityAlert";
  const score = Math.round((alert.score || 0) <= 1 ? (alert.score || 0) * 100 : alert.score || 0);
  const seriesName = alert.series_name || (alert.series_supplier ? [alert.series_supplier, alert.series_label].filter(Boolean).join(" · ") : seriesObj ? [seriesObj.supplier, seriesObj.label].filter(Boolean).join(" · ") : alert.supplier || `Série #${alert.series_id || "—"}`);

  return (
    <div key={alert.id || index} className={`${styles.alertCard} ${styles[severityClass]}`}>
      <div className={`${styles.alertHeader} ${filter === "pending" ? styles.alertHeaderPending : ""}`}>
        <div className={styles.alertSeverityCol}>
          <div className={styles.alertSeverity}>{severity}</div>
          <div className={styles.alertType}>{alert.alert_type || alert.type}</div>
          <div className={styles.alertScore}>{score}</div>
        </div>

        <div className={styles.alertMain}>
          <div className={styles.alertMetaRow}>
            <span className={styles.seriesChip}>{seriesName}</span>
            {alert.series_id && <span className={styles.mutedTiny}>#{alert.series_id}</span>}
            <span className={`${styles.mutedTiny} ${styles.dateTiny}`}>{alert.detection_date}</span>
          </div>

          {(alert.actual_amount || alert.amount) && (
            <div className={styles.alertAmount}>
              {formatEuro(Math.round(alert.actual_amount || alert.amount))}
              {alert.date && <span className={styles.alertDate}>{alert.date}</span>}
            </div>
          )}

          <div className={styles.alertExplanation}>{alert.explanation || alert.message}</div>
          {alert.expected_date && <div className={styles.expectedDate}><CalendarDays size={11} color={COLORS.info} className={styles.iconInline} /> Attendue le: {alert.expected_date}</div>}
          {alert.reference_mu && <div className={styles.referenceLine}>Référence: {formatEuro(Math.round(alert.reference_mu))} · Seuil: {formatEuro(Math.round(alert.max_acceptable || 0))}</div>}
        </div>
      </div>

      {filter === "pending" && (
        <div className={styles.alertActions}>
          <button className={`btn-danger ${styles.alertActionButton}`} disabled={isActioning} onClick={() => onFeedback(alert.id, "confirm")}>
            {isActioning ? <Spinner size={12} color={COLORS.red} /> : "Confirmer anomalie"}
          </button>
          <button className={`btn-confirm ${styles.alertActionButton}`} disabled={isActioning} onClick={() => onFeedback(alert.id, "reject")}>
            {isActioning ? <Spinner size={12} color={COLORS.success} /> : "Faux positif"}
          </button>
          <button className={`btn-mute ${styles.alertActionButton}`} disabled={isActioning} onClick={() => onFeedback(alert.id, "ignore")}>
            {isActioning ? <Spinner size={12} color={COLORS.grey500} /> : <><VolumeX size={12} color={COLORS.grey500} /> Ignorer</>}
          </button>
        </div>
      )}
    </div>
  );
}

export function DashboardAnomaliesTab({ adaptation, alerts, filter, actionLoading, series, onDismissAdaptation, onFilterChange, onAlertsChange, onFeedback }) {
  const filters = [
    ["pending", `En attente (${alerts.length})`],
    ["confirm", "Confirmées"],
    ["reject", "Rejetées"],
    ["ignore", "Ignorées"],
  ];

  const loadFilter = async (nextFilter) => {
    onFilterChange(nextFilter);
    const nextAlerts = await wsAPI.getAlerts(nextFilter).catch(() => []);
    onAlertsChange(Array.isArray(nextAlerts) ? nextAlerts : []);
  };

  const redetect = async () => {
    await wsAPI.runDetection();
    const nextAlerts = await wsAPI.getAlerts("pending");
    onAlertsChange(Array.isArray(nextAlerts) ? nextAlerts : []);
    onFilterChange("pending");
  };

  return (
    <div>
      <AdaptationBanner adaptation={adaptation} onDismiss={onDismissAdaptation} />

      <div className={styles.filterBar}>
        {filters.map(([id, label]) => (
          <button key={id} className={`tab${filter === id ? " active" : ""} ${styles.smallTab}`} onClick={() => loadFilter(id)}>
            {label}
          </button>
        ))}
        <div className={styles.filterSpacer}>
          <button className={`btn-ghost ${styles.smallTab}`} onClick={redetect}>Re-détecter</button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className={`glass-card ${styles.emptyAnomalies}`} />
      ) : (
        alerts.map((alert, index) => (
          <AlertCard key={alert.id || index} alert={alert} index={index} filter={filter} series={series} isActioning={actionLoading === alert.id} onFeedback={onFeedback} />
        ))
      )}
    </div>
  );
}
