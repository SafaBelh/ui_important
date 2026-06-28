import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import { deletePipeline, deleteTenant, deleteTenantAnalysisData } from "@/shared/model/destructiveActions";
import styles from "./DangerZoneSection.module.css";

function DangerCard({ id, icon, title, subtitle, confirmLabel, confirmHint, onExecute, state, onStateChange, disabled = false }) {
  const st = state || { input: "", open: false, done: false };
  const matches = st.input.trim() === confirmLabel;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <div className={styles.cardIcon}>
            <Icon name={icon} size={17} color={COLORS.red} />
          </div>
          <div>
            <div className={styles.cardTitle}>{title}</div>
            <div className={styles.cardSubtitle}>{subtitle}</div>
          </div>
        </div>
        {!st.open && !st.done && (
          <button disabled={disabled} onClick={() => onStateChange(id, { open: true })} className={styles.deleteButton}>
            <Icon name="trash2" size={13} color={COLORS.red} /> Supprimer
          </button>
        )}
        {st.done && (
          <span className={styles.done}>
            <Icon name="check" size={13} color={COLORS.success} /> Effectué
          </span>
        )}
      </div>
      {st.open && !st.done && (
        <div className={styles.confirmPanel}>
          <div className={styles.confirmText}>
            {confirmHint} Pour confirmer, saisissez exactement&nbsp;
            <code className={styles.confirmCode}>{confirmLabel}</code>
          </div>
          <div className={styles.confirmRow}>
            <input className={`input-field ${styles.confirmInput} ${matches ? styles.confirmInputMatched : ""}`} placeholder={`Saisissez : ${confirmLabel}`} value={st.input || ""} onChange={(e) => onStateChange(id, { input: e.target.value })} />
            <button disabled={!matches} onClick={() => { onExecute(); onStateChange(id, { open: false, input: "", done: true }); }} className={`${styles.confirmButton} ${matches ? styles.confirmButtonActive : ""}`}>
              <Icon name="trash2" size={13} color="#fff" /> Confirmer la suppression
            </button>
            <button onClick={() => onStateChange(id, { open: false, input: "" })} className={`btn-ghost ${styles.cancelButton}`}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DangerZoneSection({ pipelines, tenant, isAdmin, toast }) {
  const [confirmStates, setConfirmStates] = useState({});
  const onStateChange = (id, patch) =>
    setConfirmStates((p) => ({
      ...p,
      [id]: { ...(p[id] || { input: "", open: false, done: false }), ...patch },
    }));

  const tenantPipelines = pipelines || [];

  return (
    <div className={styles.root}>
      {/* Warning banner */}
      <div className={styles.warningBanner}>
        <Icon
          name="triangle"
          size={18}
          color={COLORS.red}
          className={styles.warningIcon}
        />
        <div>
          <div className={styles.warningTitle}>
            Zone dangereuse — actions irréversibles
          </div>
          <div className={styles.warningText}>
            Ces actions sont permanentes et ne peuvent pas être annulées. Chaque
            opération nécessite de saisir exactement le nom de l'élément à
            supprimer pour confirmation.
          </div>
        </div>
      </div>

      {/* Delete pipelines */}
      {tenantPipelines.length > 0 && (
        <div>
          <div className={styles.sectionTitle}>
            Pipelines
          </div>
          <div className={styles.cardList}>
            {tenantPipelines.map((p) => (
              <DangerCard
                key={`del_pipe_${p.id}`}
                id={`del_pipe_${p.id}`}
                icon="pipelines"
                title={`Supprimer "${p.name}"`}
                subtitle={`${p.connector} · ${
                  p.invoicesProcessed?.toLocaleString("fr-FR") || 0
                } factures · statut : ${p.status}`}
                confirmLabel={p.name}
                confirmHint="Cette action supprime définitivement le pipeline et toutes ses données associées."
                onExecute={() => {
                  deletePipeline(p.id);
                  toast(`Pipeline "${p.name}" supprimé`, "warning");
                }}
                state={confirmStates[`del_pipe_${p.id}`]}
                onStateChange={onStateChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete data */}
      {tenant && (
        <div>
          <div className={styles.sectionTitle}>
            Données
          </div>
          <div className={styles.cardList}>
            <DangerCard
              id="del_data"
              icon="trash2"
              title="Supprimer toutes les données d'analyse"
              subtitle="Alertes, scores, feedbacks — les pipelines et séries sont conservés"
              confirmLabel={`supprimer-données-${tenant.name}`}
              confirmHint="Supprime irrémédiablement toutes les alertes, anomalies détectées et feedbacks pour ce tenant."
              onExecute={() => {
                deleteTenantAnalysisData(tenant.id);
                toast("Données d'analyse supprimées", "warning");
              }}
              state={confirmStates["del_data"]}
              onStateChange={onStateChange}
            />
          </div>
        </div>
      )}

      {/* Delete tenant — admin only */}
      {isAdmin && tenant && (
        <div>
          <div className={styles.sectionTitle}>
            Tenant
          </div>
          <div className={styles.cardList}>
            <DangerCard
              id="del_client"
              icon="tenants"
              title={`Supprimer le tenant "${tenant.name}"`}
              subtitle={`Plan ${tenant.plan} · ${
                tenant.invoiceCount?.toLocaleString("fr-FR") || 0
              } factures · suppression totale et irréversible`}
              confirmLabel={tenant.name}
              confirmHint={`Supprime le tenant, tous ses pipelines, sous-tenants, alertes et données. Cette action est définitive.`}
              onExecute={() => {
                const ok = deleteTenant(tenant.id);
                if (ok) toast(`Tenant "${tenant.name}" supprimé`, "warning");
                else
                  toast(
                    "Impossible : des sous-tenants existent encore.",
                    "error"
                  );
              }}
              state={confirmStates["del_client"]}
              onStateChange={onStateChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
