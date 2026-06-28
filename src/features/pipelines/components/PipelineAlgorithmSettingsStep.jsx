import { Sparkles } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { SliderField } from "./PipelineConfigFormUi";
import styles from "./PipelineAlgorithmSettingsStep.module.css";

export function PipelineAlgorithmSettingsStep({
  tolPct,
  setTolPct,
  tolDays,
  setTolDays,
  kFactor,
  setKFactor,
  isEditMode,
  executionMode,
}) {
  return (
    <div className={styles.stack}>
      <div className={styles.header}>
        <h3 className={styles.title}>Paramètres Algorithmiques (MAD)</h3>
        <p className={styles.description}>Réglez la sensibilité et les tolérances du modèle d'intelligence artificielle.</p>
      </div>
      <SliderField label="TOLÉRANCE MONTANT" value={tolPct} min={0} max={50} step={5} onChange={setTolPct} fmt={(value) => `${value}%`} hint="Variation max par rapport à la prévision" />
      <SliderField label="TOLÉRANCE DATES" value={tolDays} min={1} max={60} step={1} onChange={setTolDays} fmt={(value) => `${value} j`} />
      <SliderField label="MINIMUM DE FACTURES PAR CLUSTER" value={kFactor} min={1} max={15} step={1} onChange={setKFactor} fmt={(value) => `${Math.round(value)} fact.`} hint="Nombre minimum de factures requis pour un cluster. En dessous de ce seuil, le cluster est automatiquement supprimé." />
      <div className={styles.infoBox}>
        <Sparkles size={13} color={COLORS.red} strokeWidth={2} className={styles.infoIcon} />
        <span className={styles.infoText}>
          {isEditMode
            ? "Les modifications sont appliquées immédiatement après sauvegarde."
            : executionMode === "automated"
            ? "Après création, le pipeline exécutera automatiquement toutes les étapes et ouvrira le dashboard final."
            : "Après création, vous pourrez parcourir manuellement chaque étape du workspace."}
        </span>
      </div>
    </div>
  );
}
