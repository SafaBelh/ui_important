

import { Check, Cpu, Sparkles } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { PIPELINE_STEPS } from "./PipelineSteps";
import styles from "./StepBar.module.css";

/* ─────────────────────────────────────────────────────────────────────────────
   SideStepBar — vertical left rail used in the new workspace layout
   Props:
     step       {number}   current step index (0-based)
     onNavigate {fn(idx)}  click handler — only called for completed steps
     pipelineName {string}
     connector   {string}
───────────────────────────────────────────────────────────────────────────── */
export function SideStepBar({ step, onNavigate, pipelineName, connector, disabledPages = [] }) {
  const progress = Math.round((step / (PIPELINE_STEPS.length - 1)) * 100);
  const disabledSet = new Set(disabledPages);

  return (
    <div className={styles.sideBar}>
      {/* Pipeline identity block */}
      <div className={styles.identity}>
        <div className={styles.identityIcon}>
          <Cpu size={18} color="#fff" strokeWidth={1.8} />
        </div>
        <div className={styles.pipelineName} title={pipelineName}>
          {pipelineName || "Pipeline"}
        </div>
        {connector && (
          <div className={styles.connectorBadge}>
            {connector}
          </div>
        )}
      </div>

      {/* Progress summary */}
      <div className={styles.progressBlock}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>
            PROGRESSION
          </span>
          <span className={styles.progressValue}>
            {progress}%
          </span>
        </div>
        <progress className={styles.progressTrack} value={progress} max="100" aria-label="Progression du pipeline" />
        <div className={styles.stepCount}>
          Étape {Math.min(step + 1, PIPELINE_STEPS.length)} sur{" "}
          {PIPELINE_STEPS.length}
        </div>
      </div>

      {/* Step list */}
      <div className={styles.stepList}>
        {PIPELINE_STEPS.map(({ id, label, desc, Icon: StepIcon }, i) => {
          const isDone = i < step;
          const isActive = i === step;
          const isDisabled = disabledSet.has(id);
          const clickable = isDone && onNavigate && !isDisabled;

          return (
            <div
              key={id}
              onClick={() => clickable && onNavigate(i)}
              className={`${styles.sideStep} ${clickable ? styles.sideStepClickable : ""} ${isDisabled ? styles.sideStepDisabled : ""} ${isActive ? styles.sideStepActive : ""}`}
              title={clickable ? `Aller à : ${label}` : isDisabled ? "Étape de ré-import bloquée en mode gestion" : undefined}
            >
              {/* Icon dot */}
              <div
                className={`${styles.sideStepIcon} ${isDone ? styles.sideStepIconDone : ""} ${isActive ? styles.sideStepIconActive : ""}`}
              >
                {isDone ? (
                  <Check size={13} strokeWidth={3} color={COLORS.success} />
                ) : (
                  <StepIcon
                    size={13}
                    color={isActive ? COLORS.red : COLORS.grey400}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                )}
              </div>

              {/* Labels */}
              <div className={styles.sideStepText}>
                <div className={`${styles.sideStepLabel} ${isDone ? styles.sideStepLabelDone : ""} ${isActive ? styles.sideStepLabelActive : ""}`}>
                  {label}
                </div>
                <div className={`${styles.sideStepDesc} ${isDone ? styles.sideStepDescDone : ""} ${isActive ? styles.sideStepDescActive : ""}`}>
                  {desc}
                </div>
              </div>

              {/* Active indicator bar */}
              {isActive && (
                <div className={styles.activeBar} />
              )}

              {/* Connector line between steps */}
              {i < PIPELINE_STEPS.length - 1 && (
                <div className={`${styles.connectorLine} ${(i + 1) < step ? styles.connectorLineDone : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className={styles.footer}>
        <div className={styles.footerHint}>
          <Sparkles size={10} color={COLORS.grey400} />
          Utilisez ← → pour naviguer entre les étapes
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   StepBar — compact horizontal bar (kept for backward compat inside each step)
───────────────────────────────────────────────────────────────────────────── */
export function StepBar({ step, onNavigate }) {
  return (
    <div className={styles.horizontalBar}>
      {PIPELINE_STEPS.map(({ label }, i) => {
        const isDone = i < step;
        const isActive = i === step;
        const clickable = isDone && onNavigate;
        return (
          <div
            key={label}
            className={styles.horizontalStepWrap}
          >
            <div
              className={`${styles.horizontalStep} ${clickable ? styles.horizontalStepClickable : ""}`}
              onClick={() => clickable && onNavigate(i)}
              title={clickable ? `Aller à : ${label}` : undefined}
            >
              <div
                className={`step-dot${
                  isDone ? " step-done" : isActive ? " step-active" : " step-future"
                }`}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
              </div>
              <div className={`${styles.horizontalLabel} ${isDone ? styles.horizontalLabelDone : ""} ${isActive ? styles.horizontalLabelActive : ""}`}>
                {label}
              </div>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`${styles.horizontalConnector} ${isDone ? styles.horizontalConnectorDone : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
