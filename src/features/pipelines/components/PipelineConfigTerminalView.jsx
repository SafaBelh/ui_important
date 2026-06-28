import { CheckCircle } from "lucide-react";
import { COLORS } from "@/constants/colors";
import styles from "./PipelineConfigTerminalView.module.css";

const LINE_COLOR_CLASSES = {
  "#a8d8a8": styles.lineCommand,
  "#94a3b8": styles.lineMuted,
  "#4ade80": styles.lineSuccess,
  "#60a5fa": styles.lineInfo,
  "#f9a8d4": styles.linePink,
  "#fbbf24": styles.lineWarning,
};

function getLineClassName(color) {
  return `${styles.line} ${LINE_COLOR_CLASSES[color?.toLowerCase()] || styles.lineMuted} fade-in`;
}

export function PipelineConfigTerminalView({ phase, lines, fields, rowCount, connType, connector, name, csvFileName, onEdit, onConfirm, isEditMode }) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={`${styles.statusIcon} ${phase === "done" ? styles.statusIconDone : styles.statusIconConnecting}`}>
          {phase === "done" ? <CheckCircle size={22} color={COLORS.success} strokeWidth={2} /> : <div className={styles.spinner} />}
        </div>
        <div>
          <div className={styles.title}>{phase === "done" ? "Connexion établie — pipeline prêt" : "Établissement de la connexion…"}</div>
          <div className={styles.subtitle}>
            {connector && <connector.LucideComp size={11} color={COLORS.grey400} strokeWidth={2} />}
            {connType.toUpperCase()} · {name}
          </div>
        </div>
      </div>

      <div className={styles.terminal}>
        <div className={styles.terminalBar}>
          <div className={`${styles.dot} ${styles.dotRed}`} />
          <div className={`${styles.dot} ${styles.dotYellow}`} />
          <div className={`${styles.dot} ${styles.dotGreen}`} />
          <span className={styles.terminalTitle}>anomalyiq — {connType === "csv" ? "import" : "connect"}</span>
          <span className={styles.terminalFile}>{connType === "csv" && csvFileName ? csvFileName : `${connType}.connection`}</span>
        </div>
        <div className={styles.terminalBody}>
          {lines.map((line, index) => <div key={index} className={getLineClassName(line.color)}>{line.text}</div>)}
          {phase === "connecting" && <div className={styles.cursorWrap}><span className={styles.cursor}>▋</span></div>}
          {phase === "done" && (
            <div className={styles.schemaBlock}>
              <div className={styles.schemaTitle}>SCHÉMA DÉTECTÉ</div>
              <div className={styles.fieldList}>
                {fields.map((field) => <span key={field} className={styles.fieldTag}>{field}</span>)}
              </div>
              <div className={styles.rowCount}>{rowCount.toLocaleString("fr-FR")} enregistrements prêts à l'analyse</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button onClick={onEdit} className={`btn-ghost ${styles.editButton}`}>Modifier la configuration</button>
        <button onClick={onConfirm} className={`btn-primary ${styles.confirmButton}`}>{isEditMode ? "Sauvegarder" : "Créer le pipeline"}</button>
      </div>
    </div>
  );
}
