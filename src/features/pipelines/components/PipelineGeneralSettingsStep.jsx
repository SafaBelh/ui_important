import { Helper, LBL } from "./PipelineConfigFormUi";
import styles from "./PipelineGeneralSettingsStep.module.css";

const EXECUTION_MODES = [
  { id: "automated", label: "Automatisé", desc: "Le moteur enchaîne mapping, nettoyage, séries, détection et ouvre le dashboard." },
  { id: "manual", label: "Manuel", desc: "Vous parcourez chaque étape et validez les résultats intermédiaires." },
];

const SCHEDULE_MODES = [
  { id: "MANUAL", label: "Manuel", desc: "À la demande" },
  { id: "CRON", label: "CRON", desc: "Planification cron" },
  { id: "POLLING", label: "Polling", desc: "Intervalle régulier" },
];

export function PipelineGeneralSettingsStep({
  pipeline,
  availablePartners,
  name,
  setName,
  desc,
  setDesc,
  executionMode,
  setExecutionMode,
  scheduleMode,
  setScheduleMode,
  cronExpression,
  setCronExpression,
  intervalMinutes,
  setIntervalMinutes,
}) {
  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.generalTitle}>Informations Générales</h3>
        <p className={styles.sectionDescription}>Définissez le nom, la description et le mode d'exécution de ce pipeline.</p>
      </div>
      <div>
        <LBL>NOM DU PIPELINE</LBL>
        <input value={name} onChange={(event) => setName(event.target.value)} className="input-field" placeholder="ex. Surveillance factures Acme 2024" />
      </div>
      {pipeline?.erpPartnerId && (
        <div>
          <LBL>CONNEXION ERP ASSOCIÉE</LBL>
          <div className={`input-field ${styles.erpField}`}>
            {availablePartners.find((partner) => partner.id === pipeline.erpPartnerId)?.name || pipeline.erpPartnerId}
          </div>
          <Helper>La liaison ERP est gérée depuis Integrations par l'administrateur.</Helper>
        </div>
      )}
      <div>
        <LBL>DESCRIPTION</LBL>
        <textarea value={desc} onChange={(event) => setDesc(event.target.value)} rows={2} className={`input-field ${styles.descriptionInput}`} placeholder="Décrivez ce que ce pipeline surveille…" />
      </div>
      <div>
        <LBL>MODE D'EXÉCUTION</LBL>
        <div className={styles.executionGrid}>
          {EXECUTION_MODES.map((mode) => {
            const selected = executionMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setExecutionMode(mode.id)}
                className={`${styles.executionButton} ${selected ? styles.executionButtonSelected : ""}`}
              >
                <div className={styles.executionLabel}>{mode.label}</div>
                <div className={`${styles.executionDescription} ${selected ? styles.executionDescriptionSelected : ""}`}>{mode.desc}</div>
              </button>
            );
          })}
        </div>
        <Helper>La saisonnalité et les prévisions restent toujours détectées automatiquement par le moteur.</Helper>
      </div>
      <div className={`${styles.sectionHeader} ${styles.scheduleHeader}`}>
        <h3 className={styles.scheduleTitle}>Rythme &amp; Planification</h3>
        <p className={styles.sectionDescription}>Planifiez la fréquence d'exécution du pipeline.</p>
      </div>
      <div>
        <div className={styles.scheduleModeList}>
          {SCHEDULE_MODES.map((mode) => (
            <button key={mode.id} type="button" onClick={() => setScheduleMode(mode.id)} className={`${styles.scheduleModeButton} ${scheduleMode === mode.id ? styles[`scheduleMode${mode.id}`] : ""}`}>
              {mode.label}
              <div className={styles.scheduleModeDescription}>{mode.desc}</div>
            </button>
          ))}
        </div>
        {scheduleMode === "CRON" && (
          <div>
            <LBL>EXPRESSION CRON</LBL>
            <input value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} className={`input-field ${styles.scheduleInput}`} placeholder="0 0 2 * * ?" />
            <Helper>Syntaxe Quartz/Spring — ex: 0 0 2 * * ? = tous les jours à 2h00</Helper>
          </div>
        )}
        {scheduleMode === "POLLING" && (
          <div>
            <LBL>INTERVALLE (MINUTES)</LBL>
            <input type="number" value={intervalMinutes} onChange={(event) => setIntervalMinutes(event.target.value)} className={`input-field ${styles.scheduleInput} ${styles.intervalInput}`} placeholder="15" />
            <Helper>Fréquence des vérifications en arrière-plan</Helper>
          </div>
        )}
      </div>
    </div>
  );
}
