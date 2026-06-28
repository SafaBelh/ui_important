import { Microscope } from "lucide-react";
import { Spinner } from "@/shared/ui/Spinner";
import { formatEuro } from "@/utils/formatters";
import styles from "./DashboardTabs.module.css";

function TestResultPanel({ result }) {
  if (!result) {
    return (
      <div className={styles.emptyTestState}>
        <div className={styles.emptyTestIcon}>
          <Microscope size={48} strokeWidth={1} />
        </div>
        <div className={styles.emptyTestTitle}>Prêt à tester</div>
        <div className={styles.emptyTestText}>Remplissez le formulaire et cliquez Tester</div>
      </div>
    );
  }

  if (result.error) {
    return <div className={styles.testError}>⚠ {result.error}</div>;
  }

  const statusClass = result.score > 85 ? "statusCritical" : result.score > 60 ? "statusWarn" : "statusOk";

  return (
    <div className="fade-in">
      <div className={`glass-card ${styles.resultCard} ${styles[statusClass]}`}>
        <div className={styles.resultTitle}>Résultat — {formatEuro(Math.round(result.amt))}</div>
        <div className={styles.scoreRow}>
          <div className={styles.scoreValue}>{result.score}</div>
          <div className={styles.scoreMeterWrap}>
            <progress className={styles.scoreMeter} value={result.score} max="100" aria-label="Score d'anomalie" />
            <div className={styles.zoneRow}>
              {[
                ["OK", "toneSuccess"],
                ["ALERTE", "toneWarning"],
                ["CRITIQUE", "toneRed"],
              ].map(([label, tone]) => (
                <div key={label} className={`${styles.scoreZone} ${styles[tone]}`}>
                  <div className={styles.scoreZoneText}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.statusPill}>
          <div className={styles.statusDot} />
          <span className={styles.statusText}>{result.severity}</span>
        </div>
      </div>

      <div className={`glass-card ${styles.detailsCard}`}>
        <div className={styles.detailsTitle}>🔍 Détails</div>
        <div className={styles.detailsNote}>{result.note}</div>
        <div className={styles.detailsGrid}>
          {[
            ["Référence", formatEuro(Math.round(result.mu)), "toneInfo"],
            ["Seuil max", formatEuro(Math.round(result.maxAcc)), "toneWarning"],
            ["CV", `${(result.cv * 100).toFixed(1)}%`, "toneGrey"],
            ["# Factures", result.n, "toneGrey"],
          ].map(([label, value, tone]) => (
            <div key={label} className={`${styles.detailMetric} ${styles[tone]}`}>
              <div className={styles.detailMetricLabel}>{label}</div>
              <div className={styles.detailMetricValue}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardTestingTab({
  supplierOptions,
  labelOptions,
  supplier,
  label,
  amount,
  date,
  result,
  running,
  onSupplierChange,
  onLabelChange,
  onAmountChange,
  onDateChange,
  onRunTest,
  onAddAndDetect,
}) {
  return (
    <div className="fade-in">
      <div className={styles.testingGrid}>
        <div className={`glass-card ${styles.testingCard}`}>
          <div className={styles.testingTitle}>Simuler / Tester une facture</div>
          <div className={styles.testingSubtitle}>Score calculé en temps réel — cliquez "Ajouter & Détecter" pour l'insérer de manière cohérente dans les données.</div>
          <div className={styles.fieldStack}>
            <div>
              <label className={styles.fieldLabel}>Fournisseur *</label>
              <select className="input-field" value={supplier} onChange={(event) => onSupplierChange(event.target.value)}>
                <option value="">— Sélectionner —</option>
                {supplierOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            {supplier && labelOptions.length > 0 && (
              <div>
                <label className={styles.fieldLabel}>Service / Libellé</label>
                <select className="input-field" value={label} onChange={(event) => onLabelChange(event.target.value)}>
                  <option value="">— Tous services —</option>
                  {labelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <div className={styles.fieldHelp}>Sélectionnez un service pour affiner la référence.</div>
              </div>
            )}

            <div>
              <label className={styles.fieldLabel}>Montant (€) *</label>
              <input className="input-field" type="number" step="0.01" placeholder="ex: 1450.00" value={amount} onChange={(event) => onAmountChange(event.target.value)} />
            </div>

            <div>
              <label className={styles.fieldLabel}>Date</label>
              <input className="input-field" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
            </div>

            <div className={styles.buttonRow}>
              <button className={`btn-ghost ${styles.buttonFill}`} onClick={onRunTest} disabled={!supplier || !amount || running}>
                {running ? <><Spinner size={14} />Calcul…</> : "Tester (simulation)"}
              </button>
              <button className={`btn-primary ${styles.buttonFill}`} onClick={onAddAndDetect} disabled={!supplier || !amount || running}>
                {running ? <><Spinner size={14} color="#fff" />Insertion…</> : "➕ Ajouter & Détecter"}
              </button>
            </div>
          </div>
        </div>
        <div>{!running && <TestResultPanel result={result} />}</div>
      </div>
    </div>
  );
}
