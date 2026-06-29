import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Check, Clock, Cpu, Database, Filter,
  Play, RefreshCw, ScrollText, X
} from "lucide-react";
import { COLORS } from "@/constants/colors";
import { getDocuments } from "@/features/documents/api/documentsApi";
import { getPipelineRunLogs, getPipelineRuns } from "@/features/pipelines/api/pipelinesApi";
import { getUser } from "@/shared/api/authStorage";
import { logError } from "@/shared/utils/logError";
import styles from "./PipelineRunReportDrawer.module.css";

// Real execution report: runs come from GET /pipelines/{id}/runs and the log
// entries from GET /pipelines/{id}/runs/{runId}/logs — nothing is synthesized.

function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "medium" }) : "—";
}
function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}
function formatEuroAmount(v) {
  return v == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

const RUN_STATUS_CFG = {
  SUCCESS: { color: COLORS.success, label: "SUCCÈS" },
  EMPTY: { color: COLORS.warning, label: "VIDE" },
  FAILED: { color: COLORS.red, label: "ÉCHEC" },
  RUNNING: { color: COLORS.info, label: "EN COURS" },
};
const LOG_STATUS_COLORS = {
  IMPORTED: COLORS.success, OK: COLORS.success, SUCCESS: COLORS.success,
  SKIPPED: COLORS.warning, DUPLICATE: COLORS.warning, FILTERED: COLORS.warning, PROVISIONAL: COLORS.info,
  ERROR: COLORS.red, FAILED: COLORS.red, REJECTED: COLORS.red,
};
const IGNORED_STATUSES = ["SKIPPED", "DUPLICATE", "FILTERED", "REJECTED", "ERROR", "FAILED"];

const applyVars = (node, vars) => {
  if (!node) return;
  Object.entries(vars).forEach(([key, value]) => node.style.setProperty(key, value));
};

const rawLineClass = (line) => {
  if (line.includes("ERROR") || line.includes("FAILED")) return styles.rawLineError;
  if (line.includes("START") || line.includes("SUCCESS")) return styles.rawLineSuccess;
  return styles.rawLineMuted;
};

function Badge({ children, color }) {
  return (
    <span className={styles.badge} ref={(node) => applyVars(node, { "--badge-color": color, "--badge-bg": `${color}14`, "--badge-border": `1px solid ${color}40` })}>
      {children}
    </span>
  );
}

function KV({ label, value }) {
  return (
    <div className={styles.kv}>
      <span className={styles.kvLabel}>{label}</span>
      <span className={styles.kvValue}>{value}</span>
    </div>
  );
}

function LogLine({ log, index }) {
  const status = String(log.status || "").toUpperCase();
  const color = LOG_STATUS_COLORS[status] || COLORS.grey500;
  return (
    <div className={`${styles.logLine} ${index % 2 ? styles.logLineAlt : styles.logLineBase}`}>
      <span className={styles.logTime}>{fmtTime(log.createdAt)}</span>
      <span className={styles.logStatus} ref={(node) => applyVars(node, { "--log-status-color": color, "--log-status-bg": `${color}12`, "--log-status-border": `1px solid ${color}35` })}>{status || "INFO"}</span>
      <div className={styles.logBody}>
        <div className={styles.logSummary}>
          {log.rawSummary || log.reason || "—"}
          {log.supplier && <span className={styles.logSupplier}> · {log.supplier}</span>}
          {log.amount != null && <span className={styles.logAmount}> · {formatEuroAmount(log.amount)}</span>}
          {log.invoiceDate && <span className={styles.logDate}> · {String(log.invoiceDate).slice(0, 10)}</span>}
        </div>
        {log.reason && log.rawSummary && <div className={styles.logReason}>{log.reason}</div>}
      </div>
    </div>
  );
}

export function PipelineRunReportDrawer({ open, onClose, pipeline, tenantName }) {
  const [runs, setRuns] = useState(null);          // null = loading
  const [runsError, setRunsError] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [logs, setLogs] = useState(null);          // null = loading
  const [activeSection, setActiveSection] = useState("journal");
  const [reloadKey, setReloadKey] = useState(0);
  const [noiseInvoices, setNoiseInvoices] = useState([]);  // rows removed by cleaning / noise clusters

  const adminParams = () => {
    const user = getUser();
    return user?.isEngineAdmin && pipeline?.tenantId ? { adminTenantId: pipeline.tenantId } : {};
  };

  // Load run history when the drawer opens
  useEffect(() => {
    if (!open || !pipeline?.id) return;
    let live = true;
    setRuns(null);
    setRunsError(null);
    setSelectedRunId(null);
    setLogs(null);
    getPipelineRuns(pipeline.id, { size: 20, ...adminParams() })
      .then(res => {
        if (!live) return;
        const list = (res?.content || res || []).slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
        setRuns(list);
        if (list.length > 0) setSelectedRunId(list[0].id);
      })
      .catch(err => { if (live) { setRuns([]); setRunsError(err.message || "Impossible de charger les exécutions"); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline?.id, reloadKey]);

  // Load real log entries for the selected run
  useEffect(() => {
    if (!open || !pipeline?.id || !selectedRunId) return;
    let live = true;
    setLogs(null);
    getPipelineRunLogs(pipeline.id, selectedRunId, { size: 500, ...adminParams() })
      .then(res => { if (live) setLogs(res?.content || res || []); })
      .catch((error) => { logError("pipelineRunReport.loadLogs", error); if (live) setLogs([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline?.id, selectedRunId]);

  // Rows removed during cleaning / noise clusters are stored on the invoice
  // (status NOISE + ignore_reason), not as run logs — fetch them so the user sees
  // exactly which rows were skipped and why (incl. first-run noisy clusters).
  useEffect(() => {
    if (!open || !pipeline?.id) { setNoiseInvoices([]); return; }
    let live = true;
    getDocuments({ pipelineId: pipeline.id, status: "NOISE", size: 500, ...adminParams() })
      .then(res => { if (live) setNoiseInvoices(res?.content || res || []); })
      .catch((error) => { logError("pipelineRunReport.loadNoiseInvoices", error); if (live) setNoiseInvoices([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pipeline?.id, reloadKey]);

  const run = useMemo(() => (runs || []).find(r => r.id === selectedRunId) || null, [runs, selectedRunId]);
  const sortedLogs = useMemo(() => (logs || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))), [logs]);
  const noiseLines = useMemo(() => (noiseInvoices || []).map(inv => ({
    id: inv.id,
    status: "SKIPPED",
    createdAt: inv.importedAt || inv.createdAt,
    rawSummary: "Ligne retirée au nettoyage (cluster bruité / hors série)",
    reason: inv.ignoreReason || "Retirée par le clustering (cluster trop petit)",
    supplier: inv.supplier || inv.groupLabel || inv.groupKey,
    amount: inv.amount,
    invoiceDate: inv.date,
  })), [noiseInvoices]);
  const ignoredLogs = useMemo(() => {
    const fromLogs = sortedLogs.filter(l => IGNORED_STATUSES.includes(String(l.status || "").toUpperCase()));
    return [...fromLogs, ...noiseLines];
  }, [sortedLogs, noiseLines]);
  const statusCounts = useMemo(() => {
    const m = {};
    sortedLogs.forEach(l => { const st = String(l.status || "INFO").toUpperCase(); m[st] = (m[st] || 0) + 1; });
    return m;
  }, [sortedLogs]);

  if (!open || !pipeline) return null;

  const durationMs = run?.startedAt && run?.finishedAt ? new Date(run.finishedAt) - new Date(run.startedAt) : null;
  const statusCfg = RUN_STATUS_CFG[String(run?.status || "").toUpperCase()] || { color: COLORS.grey500, label: String(run?.status || "—") };

  const rawLines = run ? [
    `[${fmtTime(run.startedAt)}] PIPELINE START - ${run.id}`,
    `  Pipeline  : ${pipeline.name}`,
    `  Tenant    : ${tenantName || pipeline.tenantId || "—"}`,
    `  Source    : ${pipeline.connector || pipeline.sourceType || "—"}`,
    ``,
    ...sortedLogs.map(l => `[${fmtTime(l.createdAt)}] ${String(l.status || "INFO").toUpperCase().padEnd(11)} ${l.rawSummary || l.reason || ""}${l.supplier ? ` | ${l.supplier}` : ""}${l.amount != null ? ` | ${l.amount}` : ""}`),
    ``,
    `[${fmtTime(run.finishedAt)}] PIPELINE ${String(run.status || "").toUpperCase()} - ${fmtDur(durationMs)}`,
    `  Imported: ${run.invoicesImported ?? 0} | Skipped: ${run.invoicesSkipped ?? 0} | Duplicates: ${run.invoicesDuplicates ?? 0} | Anomalies: ${run.anomaliesDetected ?? 0} | Alerts: ${run.alertsCreated ?? 0}`,
    `  Engine: ${run.analysisEngine || "PYTHON"} | Python: ${run.pythonExecutable || "introuvable"}`,
    ...(run.engineError ? [`  ENGINE ERROR: ${run.engineError}`] : []),
    ...(run.errorMessage ? [``, `  ERROR: ${run.errorMessage}`] : []),
  ] : [];

  const tabs = [
    { id: "journal", label: `Journal (${sortedLogs.length})`, icon: Play },
    { id: "ignored", label: `Lignes ignorées (${ignoredLogs.length})`, icon: Filter },
    { id: "raw", label: "Résumé brut", icon: ScrollText },
  ];

  const drawer = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <div className={styles.headerIcon}>
              <Cpu size={18} color="#fff" />
            </div>
            <div className={styles.titleText}>
              <div className={styles.title}>Rapport d'exécution</div>
              <div className={styles.subtitle}>{pipeline.name}</div>
            </div>
          </div>
          <div className={styles.headerActions}>
            {(runs || []).length > 1 && (
              <select value={selectedRunId || ""} onChange={e => setSelectedRunId(e.target.value)}
                className={styles.runSelect}>
                {(runs || []).map(r => (
                  <option key={r.id} value={r.id}>{fmtDateTime(r.startedAt)} · {String(r.status || "")}</option>
                ))}
              </select>
            )}
            <button onClick={() => setReloadKey(k => k + 1)} className="btn-icon" title="Rafraîchir"><RefreshCw size={14} color={COLORS.grey600} /></button>
            <button onClick={onClose} className="btn-icon"><X size={16} color={COLORS.grey600} /></button>
          </div>
        </div>

        <div className={styles.content}>
          {/* Loading runs */}
          {runs === null && (
            <div className={styles.loading}>
              <RefreshCw size={20} className={`spin ${styles.loadingIcon}`} /> Chargement des exécutions…
            </div>
          )}
          {/* Error */}
          {runs !== null && runsError && (
            <div className={styles.errorState}>
              <AlertTriangle size={22} color={COLORS.red} className={styles.errorIcon} />
              <div className={styles.errorText}>{runsError}</div>
              <button className={`btn-ghost ${styles.retryBtn}`} onClick={() => setReloadKey(k => k + 1)}>Réessayer</button>
            </div>
          )}
          {/* Empty */}
          {runs !== null && !runsError && runs.length === 0 && (
            <div className={styles.emptyState}>
              <Database size={24} color={COLORS.grey300} className={styles.emptyIcon} />
              <div className={styles.emptyTitle}>Aucune exécution enregistrée</div>
              <div className={styles.emptySubtitle}>Lancez le pipeline (import ou activation) pour générer un rapport réel.</div>
            </div>
          )}

          {run && (
            <>
              {/* Run summary */}
              <div className={styles.summaryCard}>
                <div className={styles.summaryHeader}>
                  <div className={styles.summaryMain}>
                    <div className={styles.badgeRow}>
                      <Badge color={statusCfg.color}><Check size={9} />{statusCfg.label}</Badge>
                      <Badge color={COLORS.grey500}>{String(run.id).slice(0, 8)}</Badge>
                      <Badge color={COLORS.info}><Database size={9} />{pipeline.connector || pipeline.sourceType || "—"}</Badge>
                    </div>
                    <KV label="Tenant" value={tenantName || pipeline.tenantId || "—"} />
                    <KV label="Démarrage" value={fmtDateTime(run.startedAt)} />
                    <KV label="Fin" value={fmtDateTime(run.finishedAt)} />
                  </div>
                  <div className={styles.durationBox}>
                    <div className={styles.durationValue}>{fmtDur(durationMs)}</div>
                    <div className={styles.durationLabel}>durée réelle</div>
                  </div>
                </div>
                <div className={styles.kpiGrid}>
                  {[
                    { lbl: "Importées", val: run.invoicesImported ?? 0, c: COLORS.success },
                    { lbl: "Ignorées", val: run.invoicesSkipped ?? 0, c: COLORS.warning },
                    { lbl: "Doublons", val: run.invoicesDuplicates ?? 0, c: COLORS.warning },
                    { lbl: "Filtrées", val: run.invoicesFiltered ?? 0, c: COLORS.grey500 },
                    { lbl: "Anomalies", val: run.anomaliesDetected ?? 0, c: COLORS.red },
                    { lbl: "Alertes", val: run.alertsCreated ?? 0, c: COLORS.purple },
                  ].map(k => (
                    <div key={k.lbl} className={styles.kpiTile}>
                      <div className={styles.kpiValue} ref={(node) => applyVars(node, { "--kpi-color": k.c })}>{k.val}</div>
                      <div className={styles.kpiLabel}>{k.lbl}</div>
                    </div>
                  ))}
                </div>
                {run.errorMessage && (
                  <div className={styles.runError}>
                    <AlertTriangle size={12} className={styles.inlineErrorIcon} />{run.errorMessage}
                  </div>
                )}
                {/* Analysis engine provenance — Python is mandatory for series/anomaly analysis. */}
                <div className={styles.provenance}>
                  <span>Moteur d'analyse : <b className={styles.provenanceStrong}>{run.analysisEngine || "PYTHON"}</b></span>
                  <span>Exécutable Python : <b className={`${styles.pythonPath} ${run.pythonExecutable ? styles.pythonPathFound : styles.pythonPathMissing}`}>{run.pythonExecutable || "introuvable"}</b></span>
                  {run.engineError && <span className={styles.engineError}>Raison : {run.engineError}</span>}
                </div>
              </div>

              {/* Status distribution chips */}
              {Object.keys(statusCounts).length > 0 && (
                <div className={styles.statusChips}>
                  {Object.entries(statusCounts).map(([st, count]) => (
                    <Badge key={st} color={LOG_STATUS_COLORS[st] || COLORS.grey500}>{st} · {count}</Badge>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div className={styles.tabs}>
                {tabs.map(t => {
                  const Ic = t.icon;
                  const active = activeSection === t.id;
                  return (
                    <button key={t.id} onClick={() => setActiveSection(t.id)}
                      className={`${styles.tab} ${active ? styles.tabActive : styles.tabInactive}`}>
                      <Ic size={12} />{t.label}
                    </button>
                  );
                })}
              </div>

              {logs === null && (
                <div className={styles.logsLoading}>
                  <Clock size={16} className={styles.logsLoadingIcon} /> Chargement du journal…
                </div>
              )}

              {logs !== null && activeSection === "journal" && (
                <div className={styles.logBox}>
                  {sortedLogs.length === 0
                    ? <div className={styles.logEmpty}>Aucune entrée de journal pour cette exécution.</div>
                    : sortedLogs.map((l, i) => <LogLine key={l.id || i} log={l} index={i} />)}
                </div>
              )}

              {logs !== null && activeSection === "ignored" && (
                <div className={styles.logBox}>
                  {ignoredLogs.length === 0
                    ? <div className={styles.logEmpty}>Aucune ligne ignorée sur cette exécution.</div>
                    : ignoredLogs.map((l, i) => <LogLine key={l.id || i} log={l} index={i} />)}
                </div>
              )}

              {logs !== null && activeSection === "raw" && (
                <div className={styles.rawTerminal}>
                  <div className={styles.rawHeader}>anomalyiq · pipeline.run.log · {run.id}</div>
                  <div className={styles.rawBody}>
                    {rawLines.map((l, i) => (
                      <div key={i} className={`${styles.rawLine} ${rawLineClass(l)}`}>{l}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(drawer, document.body);
}

export default PipelineRunReportDrawer;
