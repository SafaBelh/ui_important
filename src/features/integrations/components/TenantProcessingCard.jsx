import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { activateTenantConnection, createTenantConnection, getTenantActivation, getTenantConnections, updateTenantConnection } from "@/features/tenants/api/tenantsApi";
import { loadPipelinesForTenant } from "@/shared/model/dataLoaders";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import styles from "./TenantProcessingCard.module.css";

export function TenantProcessingCard({ tenant, connectorId, pipelines, platformTenantId, onComplete, onError }) {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState(null);
  const logsEndRef = useRef(null);
  const progressFillRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const time = () => new Date().toTimeString().slice(0, 8);
    const push = (type, text) => setLogs((prev) => [...prev, { time: time(), type, text }]);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const run = async () => {
      try {
        if (!connectorId) throw new Error("Sauvegardez le connecteur avant d'activer un tenant.");
        if (!platformTenantId) throw new Error("Liez cet ID ERP à un tenant plateforme avant activation.");
        push("info", `Liaison ERP ${tenant.id} → tenant plateforme`);
        setProgress(5);
        const existing = await getTenantConnections({ tenantId: platformTenantId, connectorId });
        let connection = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
        if (!connection) {
          push("info", "Création de la connexion ERP persistée");
          connection = await createTenantConnection({ tenantId: platformTenantId, connectorId, externalId: tenant.id, tenantExternalLabel: tenant.label || tenant.id, active: true });
        } else if (connection.externalId !== tenant.id || connection.active === false) {
          push("info", "Mise à jour de la connexion ERP existante");
          connection = await updateTenantConnection(connection.id, { externalId: tenant.id, tenantExternalLabel: tenant.label || tenant.id, active: true });
        }
        setProgress(15);
        push("ok", `Connexion ERP active: ${connection.externalId}`);
        push("info", "Demande d'activation backend");
        const job = await activateTenantConnection(connection.id);
        setProgress(25);
        push("ok", `Job d'activation créé: ${job.id}`);

        const lastSubState = new Map();
        while (!cancelled) {
          await sleep(1800);
          const current = await getTenantActivation(job.id);
          const total = current.pipelinesTotal || pipelines.length || 1;
          const completed = current.pipelinesCompleted || 0;
          const failedCount = current.pipelinesFailed || 0;
          const baseProgress = current.status === "PENDING" ? 30 : current.status === "RUNNING" ? 45 : 90;
          setProgress(Math.min(99, Math.round(baseProgress + ((completed + failedCount) / total) * 50)));
          (current.subJobs || []).forEach((sub) => {
            const key = sub.id || sub.templateKey;
            const state = `${sub.status}:${sub.rowsImported || 0}:${sub.seriesBuilt || 0}`;
            if (lastSubState.get(key) === state) return;
            lastSubState.set(key, state);
            if (sub.status === "RUNNING") push("info", `Pipeline ${sub.templateKey} → normalisation/import en cours`);
            if (sub.status === "SUCCESS") push("ok", `Pipeline ${sub.templateKey} → ${sub.rowsImported || 0} lignes, séries construites`);
            if (sub.status === "FAILED") push("err", `Pipeline ${sub.templateKey} → échec: ${sub.errorMessage || "erreur inconnue"}`);
          });
          if (["SUCCESS", "FAILED", "PARTIAL_SUCCESS"].includes(current.status)) {
            setDone(current.status === "SUCCESS");
            setProgress(100);
            setStats({ importStatus: current.status, anomalies: current.totalAnomaliesDetected ?? "—", pipelines: `${completed}/${total}`, duration: `${((Date.now() - started) / 1000).toFixed(1)}s` });
            if (current.status === "SUCCESS") {
              setFailed(false);
              push("ok", `Tenant ${tenant.id} entièrement activé`);
              await loadPipelinesForTenant(platformTenantId);
              setTimeout(() => onCompleteRef.current?.(tenant.id), 1200);
            } else {
              setFailed(true);
              push("err", current.errorMessage || "Activation terminée avec erreurs");
              onErrorRef.current?.(tenant.id, current.errorMessage || "Activation terminée avec erreurs");
            }
            return;
          }
        }
      } catch (error) {
        if (cancelled) return;
        setDone(false);
        setFailed(true);
        setProgress(100);
        setStats({ importStatus: "FAILED", anomalies: "—", pipelines: "0", duration: `${((Date.now() - started) / 1000).toFixed(1)}s` });
        push("err", error.message || "Activation impossible");
        onErrorRef.current?.(tenant.id, error.message || "Activation impossible");
      }
    };
    run();
    return () => { cancelled = true; };
  }, [tenant.id, tenant.label, connectorId, platformTenantId, pipelines.length]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    if (!progressFillRef.current) return;
    progressFillRef.current.style.setProperty("--tenant-progress-width", `${progress}%`);
    progressFillRef.current.style.setProperty("--tenant-progress-bg", done ? `linear-gradient(90deg,${INTEGRATION_COLORS.success},#4ade80)` : "linear-gradient(90deg,#3b82f6,#6366f1)");
  }, [done, progress]);

  return (
    <div className="tenant-processing-card">
      <div className={styles.header}>
        <div className={styles.iconBox}>
          {done ? <CheckCircle2 size={16} color={INTEGRATION_COLORS.success} /> : failed ? <AlertCircle size={16} color={INTEGRATION_COLORS.red} /> : <Loader2 size={16} color={INTEGRATION_COLORS.info} className="spin" />}
        </div>
        <div className={styles.headerContent}>
          <div className={`${styles.title} ${done ? styles.titleDone : styles.titleActive}`}>{done ? `Tenant ${tenant.id} activé` : failed ? `Activation échouée — ${tenant.id}` : `Activation en cours — ${tenant.id}`}</div>
          <div className={styles.tenantLabel}>{tenant.label}</div>
        </div>
        <span className={`${styles.progressText} ${done ? styles.progressDone : styles.progressActive}`}>{progress}%</span>
      </div>
      <div className="proc-progress"><div ref={progressFillRef} className={`proc-progress-fill ${styles.progressFill}`} /></div>
      <div className={`scroll ${styles.logScroll}`}>
        {logs.filter(Boolean).map((log, index) => (
          <div key={index} className="proc-log-line">
            <span className="ts">{log.time}</span>
            <span className={log.type}>{log.type === "ok" ? "✓" : log.type === "warn" ? "⚠" : log.type === "err" ? "✗" : "·"} {log.text}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
      {done && stats && (
        <div className={styles.statsGrid}>
          {[
            { label: "Import réel", val: stats.importStatus },
            { label: "Anomalies", val: stats.anomalies },
            { label: "Pipelines", val: stats.pipelines },
            { label: "Durée", val: stats.duration },
          ].map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <div className={styles.statValue}>{stat.val}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
