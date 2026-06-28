import { useEffect, useMemo, useState } from "react";
import { GitBranchPlus } from "lucide-react";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Icon } from "@/shared/ui/Icon";
import { Modal } from "@/shared/ui/Modal";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useToast } from "@/contexts/toastContextValue";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesByTenantId, selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { updatePipelineStore } from "@/features/pipelines/model/pipelineActions";
import { loadPipelinesForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { addAuditEntry } from "@/features/audit/model/auditActions";
import { runPipeline, updatePipeline } from "@/features/pipelines/api/pipelinesApi";
import { MLContent } from "@/features/pipelines/components/MLContent";
import { PipelineConfigForm } from "@/features/pipelines/components/PipelineConfigForm";
import { PipelineWorkspaceView } from "@/features/pipelines/pages/PipelineWorkspaceView";
import { PipelineRunReportDrawer } from "@/features/pipelines/components/PipelineRunReportDrawer";
import { logError } from "@/shared/utils/logError";
import styles from "./PipelinesView.module.css";
export function PipelinesView({ onNavigateToPipeline }) {
  const toast = useToast();
  const { tenant, isEngineAdmin } = useSession();
  const [mlPipeline, setMlPipeline] = useState(null);
  const [configPipeline, setConfigPipeline] = useState(null);
  const [auditPipeline, setAuditPipeline] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [runningPipelineId, setRunningPipelineId] = useState(null);

  // Manual run: triggers a full import/detection cycle on the existing
  // pipeline (no redeploy — redeploying would create duplicate pipelines).
  const runPipelineNow = async (p) => {
    if (runningPipelineId) return;
    setRunningPipelineId(p.id);
    toast("Exécution du pipeline lancée…", "info");
    try {
      const run = await runPipeline(p.id, { adminTenantId: p.tenantId });
      const imported = run?.invoicesImported ?? 0;
      const skipped = run?.invoicesSkipped ?? 0;
      if (String(run?.status || "").toUpperCase() === "FAILED") {
        toast(run?.errorMessage || "Échec du run — voir l'audit", "error");
      } else {
        toast(`Run terminé : ${imported} importée(s), ${skipped} ignorée(s)`, imported > 0 ? "success" : "warning");
      }
      await loadPipelinesForTenant(p.tenantId).catch((error) => logError("pipelines.reloadAfterRun", error));
    } catch (err) {
      toast(err.message || "Échec de l'exécution du pipeline", "error");
      await loadPipelinesForTenant(p.tenantId).catch((error) => logError("pipelines.reloadAfterRunError", error));
    } finally {
      setRunningPipelineId(null);
    }
  };

  // ── Workspace modal state (lifted so it survives modal↔fullscreen toggle) ──
  const [workspacePipelineId, setWorkspacePipelineId] = useState(null);
  const [wsPage, setWsPage] = useState("mapping");
  const [wsUploadData, setWsUploadData] = useState(null);
  const [wsMappingResult, setWsMappingResult] = useState(null);
  const [wsSeriesResult, setWsSeriesResult] = useState(null);
  const [wsFinalResult, setWsFinalResult] = useState(null);

  const openWorkspaceModal = (id) => {
    setWorkspacePipelineId(id);
    setWsPage("mapping");
    setWsUploadData(null);
    setWsMappingResult(null);
    setWsSeriesResult(null);
    setWsFinalResult(null);
  };

  useEffect(() => {
    if (!workspacePipelineId) return;
    try {
      sessionStorage.setItem(`anomalyiq.workspace.${workspacePipelineId}`, JSON.stringify({
        mappingResult: wsMappingResult,
        seriesResult: wsSeriesResult,
        finalResult: wsFinalResult,
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      logError("pipelines.workspaceCache", error);
    }
  }, [workspacePipelineId, wsMappingResult, wsSeriesResult, wsFinalResult]);

  const [adminTenantFilter, setAdminTenantFilter] = useState("");
  const tenants = useAppSelector(selectTenants);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const tenantPipelines = useAppSelector((state) => selectPipelinesForTenant(state, tenant?.id));
  const allTenants = useMemo(() => {
    if (!isEngineAdmin) return [];
    return tenants;
  }, [isEngineAdmin, tenants]);
  const allTenantsKey = allTenants.map(t => t.id).join(",");

  useEffect(() => {
    if (isEngineAdmin) loadTenants().catch((error) => logError("pipelines.loadTenants", error));
  }, [isEngineAdmin]);

  useEffect(() => {
    if (tenant?.id) {
      loadPipelinesForTenant(tenant.id).catch((error) => logError("pipelines.loadTenantPipelines", error));
      return;
    }
    if (isEngineAdmin && adminTenantFilter) {
      loadPipelinesForTenant(adminTenantFilter).catch((error) => logError("pipelines.loadAdminTenantPipelines", error));
      return;
    }
    if (isEngineAdmin && allTenantsKey) {
      Promise.all(allTenantsKey.split(",").map(id => loadPipelinesForTenant(id))).catch((error) => logError("pipelines.loadAllTenantPipelines", error));
    }
  }, [tenant?.id, isEngineAdmin, adminTenantFilter, allTenantsKey]);

  if (!tenant && !isEngineAdmin) return null;
  const pipelines = tenant
    ? tenantPipelines
    : isEngineAdmin && adminTenantFilter
      ? pipelinesByTenantId[adminTenantFilter] || []
      : isEngineAdmin
        ? allTenants.flatMap(t => pipelinesByTenantId[t.id] || [])
        : [];
  const actifs = pipelines.filter((p) => p.status === "actif").length;

  return (
    <div className={`fade-up ${styles.page}`}>
      <PageHeader
        eyebrow="Automation"
        title="Pipelines"
        subtitle={<>{pipelines.length} pipeline{pipelines.length > 1 ? "s" : ""} · {actifs} actif{actifs > 1 ? "s" : ""} · <strong className={styles.tenantName}>{tenant?.name || (adminTenantFilter ? allTenants.find(t => t.id === adminTenantFilter)?.name || adminTenantFilter : "Tous les tenants")}</strong></>}
        actions={(
          <>
          {!tenant && isEngineAdmin && allTenants.length > 0 && (
            <select value={adminTenantFilter} onChange={e => setAdminTenantFilter(e.target.value)} className={styles.tenantSelect}>
              <option value="">Tous les tenants</option>
              {allTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {pipelines.length > 0 && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <span className={styles.createIcon}>+</span> Nouveau pipeline
            </button>
          )}
          </>
        )}
      />
      <div className={styles.pipelineGrid}>
        {pipelines.length === 0 && (
          <div className={styles.emptyStateWrap}>
            <EmptyState
              icon={<GitBranchPlus size={32} color={COLORS.red} strokeWidth={1.8} />}
              title="Aucun pipeline configuré"
              subtitle="Créez votre premier pipeline pour commencer à analyser vos factures et détecter des anomalies automatiquement."
              cta="Créer votre premier pipeline →"
              onCta={() => setShowCreate(true)}
            />
          </div>
        )}
        {pipelines.map((p) => {
          const isPaused = p.status === "paused";
          const isError = p.status === "warning";
          const isFailed = p.status === "failed";
          // CURRENT anomaly count/rate from the backend pipeline DTO (no client
          // aggregation over the invoice store). Describes the present state.
          const anomalyCount = p.currentAnomalyCount ?? 0;
          const anomalyRate = (p.anomalyRate ?? 0) * 100;
          const tolerancePct = p.tolerancePct ?? p.config?.tolerancePct ?? 15;
          const toleranceDays = p.toleranceDays ?? p.config?.toleranceDays ?? 10;
          // Kind-aware unit: a commande pipeline counts commandes, not factures.
          const kindStr = String(p.kind || p.templateKey || "").toUpperCase();
          const isCommande = kindStr.includes("COMMANDE") || kindStr.includes("CMD");
          const unitLabel = isCommande ? "Commandes" : "Factures";
          const statusColor =
            p.status === "actif" ? COLORS.success : isFailed ? COLORS.red : isError ? COLORS.warning : COLORS.grey400;
          const statusLabel =
            p.status === "actif" ? "Actif" : isFailed ? "Échec d'activation" : isError ? "Alerte" : "En pause";
          const statusIcon =
            p.status === "actif"
              ? "check"
              : isFailed
              ? "triangle"
              : isError
              ? "triangle"
              : "pauseCircle";
          return (
            <div
              key={p.id}
              className={`glass-card ${styles.pipelineCard}`}
              onClick={() => setConfigPipeline(p)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleBlock}>
                  <div className={styles.cardTitle}>
                    {p.name}
                  </div>
                  <div className={styles.cardMeta}>
                    <span
                      className={`${styles.statusDot} ${
                        p.status === "actif"
                          ? styles.statusDotActive
                          : isFailed
                          ? styles.statusDotFailed
                          : isError
                          ? styles.statusDotWarning
                          : styles.statusDotPaused
                      }`}
                    />
                    {p.connector} · {p.freq}
                  </div>
                </div>
                <span
                  className={`${styles.statusBadge} ${
                    p.status === "actif"
                      ? styles.statusBadgeActive
                      : isFailed
                      ? styles.statusBadgeFailed
                      : isError
                      ? styles.statusBadgeWarning
                      : styles.statusBadgePaused
                  }`}
                >
                  <Icon name={statusIcon} size={11} color={statusColor} />
                  {statusLabel}
                </span>
              </div>
              {p.description && (
                <p className={styles.description}>
                  {p.description}
                </p>
              )}
              {isFailed && p.activationError && (
                <div className={styles.activationError}>
                  Échec d'activation : {p.activationError}
                </div>
              )}
              {/* Standalone custom pipelines (no connector) are not part of any
                  ERP budget context until explicitly mapped. */}
              {!p.connectorId && (
                <div
                  className={styles.unmappedNotice}
                  title="Ce pipeline n'est pas rattaché à un connecteur ERP : il alimente les séries et anomalies, mais pas le budget ERP tant qu'il n'est pas mappé à un contexte budget."
                >
                  <span>Non liée à un contexte budget</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toast("Pour inclure ce pipeline au budget, mappez-le à un connecteur dans Intégrations → Budget.", "info");
                    }}
                    className={styles.mapBudgetButton}
                  >
                    Mapper au budget →
                  </button>
                </div>
              )}
              {/* (Removed the client-computed 12-month sparkline — anomaly analytics
                  are backend-only; the current-rate KPI below comes from the API.) */}
              <div className={styles.kpiGrid}>
                {[
                  {
                    lbl: unitLabel,
                    val: p.invoicesProcessed.toLocaleString("fr-FR"),
                    sub: null,
                    cardClass: styles.kpiCardNeutral,
                    valueClass: styles.kpiValueNeutral,
                  },
                  {
                    lbl: "Taux anomalies",
                    val: `${anomalyRate.toFixed(1)}%`,
                    sub: `${anomalyCount} détectées`,
                    cardClass: styles.kpiCardWarning,
                    valueClass: anomalyRate > 3 ? styles.kpiValueDanger : styles.kpiValueWarning,
                  },
                  {
                    lbl: "Tolérance",
                    rows: [`(±) ${tolerancePct}% Montant`, `(±) ${toleranceDays} Jours`],
                    cardClass: styles.kpiCardInfo,
                    valueClass: styles.kpiValueInfo,
                  },
                ].map((k) => (
                  <div
                    key={k.lbl}
                    className={`${styles.kpiCard} ${k.cardClass}`}
                  >
                    <div className={styles.kpiLabel}>
                      {k.lbl}
                    </div>
                    {k.rows ? (
                      <div className={styles.kpiRows}>
                        {k.rows.map((row) => (
                          <div
                            key={row}
                            className={`${styles.kpiRowValue} ${k.valueClass}`}
                          >
                            {row}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className={`${styles.kpiValue} ${k.valueClass}`}
                      >
                        {k.val}
                      </div>
                    )}
                    {!k.rows && k.sub && (
                      <div className={styles.kpiSub}>
                        {k.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.lastRun}>
                  Dernier run :{" "}
                  {p.lastRun
                    ? new Date(p.lastRun).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Jamais exécuté"}
                </span>
                <div className={styles.actionGroup}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      runPipelineNow(p);
                    }}
                    disabled={runningPipelineId !== null}
                    title="Lancer le pipeline maintenant (import + détection)"
                    className={`btn-icon ${runningPipelineId && runningPipelineId !== p.id ? styles.dimmedAction : ""}`}
                  >
                    <Icon
                      name={runningPipelineId === p.id ? "refresh" : "play"}
                      size={15}
                      color={runningPipelineId === p.id ? COLORS.warning : COLORS.success}
                    />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setAuditPipeline(p);
                    }}
                    className="btn-icon"
                    title="Audit du dernier run"
                  >
                    <Icon name="fileText" size={15} color={COLORS.grey600} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setMlPipeline(p);
                    }}
                    className="btn-icon"
                    title="Analyse ML"
                  >
                    <Icon name="sparkle" size={15} color={COLORS.grey600} />
                  </button>
                  {/* "Séries & regroupement" (manage-mode workspace) removed: its
                      multi-step flow was incomplete and a likely source of bugs.
                      Group-by is configured in the ERP connector wizard. */}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfigPipeline(p);
                    }}
                    className="btn-icon"
                    title="Configurer"
                  >
                    <Icon name="gear" size={15} color={COLORS.grey600} />
                  </button>
                  <button
                    onClick={async (event) => {
                      event.stopPropagation();
                      try {
                        // Persisted: the backend also (un)arms the schedule.
                        await updatePipeline(p.id, {
                          status: isPaused ? "ACTIVE" : "DRAFT",
                          adminTenantId: p.tenantId,
                        });
                        updatePipelineStore(p.id, {
                          status: isPaused ? "actif" : "paused",
                        });
                        toast(
                          isPaused ? "Pipeline démarré" : "Pipeline mis en pause",
                          "info"
                        );
                      } catch (err) {
                        toast(err.message || "Changement de statut impossible", "error");
                      }
                    }}
                    className="btn-icon"
                    title={isPaused ? "Démarrer" : "Mettre en pause"}
                  >
                    <Icon
                      name={isPaused ? "play" : "pauseCircle"}
                      size={15}
                      color={COLORS.grey600}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        
      </div>

      <Modal
        open={!!mlPipeline}
        onClose={() => setMlPipeline(null)}
        size="1280px"
        title={mlPipeline ? `Analyse ML — ${mlPipeline.name}` : ""}
        subtitle="Vue analytics complète · Tendances · Anomalies · Séries · Radar · Scores · Insights IA"
        icon={
          <div className={`${styles.modalIcon} ${styles.mlModalIcon}`}>
            <Icon name="sparkle" size={18} color="#fff" />
          </div>
        }
      >
        {mlPipeline && <MLContent pipeline={mlPipeline} />}
      </Modal>

      <PipelineRunReportDrawer
        open={!!auditPipeline}
        pipeline={auditPipeline}
        tenantName={auditPipeline ? (allTenants.find(t => t.id === auditPipeline.tenantId)?.name || tenant?.name) : ""}
        onClose={() => setAuditPipeline(null)}
      />

      <Modal
        open={!!configPipeline}
        onClose={() => setConfigPipeline(null)}
        size="1200px"
        noScroll
        title={configPipeline ? `Configuration — ${configPipeline.name}` : ""}
        subtitle="Connexion · Tolérances · MAD"
        icon={
          <div className={`${styles.modalIcon} ${styles.configModalIcon}`}>
            <Icon name="gear" size={18} color={COLORS.red} />
          </div>
        }
      >
        {configPipeline && (
          <PipelineConfigForm
            pipeline={configPipeline}
            mode="compact"
            onCancel={() => setConfigPipeline(null)}
            onSubmitted={() => {
              loadPipelinesForTenant(configPipeline.tenantId || tenant?.id || adminTenantFilter).catch((error) => logError("pipelines.reloadAfterConfig", error));
              setConfigPipeline(null);
              toast("Pipeline mis à jour", "success");
            }}
          />
        )}
      </Modal>

      {/* ── Pipeline workspace modal (opened after pipeline creation) ── */}
      {workspacePipelineId && (
        <PipelineWorkspaceView
          pipelineId={workspacePipelineId}
          inModal={true}
          onBack={() => setWorkspacePipelineId(null)}
          onOpenFullPage={() => onNavigateToPipeline(workspacePipelineId, wsPage)}
          wsPage={wsPage}
          setWsPage={setWsPage}
          wsUploadData={wsUploadData}
          setWsUploadData={setWsUploadData}
          wsMappingResult={wsMappingResult}
          setWsMappingResult={setWsMappingResult}
          wsSeriesResult={wsSeriesResult}
          setWsSeriesResult={setWsSeriesResult}
          wsFinalResult={wsFinalResult}
          setWsFinalResult={setWsFinalResult}
          resetWsState={() => {
            try { sessionStorage.removeItem(`anomalyiq.workspace.${workspacePipelineId}`); } catch (error) { logError("pipelines.workspaceCacheClear", error); }
            setWsPage("mapping");
            setWsUploadData(null);
            setWsMappingResult(null);
            setWsSeriesResult(null);
            setWsFinalResult(null);
          }}
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        size="1200px"
        noScroll
        title="Nouveau pipeline"
        subtitle="Pipeline · connexion · config globale — sur un seul écran"
        icon={
          <div className={`${styles.modalIcon} ${styles.createModalIcon}`}>
            <Icon name="sparkle" size={18} color="#fff" />
          </div>
        }
      >
        <PipelineConfigForm
          mode="wizard"
          tenantId={tenant?.id || adminTenantFilter || allTenants[0]?.id || null}
          onCancel={() => setShowCreate(false)}
          onSubmitted={(id) => {
            if (!id) {
              toast("Impossible de créer le pipeline : aucun tenant sélectionné", "error");
              return;
            }
            loadPipelinesForTenant(tenant?.id || adminTenantFilter || allTenants[0]?.id).catch((error) => logError("pipelines.reloadAfterCreate", error));
            setShowCreate(false);
            openWorkspaceModal(id);
            toast("Pipeline créé !", "success");
            addAuditEntry("Pipeline créé", id);
          }}
        />
      </Modal>
    </div>
  );
}
