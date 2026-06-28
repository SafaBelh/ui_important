import { CheckCircle2, Clock } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { Helper, LBL, SectionHeader, TagInput } from "./PipelineConfigFormUi";
import styles from "./PipelineStatusWorkflowSection.module.css";

export function PipelineStatusWorkflowSection({
  statusCol,
  setStatusCol,
  importStartDate,
  setImportStartDate,
  allowedStatuses,
  setAllowedStatuses,
  provisionalStatuses,
  setProvisionalStatuses,
  finalStatuses,
  setFinalStatuses,
}) {
  return (
    <div className={styles.root}>
      <SectionHeader num="3" title="Filtrage Ciblé & Workflow Statuts" sub="optionnel" color="blue" />

      <div className={styles.topGrid}>
        <div>
          <LBL>COLONNE STATUT</LBL>
          <input value={statusCol} onChange={(event) => setStatusCol(event.target.value)} className="input-field" placeholder="f.statut" />
          <Helper>Ex: f.statut (JDBC) ou statut (CSV)</Helper>
        </div>
        <div>
          <LBL>DATE DE DÉPART</LBL>
          <input type="date" value={importStartDate} onChange={(event) => setImportStartDate(event.target.value)} className="input-field" placeholder="dd/mm/yyyy" />
          <Helper>Ignorer les données antérieures à cette date</Helper>
        </div>
      </div>

      <div className={styles.allowedStatuses}>
        <LBL>STATUTS AUTORISÉS</LBL>
        <TagInput value={allowedStatuses} onChange={setAllowedStatuses} placeholder="Ajouter un statut, puis Entrée" accent={COLORS.info} />
        <Helper>Seuls ces statuts seront importés dans le pipeline</Helper>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.cardOrange}>
          <div className={styles.cardOrangeHeader}>
            <Clock size={12} color="#d97706" strokeWidth={2} />
            <span>Statuts Provisoires</span>
          </div>
          <TagInput value={provisionalStatuses} onChange={setProvisionalStatuses} placeholder="Ajouter un statut provisoire" accent="#d97706" />
          <div className={styles.cardOrangeHelper}>Fixent la date de réception. Données encore modifiables.</div>
        </div>

        <div className={styles.cardGreen}>
          <div className={styles.cardGreenHeader}>
            <CheckCircle2 size={12} color="#16a34a" strokeWidth={2} />
            <span>Statuts Finaux</span>
          </div>
          <TagInput value={finalStatuses} onChange={setFinalStatuses} placeholder="Ajouter un statut final" accent="#16a34a" />
          <div className={styles.cardGreenHelper}>Fixent le montant définitif. Clôture comptable.</div>
        </div>
      </div>
    </div>
  );
}
