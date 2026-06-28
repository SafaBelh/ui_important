import { useState, useEffect, useMemo } from "react";
import { BellOff, Check, Clock, Download } from "lucide-react";
import { Badge } from "@/shared/ui/Badge";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import styles from "./AlertsView.module.css";
import { useToast } from "@/contexts/toastContextValue";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { markAlertRead } from "@/features/alerts/model/alertActions";
import { loadTenants } from "@/shared/model/dataLoaders";
import { ALERT_TABS } from "@/constants/uiConstants";
import { downloadCSV } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { addAuditEntry } from "@/features/audit/model/auditActions";
import { severityColor } from "@/utils/formatters";
import { getAlerts, sendAlertFeedback, updateAlertStatus } from "@/features/alerts/api/alertsApi";
import { logError } from "@/shared/utils/logError";

const setCssVars = (vars) => (node) => {
  if (!node) return;
  Object.entries(vars).forEach(([key, value]) => {
    node.style.setProperty(key, value);
  });
};

export function AlertsView() {
  const toast = useToast();
  const { tenant, isEngineAdmin } = useSession();
  const [tab, setTab] = useState("toutes");
  const [localAlerts, setLocalAlerts] = useState([]);
  const [adminTenantFilter, setAdminTenantFilter] = useState("");
  const tenants = useAppSelector(selectTenants);
  const tenantPipelines = useAppSelector((state) => selectPipelinesForTenant(state, tenant?.id));

  const allTenants = useMemo(() => {
    if (!isEngineAdmin) return [];
    return tenants;
  }, [isEngineAdmin, tenants]);

  useEffect(() => {
    if (isEngineAdmin) loadTenants().catch((error) => logError("alerts.loadTenants", error));
  }, [isEngineAdmin]);

  const alertTenantIds = useMemo(() => {
    if (tenant?.id) return [tenant.id];
    if (adminTenantFilter) return [adminTenantFilter];
    return allTenants.map(t => t.id);
  }, [tenant?.id, adminTenantFilter, allTenants]);
  useEffect(() => {
    if (!tenant?.id && !isEngineAdmin) return;
    // Engine admins must impersonate each business tenant (adminTenantId →
    // X-Tenant-ID); otherwise the backend resolves the ADMIN tenant, which owns
    // no alerts, and the page shows 0 even though alerts exist.
    const ids = alertTenantIds;
    if (ids.length === 0) { setLocalAlerts([]); return; }
    Promise.all(
      ids.map((id) =>
        getAlerts(isEngineAdmin ? { size: 100, adminTenantId: id } : { size: 100 })
          .then((res) => (res?.content || []).map(a => ({ ...a, tenantId: a.tenantId || id })))
          .catch(() => [])
      )
    )
      .then((lists) => {
        const apiAlerts = lists.flat();
        setLocalAlerts(apiAlerts.map(a => ({
          ...a,
          tenantId: a.tenantId || "admin",
          severity: a.severity?.toLowerCase() === "critique" ? "critical" : a.severity?.toLowerCase() || "warning",
          type: (a.type || a.anomalyType || "anomaly").toLowerCase(),
          message: a.message || a.explanation || "",
          status: a.status?.toLowerCase() === "read" ? "read" : a.status?.toLowerCase() || "en_attente",
          read: a.read === true || a.status?.toUpperCase?.() === "READ" || a.status?.toUpperCase?.() === "RESOLVED",
          timestamp: a.detectedAt || a.detectionDate || a.createdAt || a.timestamp,
        })));
      })
      .catch(err => console.error("Failed to fetch alerts:", err));
  }, [tenant?.id, isEngineAdmin, alertTenantIds]);

  if (!tenant && !isEngineAdmin) return null;
  const allAlerts = localAlerts
    .slice()
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  const pipelines = tenant ? tenantPipelines : [];
  const pipelineNameOf = (a) =>
    pipelines.find((p) => p.id === a.pipelineId)?.name;
  const counts = {
    critique: allAlerts.filter((a) => a.severity === "critical").length,
    attention: allAlerts.filter((a) => a.severity === "warning").length,
    info: allAlerts.filter((a) => a.severity === "info").length,
    pending: allAlerts.filter((a) => !a.read).length,
  };
  const filtered = allAlerts.filter((a) => {
    if (tab === "toutes") return true;
    if (tab === "en_attente") return !a.read;
    if (tab === "pipeline") return a.type === "pipeline";
    if (tab === "system") return a.type === "system" || a.type === "systeme";
    // "Anomalies" = any anomaly-typed alert (amount/duplicate/missing/frequency/order_*),
    // i.e. everything that isn't a pipeline/system alert. The previous `a.type === "anomaly"`
    // never matched because the type is the concrete anomaly kind (e.g. "amount"). (B)
    if (tab === "anomaly") return a.type !== "pipeline" && a.type !== "system" && a.type !== "systeme";
    return a.type === tab;
  });
  const TABS = ALERT_TABS;
  const sevLabel = (severityValue) =>
    severityValue === "critical" ? "Critique" : severityValue === "warning" ? "Attention" : "Info";
  // Coloured type pill for the alert card (C)
  const typeMeta = (t) => {
    const k = String(t || "").toLowerCase();
    if (k === "amount" || k === "montant") return { label: "Montant", color: COLORS.red };
    if (k === "duplicate" || k === "doublon") return { label: "Doublon", color: COLORS.warning };
    if (k === "missing" || k === "manquante") return { label: "Manquante", color: COLORS.purple };
    if (k.includes("order") || k.includes("volume") || k.includes("frequen")) return { label: "Rythme", color: COLORS.info };
    if (k === "pipeline") return { label: "Pipeline", color: COLORS.teal };
    if (k === "system" || k === "systeme") return { label: "Système", color: COLORS.grey500 };
    return { label: (t || "Anomalie"), color: COLORS.info };
  };
  const updateLocalAlert = (id, patch) => {
    setLocalAlerts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  };
  const handleMarkRead = async (a) => {
    try { await updateAlertStatus(a.id, "READ"); } catch (e) { console.error("Mark read failed:", e); }
    await markAlertRead(a.id);
    updateLocalAlert(a.id, { read: true, status: a.status === "en_attente" ? a.status : "read" });
    toast("Alerte marquée comme lue", "success");
  };
  const handleMarkAllRead = async () => {
    const unread = filtered.filter((a) => !a.read);
    await Promise.all(unread.map((a) => handleMarkRead(a)));
  };
  const handleConfirm = async (a) => {
    try { await sendAlertFeedback(a.id, "CONFIRMED"); } catch (e) { console.error("Feedback failed:", e); }
    updateLocalAlert(a.id, { status: "confirmée", read: true });
    toast("Anomalie confirmée — alerte envoyée.", "success");
    addAuditEntry("Anomalie confirmée", `${a.invoiceRef || a.id} — ${(a.message || "").slice(0, 60)}`);
  };
  const handleFalse = async (a) => {
    try { await sendAlertFeedback(a.id, "REJECTED", "Faux positif"); } catch (e) { console.error("Feedback failed:", e); }
    updateLocalAlert(a.id, { status: "rejetée", read: true });
    toast("Faux positif — modèle ML réajuste le seuil K.", "info");
    addAuditEntry("Faux positif", `${a.invoiceRef || a.id} — ${(a.message || "").slice(0, 60)}`);
  };
  const handleIgnore = async (a) => {
    try { await sendAlertFeedback(a.id, "IGNORED"); } catch (e) { console.error("Feedback failed:", e); }
    updateLocalAlert(a.id, { status: "ignorée", read: true });
    toast("Alerte ignorée.", "warning");
    addAuditEntry("Alerte ignorée", `${a.id} — ${(a.message || "").slice(0, 60)}`);
  };
  return (
    <div
      className={`fade-up ${styles.root}`}
    >
      <PageHeader
        eyebrow="Monitoring"
        title="Centre d'alertes"
        subtitle={<>{counts.pending} en attente{counts.critique > 0 && <span className={styles.criticalSubtitle}>· {counts.critique} critiques</span>}</>}
        actions={(
          <>
          {[
            { k: "Critique", c: COLORS.red, n: counts.critique },
            { k: "Attention", c: COLORS.warning, n: counts.attention },
            { k: "Info", c: COLORS.info, n: counts.info },
          ].map((x) => (
            <div
              key={x.k}
              className={styles.severityChip}
              ref={setCssVars({
                "--chip-border": `${x.c}25`,
                "--chip-bg": `${x.c}0d`,
                "--chip-dot": x.c,
              })}
            >
              <span
                className={styles.severityDot}
              />
              {x.k} ({x.n})
            </div>
          ))}
          </>
        )}
      />
      <div className={styles.toolbar}>
        <div className={styles.tabsWrap}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`tab${tab === t.id ? " active" : ""} ${styles.tabBtn}`}
          >
            {t.label}
          </button>
        ))}
        {!tenant && isEngineAdmin && allTenants.length > 0 && (
          <select value={adminTenantFilter} onChange={e => setAdminTenantFilter(e.target.value)} className={styles.adminTenantSelect}>
            <option value="">Tous les tenants</option>
            {allTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        </div>
        <button
          className={`btn-ghost ${styles.topActionBtn}`}
          onClick={() => {
            downloadCSV(filtered.map(a => ({
              id: a.id,
              type: a.type,
              severite: a.severity,
              message: a.message,
              timestamp: a.timestamp,
              lu: a.read ? "oui" : "non",
              ref_facture: a.invoiceRef || "",
              score: a.anomalyScore || "",
            })), `alertes-${tenant?.name || "admin"}-${new Date().toISOString().slice(0, 10)}.csv`);
            addAuditEntry("Export CSV", `Alertes — ${filtered.length} lignes exportées`);
          }}
        >
          <Download size={12} /> Exporter CSV ({filtered.length})
        </button>
        {filtered.some((a) => !a.read) && (
          <button className={`btn-ghost ${styles.topActionBtn}`} onClick={handleMarkAllRead}>
            <Check size={12} /> Tout marquer lu
          </button>
        )}
      </div>
      <div className={styles.alertList}>
        {filtered.length === 0 && (
          <EmptyState icon={<BellOff size={32} color={COLORS.red} strokeWidth={1.8} />} title="Aucune alerte" subtitle="Aucune alerte ne correspond à ce filtre pour le moment." />
        )}
        {filtered.map((a) => {
          const color = severityColor(a.severity);
          const score = Math.round((a.anomalyScore ?? 0) * 100);
          const pipelineName = pipelineNameOf(a);
          const dateValue = a.timestamp ? new Date(a.timestamp) : null;
          const time = dateValue && !Number.isNaN(dateValue.getTime())
            ? dateValue.toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Date non disponible";
          const statusColor = a.status === 'en_attente' ? COLORS.warning : a.status === 'confirmée' ? COLORS.success : a.status === 'rejetée' ? COLORS.info : COLORS.grey500;
          const statusBg = a.status === 'en_attente' ? `${COLORS.warning}18` : a.status === 'confirmée' ? `${COLORS.success}18` : a.status === 'rejetée' ? `${COLORS.info}18` : `${COLORS.grey500}18`;
          const statusBorder = `1px solid ${statusColor}28`;
          const statusLabel = a.status === 'en_attente' ? 'En attente' : a.status === 'confirmée' ? 'Confirmée' : a.status === 'rejetée' ? 'Rejetée' : 'Ignorée';
          return (
            <div
              key={a.id}
              className={`glass-card ${styles.alertCard}`}
              ref={setCssVars({
                "--card-opacity": a.read ? 0.78 : 1,
                "--card-shadow": `0 2px 12px ${color}12`,
                "--card-border": `1px solid ${color}15`,
                "--card-left": `4px solid ${color}`,
              })}
            >
              <div
                  className={styles.alertMain}
              >
                <div
                   className={styles.iconBox}
                  ref={setCssVars({
                    "--icon-bg": `${color}18`,
                    "--icon-ring": `${color}20`,
                  })}
                >
                  <Icon
                    name={
                      a.type === "pipeline"
                        ? "pipelines"
                        : a.severity === "critical"
                        ? "triangle"
                        : a.severity === "warning"
                        ? "triangle"
                        : "alerts"
                    }
                    size={18}
                    color={color}
                  />
                </div>
                <div className={styles.alertContent}>
                  <div
                    className={styles.alertHeader}
                  >
                    <div
                      className={styles.alertMessage}
                    >
                      {a.message}
                    </div>
                    <div className={styles.badgeGroup}>
                      {(() => { const tm = typeMeta(a.type); return (
                        <span
                          className={`badge ${styles.dynamicBadge}`}
                          ref={setCssVars({
                            "--badge-bg": `${tm.color}18`,
                            "--badge-color": tm.color,
                            "--badge-border": `1px solid ${tm.color}30`,
                          })}
                        >
                          {tm.label}
                        </span>
                      ); })()}
                      <span
                         className={`badge ${styles.dynamicBadge}`}
                        ref={setCssVars({
                          "--badge-bg": color,
                          "--badge-color": "var(--color-white)",
                          "--badge-border": `1px solid ${color}`,
                        })}
                      >
                        {sevLabel(a.severity)}
                      </span>
                      {a.status && (
                        <span
                           className={`badge ${styles.statusBadge}`}
                          ref={setCssVars({
                            "--status-bg": statusBg,
                            "--status-color": statusColor,
                            "--status-border": statusBorder,
                          })}
                        >
                          {statusLabel}
                        </span>
                      )}
                      {!a.read && (
                        <button
                          onClick={() => handleMarkRead(a)}
                          className={`btn-ghost ${styles.markReadBtn}`}
                        >
                          <Check size={11} /> Marquer lu
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className={styles.metaRow}
                    ref={setCssVars({
                      "--meta-margin-bottom":
                        a.type === "anomaly" && a.anomalyScore !== undefined
                          ? "10px"
                          : "0px",
                    })}
                  >
                    <span className={styles.timeMeta}>
                      <Clock size={11} color={COLORS.grey500} className={styles.clockIcon} />
                      <span>{time}</span>
                    </span>
                    <Badge type="mute">{tenant?.name || allTenants.find(t => t.id === a.tenantId)?.name || a.tenantId}</Badge>
                    {pipelineName && (
                      <Badge type="mute">
                        <span
                          className={styles.pipelineMeta}
                        >
                          <Icon name="pipelines" size={10} color={COLORS.grey500} />
                          {pipelineName}
                        </span>
                      </Badge>
                    )}
                    {a.invoiceRef && (
                      <span
                        className={styles.invoiceRef}
                      >
                        #{a.invoiceRef}
                      </span>
                    )}
                  </div>
                  {a.type === "anomaly" && a.anomalyScore !== undefined && (
                    <div>
                      <div
                        className={styles.scoreLabel}
                      >
                        Score d'anomalie
                      </div>
                      <div
                        className={styles.scoreRow}
                      >
                        <div
                          className={styles.scoreTrack}
                          ref={setCssVars({
                            "--track-bg": `${color}15`,
                            "--track-shadow": `inset 0 1px 2px ${color}10`,
                          })}
                        >
                          <div
                            className={styles.scoreFill}
                            ref={setCssVars({
                              "--bar-width": `${score}%`,
                              "--bar-grad": `linear-gradient(90deg, ${color}, ${color}bb)`,
                            })}
                          />
                        </div>
                        <span
                          className={styles.scoreValue}
                          ref={setCssVars({
                            "--score-color": color,
                          })}
                        >
                          {score}%
                        </span>
                      </div>
                    </div>
                  )}
                  {a.status === 'en_attente' && a.type !== "budget_overrun" && (
                    <div
                      className={styles.feedbackActions}
                    >
                      <button
                        onClick={() => handleConfirm(a)}
                        className={`btn-danger ${styles.feedbackBtn}`}
                      >
                        Confirmer anomalie
                      </button>
                      <button
                        onClick={() => handleFalse(a)}
                        className={`btn-confirm ${styles.feedbackBtn}`}
                      >
                        Faux positif
                      </button>
                      <button
                        onClick={() => handleIgnore(a)}
                        className={`btn-mute ${styles.feedbackBtn}`}
                      >
                        Ignorer
                      </button>
                    </div>
                  )}
                  {a.status === 'en_attente' && a.type === "budget_overrun" && (
                    <div className={styles.feedbackActions}>
                      <button
                        onClick={() => handleConfirm(a)}
                        className={`btn-danger ${styles.feedbackBtn}`}
                      >
                        Confirmer dépassement
                      </button>
                      <button
                        onClick={() => handleIgnore(a)}
                        className={`btn-mute ${styles.feedbackBtn}`}
                      >
                        Ignorer
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
