/**
 * Full ERP connector report modal: shows the connector's resolved config + a live
 * activation/processing status read from the backend. Opened from a connector card
 * and from the wizard. Extracted from IntegrationsView.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertCircle, CheckCircle2, CheckSquare, Clock, Copy, Cpu, Database, FileJson, GitBranch, Table2, Users, X, XCircle } from "lucide-react";
import { getTenantActivationStatus } from "@/features/integrations/api/IntegrationAdminApi";
import { INTEGRATION_REPORT_FALLBACK_TENANTS } from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { logError } from "@/shared/utils/logError";
import styles from "./ERPReportModal.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const connectorColorClass = (color) => {
  switch (String(color || "").toLowerCase()) {
    case "#6366f1": return styles.connectorIndigo;
    case "#3b82f6": return styles.connectorInfo;
    case "#059669": return styles.connectorEmerald;
    case "#f59e0b": return styles.connectorWarning;
    case "#8b5cf6": return styles.connectorPurple;
    default: return styles.connectorRed;
  }
};

const activationToneClass = (status) => {
  switch (status) {
    case "SUCCESS": return styles.activationSuccess;
    case "FAILED": return styles.activationError;
    case "PARTIAL_SUCCESS": return styles.activationWarning;
    case "RUNNING": return styles.activationInfo;
    default: return styles.activationMuted;
  }
};

export function ERPReportModal({ integration, onClose }) {
  const [copied, setCopied] = useState(false);
  // Real per-tenant activation state (jobs, imported rows, anomalies).
  const [activation, setActivation] = useState(null);
  useEffect(() => {
    if (!integration?.id) { setActivation({ rows: [], totals: {} }); return; }
    let live = true;
    getTenantActivationStatus({ connectorId: integration.id })
      .then(res => { if (live) setActivation({ rows: res?.rows || [], totals: res?.totals || {} }); })
      .catch((error) => { logError("erpReport.loadActivation", error); if (live) setActivation({ rows: [], totals: {}, error: true }); });
    return () => { live = false; };
  }, [integration?.id]);
  const actRows = activation?.rows || [];
  const actByExternal = new Map(actRows.map(r => [String(r.externalId), r]));
  const tenants = integration.tenants || INTEGRATION_REPORT_FALLBACK_TENANTS;
  const activeTenants = tenants.filter(t => t.active);
  const linkedTenants = tenants.filter(t => t.platformTenantName);
  const selectedTables = integration.selectedTables || ["FACTURES", "FOURNISSEURS", "COMMANDES", "BUDGETS"];
  const pipelines = integration.pipelines || {};
  const customPipelines = integration.customPipelines || [];
  const allPipelineKeys = [...Object.keys(pipelines), ...customPipelines.map(cp => cp.id)];
  const enabledPipelines = allPipelineKeys.filter(k => (pipelines[k] || {}).enabled !== false);

  const runDate = new Date().toLocaleString("fr-FR");
  // Real totals from the activation jobs (not from wizard config fields).
  const totalRecords = actRows.reduce((sum, r) => sum + (Number(r.totalRowsImported) || 0), 0);
  const totalAnomalies = actRows.reduce((sum, r) => sum + (Number(r.totalAnomaliesDetected) || 0), 0);

  const reportLogs = [
    { ts: "", type: "info", text: `Connecteur «${integration.name}» · ${selectedTables.length} tables · ${enabledPipelines.length} pipeline(s) modèle(s)` },
    { ts: "", type: "info", text: `${activeTenants.length} tenant(s) actif(s) sur ${tenants.length} configuré(s) · ${linkedTenants.length} lié(s) à la plateforme` },
    ...(activation === null
      ? [{ ts: "", type: "info", text: "Chargement de l'état d'activation…" }]
      : activation.error
        ? [{ ts: "", type: "warn", text: "État d'activation indisponible (vérifiez la connexion au backend)." }]
        : actRows.length === 0
          ? [{ ts: "", type: "warn", text: "Aucune activation enregistrée — déployez les pipelines depuis l'étape Tenants." }]
          : actRows.map(r => ({
              ts: "",
              type: r.jobStatus === "SUCCESS" ? "ok" : (r.jobStatus === "FAILED" || r.jobStatus === "PARTIAL_SUCCESS") ? "warn" : "info",
              text: `${r.externalId} — ${r.jobStatus || r.activationStatus || "non démarré"}`
                + (r.totalRowsImported ? ` · ${Number(r.totalRowsImported).toLocaleString("fr-FR")} lignes importées` : "")
                + (r.pipelinesTotal ? ` · ${r.pipelinesCompleted ?? 0}/${r.pipelinesTotal} pipelines` : ""),
            }))),
  ];

  const reportStr = JSON.stringify({
    generatedAt: new Date().toISOString(),
    connector: { id: integration.id, name: integration.name, type: integration.connectorType, auth: integration.authType, status: "ACTIVE" },
    tables: selectedTables,
    pipelines: enabledPipelines,
    tenants: activeTenants.map(t => ({ id: t.id, label: t.label, platformLink: t.platformTenantName || null, storageMode: t.storageMode === "isolated" ? "isolated" : "shared", dbConnection: t.storageMode === "isolated" ? (t.database?.jdbcUrl || null) : null, status: "ACTIVE" })),
    stats: { totalRecords, totalAnomalies, activeTenants: activeTenants.length, linkedTenants: linkedTenants.length },
  }, null, 2);

  const handleCopy = () => {
    try { navigator.clipboard?.writeText(reportStr); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerIdentity}>
            <div className={cx(styles.connectorLogo, connectorColorClass(integration.color))}>
              {integration.logo || (integration.name || "??").slice(0, 2)}
            </div>
            <div>
              <div className={cx("serif", styles.title)}>Rapport d'exécution</div>
              <div className={styles.subtitle}>{integration.name} · {runDate}</div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.copyButton} onClick={handleCopy}>
              {copied ? <CheckCircle2 size={13} color={INTEGRATION_COLORS.success} /> : <Copy size={13} />}
              {copied ? "Copié !" : "Copier JSON"}
            </button>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Stats row */}
          <div className={styles.statsRow}>
            {[
              { label: "Enregistrements", val: totalRecords.toLocaleString("fr-FR"), tone: "info", icon: <Database size={16} /> },
              { label: "Anomalies", val: totalAnomalies, tone: totalAnomalies > 20 ? "warning" : "success", icon: <AlertCircle size={16} /> },
              { label: "Tenants actifs", val: `${activeTenants.length}/${tenants.length}`, tone: "success", icon: <Cpu size={16} /> },
              { label: "Pipelines", val: enabledPipelines.length, tone: "red", icon: <GitBranch size={16} /> },
              { label: "Tables", val: selectedTables.length, tone: "purple", icon: <Table2 size={16} /> },
            ].map(s => (
              <div className={cx(styles.statCard, styles[`stat${s.tone.charAt(0).toUpperCase() + s.tone.slice(1)}`])} key={s.label}>
                <div className={styles.statIcon}>{s.icon}</div>
                <div className={styles.statValue}>{s.val}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Execution log */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Activity size={14} color={INTEGRATION_COLORS.info} />
              <span className={styles.sectionTitle}>Journal d'exécution</span>
              <span className={styles.sectionMeta}>{reportLogs.length} entrées</span>
            </div>
            {reportLogs.map((log, i) => (
              <div key={i} className={cx(styles.logLine, i % 2 !== 0 && styles.logLineAlt)}>
                <span className={styles.logTs}>{log.ts}</span>
                <span className={styles[`log${log.type.charAt(0).toUpperCase() + log.type.slice(1)}`]}>{log.type === "ok" ? "✓" : log.type === "warn" ? "⚠" : "·"} {log.text}</span>
              </div>
            ))}
          </div>

          {/* Tenant details */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Users size={14} color={INTEGRATION_COLORS.g500} />
              <span className={styles.sectionTitle}>Détails des tenants</span>
              <span className={styles.sectionMeta}>{tenants.length} configurés</span>
            </div>
            {tenants.map((t) => {
              const act = actByExternal.get(String(t.id));
              const records = Number(act?.totalRowsImported) || 0;
              const anomalies = Number(act?.totalAnomaliesDetected) || 0;
              return (
                <div key={t.id} className={styles.tenantRow}>
                  <div className={cx(styles.tenantStatus, t.active ? styles.tenantStatusActive : styles.tenantStatusInactive)}>
                    {t.active ? <CheckCircle2 size={16} color={INTEGRATION_COLORS.success} /> : <XCircle size={16} color={INTEGRATION_COLORS.g300} />}
                  </div>
                  <div className={styles.tenantMain}>
                    <div className={styles.tenantName}>{t.label || t.id}</div>
                    <div className={styles.tenantMeta}>
                      ID: <span className="mono">{t.id}</span>
                      {t.platformTenantName && <> · Lié à: {t.platformTenantName}</>}
                      <> · {t.storageMode === "isolated" ? "DB isolee" : "DB partagee"}</>
                    </div>
                  </div>
                  {t.active ? (
                    <div className={styles.badgeList}>
                      <span className={cx(styles.pipelineBadge, styles.badgeInfo)}>
                        <Database size={9} /> {records.toLocaleString("fr-FR")} rec.
                      </span>
                      {anomalies > 0 && (
                        <span className={cx(styles.pipelineBadge, styles.badgeWarning)}>
                          <AlertCircle size={9} /> {anomalies} anom.
                        </span>
                      )}
                      {(enabledPipelines.length > 0 ? enabledPipelines : ["facture", "commande"]).map(k => (
                        <span key={k} className={cx(styles.pipelineBadge, styles.badgeSuccess)}>
                          <CheckSquare size={9} /> {k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.inactiveText}>Inactif</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pipeline details */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <GitBranch size={14} color={INTEGRATION_COLORS.red} />
              <span className={styles.sectionTitle}>Pipelines configurés</span>
            </div>
            {(enabledPipelines.length > 0 ? enabledPipelines : ["facture", "commande"]).map((k) => {
              const pl = pipelines[k] || {};
              const tables2 = pl.tables || selectedTables.slice(0, 2);
              return (
                <div key={k} className={cx(styles.logLine, styles.pipelineLine)}>
                  <div className={styles.pipelineHeader}>
                    <span className={styles.pipelineName}>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                    <span className={styles.activeBadge}>ACTIF</span>
                    <span className={styles.pipelineMeta}>{tables2.length} table(s) source</span>
                  </div>
                  <div className={styles.tableBadgeList}>
                    {tables2.map(t => (
                      <span key={t} className={styles.tableBadge}>{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-tenant activation state (real jobs) */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Clock size={14} color={INTEGRATION_COLORS.g500} />
              <span className={styles.sectionTitle}>Activations par tenant</span>
              <span className={styles.sectionMeta}>{actRows.length} liaison(s)</span>
            </div>
            {actRows.length === 0 && (
              <div className={styles.emptyState}>
                {activation === null ? "Chargement…" : "Aucune activation — utilisez « Déployer » dans l'étape Tenants du wizard."}
              </div>
            )}
            {actRows.map((r, i) => {
              return (
                <div key={r.connectionId || i} className={cx(styles.logLine, i % 2 !== 0 && styles.logLineAlt)}>
                  <span className={cx(styles.logTs, "mono")}>{r.externalId}</span>
                  <span className={cx(styles.activationText, activationToneClass(r.jobStatus))}>
                    {r.jobStatus || r.activationStatus || "non démarré"}
                    {r.pipelinesTotal ? ` · ${r.pipelinesCompleted ?? 0}/${r.pipelinesTotal} pipelines` : ""}
                    {r.totalRowsImported ? ` · ${Number(r.totalRowsImported).toLocaleString("fr-FR")} lignes` : ""}
                    {r.totalAnomaliesDetected ? ` · ${r.totalAnomaliesDetected} anomalie(s)` : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* JSON export */}
          <div className={styles.jsonBlock}>
            <div className={styles.jsonHeader}>
              <FileJson size={14} color="#7dd3fc" />
              <span className={styles.jsonTitle}>Export JSON complet</span>
              <button className={styles.jsonCopyButton} onClick={handleCopy}>{copied ? <CheckCircle2 size={12} color="#4ade80" /> : <Copy size={12} />} {copied ? "Copié !" : "Copier"}</button>
            </div>
            <pre className={styles.jsonPre}>{reportStr}</pre>
          </div>

          <div className={styles.bodySpacer} />
        </div>
      </div>
    </div>,
    document.body
  );
}
