/**
 * "Tenants" wizard step: links external ERP tenant ids to platform tenants, runs
 * per-tenant activation/processing, and tests each tenant's isolated DB connection.
 * Bundles its only-here helpers/sub-components (resolvePlatformTenant, GQLTenantLinker,
 * TenantProcessingCard, StatusTagInput, IsolatedDbTester). Extracted from IntegrationsView.
 */
import { useState, useEffect } from "react";
import { Settings2, AlertCircle, AlertTriangle, Check, CheckCircle2, Cpu, Download, FileJson, Loader2, Play, Plus, RefreshCw, Upload, Users, Wand2, X } from "lucide-react";
import { PIPELINE_DEFS, TENANT_JSON_IMPORT_TEMPLATE } from "@/constants/integrationWizard";
import { bulkActivateTenants, bulkCreateTenantConnections, getTenants } from "@/features/tenants/api/tenantsApi";
import { getTenantActivationStatus, validateConnectorPipelines } from "@/features/integrations/api/IntegrationAdminApi";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { setTenantsCache } from "@/features/tenants/model/tenantActions";
import { useToast } from "@/contexts/toastContextValue";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { InfoBox } from "@/features/integrations/components/WizardUiPrimitives";
import { IsolatedDbTester, StatusTagInput } from "@/features/integrations/components/TenantStepControls";
import { GQLTenantLinker } from "@/features/integrations/components/TenantLinker";
import { resolvePlatformTenant } from "@/features/integrations/model/tenantLinking";
import { TenantProcessingCard } from "@/features/integrations/components/TenantProcessingCard";
import { logError } from "@/shared/utils/logError";
import styles from "./TenantsStep.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

/* ─── TENANTS STEP (updated: inactive by default + processing + GQL link) ─── */
export function TenantsStep({ data, setData, onPersist }) {
  const toast = useToast();
  const cachedPlatformTenants = useAppSelector(selectTenants);
  const tenants = data.tenants || [];
  const customPipelines = data.customPipelines || [];
  const allPipelineKeys = { facture: PIPELINE_DEFS.facture, commande: PIPELINE_DEFS.commande, ...Object.fromEntries(customPipelines.map(cp => [cp.id, { label: cp.label, color: cp.color, Icon: Settings2 }])) };
  const [newTenantId, setNewTenantId] = useState("");
  const [newTenantLabel, setNewTenantLabel] = useState("");
  const [newTenantStorageMode, setNewTenantStorageMode] = useState("shared");
  const [tenantImportError, setTenantImportError] = useState("");
  const [expandedTenant, setExpandedTenant] = useState(null);
  const [processingTenants, setProcessingTenants] = useState({});
  const [completedTenants, setCompletedTenants] = useState(new Set());
  const [platformTenants, setPlatformTenants] = useState(cachedPlatformTenants);
  const [platformTenantsLoading, setPlatformTenantsLoading] = useState(false);
  const [deployState, setDeployState] = useState(null);
  const [savingConnector, setSavingConnector] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlatformTenantsLoading(true);
    getTenants({ size: 200 })
      .then(res => {
        if (cancelled) return;
        const rows = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
        setTenantsCache(rows);
        setPlatformTenants(rows.map(t => ({
          ...t,
          id: t.id || t.tenantId,
          name: t.name || t.tenantName || t.username || t.id,
        })).filter(t => t.id));
      })
      .catch(err => {
        if (cancelled) return;
        setPlatformTenants(cachedPlatformTenants);
        toast(err.message || "Impossible de charger les tenants plateforme", "error");
      })
      .finally(() => { if (!cancelled) setPlatformTenantsLoading(false); });
    return () => { cancelled = true; };
  }, [toast, cachedPlatformTenants]);

  const buildTenantDefaults = (tenant = {}) => ({
    id: tenant.id || "",
    label: tenant.label || tenant.id || "",
    active: tenant.active === true,
    platformTenantId: tenant.platformTenantId || null,
    platformTenantName: tenant.platformTenantName || null,
    storageMode: tenant.storageMode === "isolated" ? "isolated" : "shared",
    database: {
      jdbcUrl: tenant.database?.jdbcUrl || tenant.jdbcUrl || "",
      jdbcUsername: tenant.database?.jdbcUsername || tenant.jdbcUsername || "",
      jdbcPassword: tenant.database?.jdbcPassword || tenant.jdbcPassword || "",
    },
    statuses: {
      ...Object.fromEntries(Object.keys(allPipelineKeys).map(k => [k, { provisional: [], final: [], statusColumn: "" }])),
      ...(tenant.statuses || {}),
    },
  });

  const addTenant = () => {
    if (!newTenantId.trim()) return;
    const id = newTenantId.trim();
    const label = newTenantLabel.trim() || id;
    const next = [...tenants.filter(t => t.id !== id), buildTenantDefaults({ id, label, storageMode: newTenantStorageMode })];
    setData({ ...data, tenants: next }); setNewTenantId(""); setNewTenantLabel(""); setNewTenantStorageMode("shared");
  };

  const importTenantsFromJson = async (file) => {
    if (!file) return;
    try {
      setTenantImportError("");
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.tenants;
      if (!Array.isArray(list)) throw new Error("Format attendu: { tenants: [...] } ou un tableau JSON.");
      const imported = list.map(item => buildTenantDefaults(typeof item === "string" ? { id: item, label: item } : item)).filter(t => t.id);
      if (!imported.length) throw new Error("Aucun tenant valide trouve dans le fichier.");
      const byId = new Map(tenants.map(t => [t.id, t]));
      imported.forEach(t => byId.set(t.id, { ...(byId.get(t.id) || {}), ...t }));
      const { next, linked } = autoLinkTenants([...byId.values()]);
      setData({ ...data, tenants: next });
      toast(`${imported.length} tenant(s) importés${linked ? `, ${linked} lié(s) automatiquement` : ""}`, "success");
    } catch (e) {
      setTenantImportError(e.message || "JSON invalide");
      toast("Import tenants JSON invalide", "error");
    }
  };

  const downloadTenantJsonTemplate = () => {
    const blob = new Blob([JSON.stringify(TENANT_JSON_IMPORT_TEMPLATE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tenant-import-template.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const removeTenant = id => setData({ ...data, tenants: tenants.filter(t => t.id !== id) });

  // "Actif" is a local flag: it marks the tenant for the bulk pipeline
  // deployment below. Nothing runs until the connector is saved and the user
  // clicks "Déployer" — no per-tenant processing UI anymore.
  const activateTenant = (id) => {
    const tenant = tenants.find(t => t.id === id);
    const platformTenant = resolvePlatformTenant(tenant, platformTenants);
    if (!platformTenant) {
      setExpandedTenant(id);
      toast("Liez d'abord cet ID ERP à un tenant plateforme.", "warning");
      return;
    }
    if (tenant.storageMode === "isolated" && (!tenant.database?.jdbcUrl || !tenant.database?.jdbcUsername || !tenant.database?.jdbcPassword)) {
      setExpandedTenant(id);
      toast("Renseignez les details DB du tenant isole avant activation.", "warning");
      return;
    }
    setData({ ...data, tenants: tenants.map(t => t.id === id ? { ...t, active: true } : t) });
  };

  const onProcessingComplete = (id) => {
    setProcessingTenants(prev => { const n = { ...prev }; delete n[id]; return n; });
    setCompletedTenants(prev => new Set([...prev, id]));
    setData({ ...data, tenants: tenants.map(t => t.id === id ? { ...t, active: true } : t) });
  };

  const onProcessingError = (id, message) => {
    setProcessingTenants(prev => { const n = { ...prev }; delete n[id]; return n; });
    toast(message || "Activation tenant échouée", "error");
  };

  const deactivateTenant = (id) => {
    setCompletedTenants(prev => { const n = new Set(prev); n.delete(id); return n; });
    setData({ ...data, tenants: tenants.map(t => t.id === id ? { ...t, active: false } : t) });
  };

  const linkPlatformTenant = (erpId, pt) => {
    setData({ ...data, tenants: tenants.map(t => t.id === erpId ? { ...t, platformTenantId: pt ? pt.id : null, platformTenantName: pt ? pt.name : null } : t) });
  };

  const updateTenantDatabase = (tenantId, field, value) => setData({ ...data, tenants: tenants.map(t => t.id === tenantId ? { ...t, database: { ...(t.database || {}), [field]: value } } : t) });
  const updateTenantStatus = (tenantId, pipeline, field, value) => setData({ ...data, tenants: tenants.map(t => t.id === tenantId ? { ...t, statuses: { ...t.statuses, [pipeline]: { ...(t.statuses?.[pipeline] || {}), [field]: value } } } : t) });

  const enabledPipelineNames = Object.entries(allPipelineKeys).filter(([k]) => (data.pipelines?.[k] || {}).enabled !== false).map(([k, def]) => def.label || k);

  // ── Auto-link external ERP ids to platform tenants by normalized name ──
  const normalizeKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const autoLinkTenants = (list) => {
    let linked = 0;
    const next = list.map(t => {
      if (t.platformTenantId) return t;
      const keyId = normalizeKey(t.id);
      const keyLabel = normalizeKey(t.label);
      const match = platformTenants.find(pt => {
        const ptName = normalizeKey(pt.name);
        const ptUser = normalizeKey(pt.username);
        return (ptName && (ptName === keyLabel || ptName === keyId))
          || (ptUser && (ptUser === keyId || ptUser === keyLabel))
          || (ptName && keyId.includes(ptName))
          || (ptName && keyLabel && keyLabel.includes(ptName))
          || (keyLabel && ptName && ptName.includes(keyLabel));
      });
      if (match) {
        linked++;
        return { ...t, platformTenantId: match.id, platformTenantName: match.name };
      }
      return t;
    });
    return { next, linked };
  };
  const unlinkedCount = tenants.filter(t => !resolvePlatformTenant(t, platformTenants)).length;
  const runAutoLink = () => {
    const { next, linked } = autoLinkTenants(tenants);
    if (linked === 0) { toast("Aucune correspondance automatique trouvée.", "info"); return; }
    setData({ ...data, tenants: next });
    toast(`${linked} tenant(s) lié(s) automatiquement`, "success");
  };

  // ── Bulk deployment (after the connector is saved) ──
  const enabledTemplatesCount = Object.keys(allPipelineKeys).filter(k => (data.pipelines?.[k] || {}).enabled !== false).length;
  const activeLinkedTenants = tenants.filter(t => t.active && resolvePlatformTenant(t, platformTenants));

  const deployAll = async () => {
    if (!data.id || activeLinkedTenants.length === 0) return;
    setDeployState({ phase: "starting" });
    try {
      // 0. Compile-validate enabled pipelines against the live source. Block
      //    deployment and surface per-pipeline errors instead of letting
      //    activation fail mid-run on a bad column mapping.
      const validation = await validateConnectorPipelines(data.id).catch(() => null);
      if (validation && validation.ok === false && (validation.errors || []).length > 0) {
        setDeployState({ phase: "invalid", errors: validation.errors });
        toast(`${validation.errors.length} pipeline(s) invalide(s) — corrigez les mappages avant de déployer.`, "error");
        return;
      }
      // 1. Ensure ERP connections exist (bulk; already-existing links come back
      //    as "failed" entries or a 400 when none is new — both are fine).
      await bulkCreateTenantConnections({
        connectorId: data.id,
        mappings: activeLinkedTenants.map(t => ({
          tenantId: resolvePlatformTenant(t, platformTenants).id,
          externalId: t.id,
          tenantExternalLabel: t.label || t.id,
          active: true,
        })),
      }).catch((error) => logError("integrations.bulkTenantConnections", error));
      // 2. Queue one activation job per tenant — the backend worker processes
      //    them in parallel (app.activation.parallelism) and the panel polls.
      const res = await bulkActivateTenants({
        connectorId: data.id,
        externalIds: activeLinkedTenants.map(t => t.id),
      });
      toast(`${res?.startedCount ?? 0} activation(s) lancée(s)${res?.skippedCount ? `, ${res.skippedCount} ignorée(s)` : ""}`, "success");
      setDeployState({ phase: "running" });
    } catch (err) {
      setDeployState({ phase: "error", error: err.message || "Déploiement impossible" });
    }
  };

  // Resume display if a deployment is already in flight for this connector.
  useEffect(() => {
    if (!data.id) return;
    getTenantActivationStatus({ connectorId: data.id })
      .then(res => {
        const t = res?.totals || {};
        if ((t.running || 0) + (t.pending || 0) > 0) setDeployState({ phase: "running", rows: res?.rows || [], totals: t });
        else if ((res?.rows || []).some(r => r.jobStatus)) setDeployState({ phase: "done", rows: res.rows, totals: t });
      })
      .catch((error) => logError("integrations.activationStatusResume", error));
     
  }, [data.id]);

  const deployPolling = deployState?.phase === "running" || deployState?.phase === "starting";
  useEffect(() => {
    if (!data.id || !deployPolling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getTenantActivationStatus({ connectorId: data.id });
        if (cancelled) return;
        const t = res?.totals || {};
        const busy = (t.running || 0) + (t.pending || 0) > 0;
        setDeployState({ phase: busy ? "running" : "done", rows: res?.rows || [], totals: t });
      } catch (error) {
        logError("integrations.activationStatusPoll", error);
      }
    };
    tick();
    const h = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(h); };
     
  }, [data.id, deployPolling]);

  return (
    <div className={styles.root}>
      <InfoBox color={INTEGRATION_COLORS.info}>
        1. Ajoutez ou importez (JSON) les IDs externes des tenants ERP — la liaison aux tenants plateforme est automatique quand les noms correspondent. 2. Marquez les tenants <strong>actifs</strong>. 3. Sauvegardez puis <strong>déployez</strong> : les pipelines par défaut (factures, commandes, personnalisés) sont créés côté serveur pour tous les tenants actifs, en parallèle.
      </InfoBox>

      <div className={styles.importPanel}>
        <div>
          <div className={styles.importTitle}><FileJson size={13} color={INTEGRATION_COLORS.info} /> Import tenants JSON</div>
          <div className={styles.importHelp}>Téléchargez le format attendu, remplissez-le, puis importez le fichier JSON directement.</div>
          {tenantImportError && <div className={styles.importError}>{tenantImportError}</div>}
        </div>
        <div className={styles.importActions}>
          <button type="button" className={cx("btn btn-ghost", styles.centerButton, unlinkedCount === 0 && styles.dimmed)} onClick={runAutoLink} disabled={unlinkedCount === 0} title="Associe les IDs externes aux tenants plateforme par correspondance de nom">
            <Wand2 size={13} /> Lier auto ({unlinkedCount})
          </button>
          <button type="button" className={cx("btn btn-ghost", styles.centerButton)} onClick={downloadTenantJsonTemplate}>
            <Download size={13} /> Télécharger format
          </button>
          <label className={cx("btn btn-ghost", styles.importFileButton)}>
            <Upload size={13} /> Importer fichier
            <input type="file" accept="application/json,.json" hidden onChange={e => { importTenantsFromJson(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {/* Add tenant */}
      <div className={styles.addTenantGrid}>
        <input value={newTenantId} onChange={e => setNewTenantId(e.target.value)} onKeyDown={e => e.key === "Enter" && addTenant()} className="input" placeholder="ID externe ERP (ex: CORP_001)" />
        <input value={newTenantLabel} onChange={e => setNewTenantLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addTenant()} className="input" placeholder="Libellé (optionnel)" />
        <select className="select" value={newTenantStorageMode} onChange={e => setNewTenantStorageMode(e.target.value)}>
          <option value="shared">DB partagee</option>
          <option value="isolated">DB isolee</option>
        </select>
        <button className="btn btn-primary" onClick={addTenant} disabled={!newTenantId.trim()}><Plus size={13} /> Ajouter</button>
      </div>

      {tenants.length === 0 && (<div className={styles.emptyState}><Cpu size={32} className={styles.emptyIcon} /><p>Aucun ID externe configuré</p></div>)}

      {tenants.map(tenant => {
        const isProcessing = !!processingTenants[tenant.id];
        const isCompleted = completedTenants.has(tenant.id);
        const isActive = tenant.active;
        const linkedPlatformTenant = resolvePlatformTenant(tenant, platformTenants);
        const isLinked = !!linkedPlatformTenant;
        const isIsolated = tenant.storageMode === "isolated";
        const isolatedDbReady = !isIsolated || !!(tenant.database?.jdbcUrl && tenant.database?.jdbcUsername && tenant.database?.jdbcPassword);

        return (
          <div key={tenant.id} className={cx(styles.tenantCard, isActive && styles.tenantCardActive, isProcessing && styles.tenantCardProcessing)}>
            {/* Tenant header */}
            <div className={styles.tenantHeader}>
              <div className={cx(styles.tenantIcon, isActive && styles.tenantIconActive, isProcessing && styles.tenantIconProcessing)}>
                {isActive ? <CheckCircle2 size={18} color={INTEGRATION_COLORS.success} /> : isProcessing ? <Loader2 size={18} color={INTEGRATION_COLORS.info} className="spin" /> : <Cpu size={18} color={INTEGRATION_COLORS.g400} />}
              </div>
              <div className={styles.tenantMain}>
                <div className={cx(styles.tenantName, isActive && styles.tenantNameActive)}>
                  {tenant.label}
                </div>
                <div className={styles.tenantMeta}>
                  ID externe: <span className="mono">{tenant.id}</span>
                  {isLinked && (
                    <span className={styles.metaLinked}>· Lié à {linkedPlatformTenant?.name || tenant.platformTenantName}</span>
                  )}
                  <span className={cx(styles.metaStorage, isIsolated ? styles.metaStorageIsolated : styles.metaStorageShared)}>· {isIsolated ? "DB isolee" : "DB partagee"}</span>
                </div>
              </div>

              {/* Status badges */}
              <div className={styles.statusBadges}>
                {isActive && (
                  <span className={cx(styles.badge, styles.badgeActive)}>
                    ACTIF
                  </span>
                )}
                {isLinked && !isActive && (
                  <span className={cx(styles.badge, styles.badgeLinked)}>
                    LIÉ
                  </span>
                )}
                {isIsolated && (
                  <span className={cx(styles.badge, styles.badgeIsolated)}>
                    DB ISOLEE{isolatedDbReady ? "" : " INCOMPLETE"}
                  </span>
                )}
                {!isActive && !isProcessing && !isCompleted && (
                  <span className={cx(styles.badge, styles.badgeInactive)}>
                    INACTIF
                  </span>
                )}
              </div>

              {!isProcessing && !isCompleted && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); isActive ? deactivateTenant(tenant.id) : activateTenant(tenant.id); }}
                  title={isActive ? "Désactiver le tenant" : !isLinked ? "Lier au tenant plateforme avant activation" : !isolatedDbReady ? "Renseigner la DB isolee avant activation" : "Activer le tenant"}
                  className={cx(styles.toggleButton, isActive && styles.toggleButtonActive, !isActive && (!isLinked || !isolatedDbReady) && styles.toggleButtonBlocked)}
                >
                  <span className={cx(styles.toggleKnob, isActive && styles.toggleKnobActive)}>
                    {isActive ? <Check size={11} /> : <Play size={9} />}
                  </span>
                </button>
              )}

              <button
                onClick={e => { e.stopPropagation(); removeTenant(tenant.id); }}
                className={styles.iconButton}
              >
                <X size={14} />
              </button>

              <ChevronDown
                size={14} color={INTEGRATION_COLORS.g400}
                className={cx(styles.chevron, expandedTenant === tenant.id && styles.chevronExpanded)}
                onClick={e => { e.stopPropagation(); setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id); }}
              />
            </div>

            {/* Processing overlay */}
            {isProcessing && (
              <div className={styles.processingPanel}>
                <TenantProcessingCard
                  tenant={tenant}
                  connectorId={data.id}
                  platformTenantId={linkedPlatformTenant?.id || tenant.platformTenantId}
                  pipelines={enabledPipelineNames}
                  onComplete={() => onProcessingComplete(tenant.id)}
                  onError={onProcessingError}
                />
              </div>
            )}

            {/* Expanded config panel (only when not processing) */}
            {expandedTenant === tenant.id && !isProcessing && (
              <div className={cx("fade-in", styles.expandedPanel)}>

                {!isLinked && (
                  <div className={styles.formBlock}>
                    <label className={cx("label", styles.platformLabel)}>
                      <Link2 size={11} color={INTEGRATION_COLORS.info} /> Tenant plateforme
                    </label>
                    <GQLTenantLinker
                      tenant={tenant}
                      platformTenants={platformTenants}
                      loading={platformTenantsLoading}
                      onLink={(pt) => linkPlatformTenant(tenant.id, pt)}
                    />
                  </div>
                )}

                {isIsolated && (
                  <div className={styles.isolatedDbPanel}>
                    <label className="label">Connexion DB isolee du tenant</label>
                    <div className={styles.dbGrid}>
                      <input className="input mono" value={tenant.database?.jdbcUrl || ""} onChange={e => updateTenantDatabase(tenant.id, "jdbcUrl", e.target.value)} placeholder="jdbc:postgresql://host:5432/client_db" />
                      <input className="input" value={tenant.database?.jdbcUsername || ""} onChange={e => updateTenantDatabase(tenant.id, "jdbcUsername", e.target.value)} placeholder="DB user" />
                      <input className="input" type="password" value={tenant.database?.jdbcPassword || ""} onChange={e => updateTenantDatabase(tenant.id, "jdbcPassword", e.target.value)} placeholder="DB password" />
                    </div>
                    <div className={styles.dbHelp}>Schema identique a la base partagee: seules les informations de connexion DB sont requises.</div>
                    <IsolatedDbTester db={tenant.database} />
                  </div>
                )}

                {/* Pipeline statuses */}
                {Object.entries(allPipelineKeys).map(([pipeKey, plDef]) => {
                  const st = tenant.statuses?.[pipeKey] || {};
                  const PIcon = plDef.Icon || Settings2;
                  return (
                    <div key={pipeKey} className={styles.pipelineCard}>
                      <div className={styles.pipelineHeader}>
                        <PIcon size={14} color={plDef.color} />
                        <span className={styles.pipelineTitle}>{plDef.label}</span>
                      </div>
                      <div className={styles.statusGrid}>
                        <div className={styles.statusColumn}>
                          <label className={cx("label", styles.warningLabel)}>Statuts provisoires</label>
                          <StatusTagInput
                            value={st.provisional || []}
                            onChange={next => updateTenantStatus(tenant.id, pipeKey, "provisional", next)}
                            placeholder="Entrée puis Entrée"
                            color={INTEGRATION_COLORS.warning}
                          />
                        </div>
                        <div className={styles.statusColumn}>
                          <label className={cx("label", styles.successLabel)}>Statuts finaux</label>
                          <StatusTagInput
                            value={st.final || []}
                            onChange={next => updateTenantStatus(tenant.id, pipeKey, "final", next)}
                            placeholder="Validé puis Entrée"
                            color={INTEGRATION_COLORS.success}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Bulk pipeline deployment ── */}
      <div className={cx(styles.deployPanel, data.id ? styles.deployPanelReady : styles.deployPanelPending)}>
        <div className={styles.deployHeader}>
          <div className={cx(styles.deployIcon, data.id ? styles.deployIconReady : styles.deployIconPending)}>
            <Zap size={15} color={data.id ? INTEGRATION_COLORS.success : INTEGRATION_COLORS.warning} />
          </div>
          <div className={styles.deployText}>
            <div className={styles.deployTitle}>Déploiement des pipelines</div>
            <div className={styles.deployMeta}>
              {activeLinkedTenants.length} tenant(s) actif(s) et lié(s) · {enabledTemplatesCount} pipeline(s) par tenant
              {activeLinkedTenants.length > 0 && ` · durée estimée ≈ ${Math.max(1, Math.round(activeLinkedTenants.length * enabledTemplatesCount * 50 / 3 / 60))} min (3 activations en parallèle)`}
            </div>
          </div>
          {!data.id ? (
            <button type="button" className="btn btn-primary" disabled={savingConnector} onClick={async () => {
              setSavingConnector(true);
              try { await onPersist?.(); } catch (err) { toast(err.message || "Sauvegarde impossible", "error"); }
              finally { setSavingConnector(false); }
            }}>
              {savingConnector ? <RefreshCw size={13} className="spin" /> : <Check size={13} />} Sauvegarder le connecteur
            </button>
          ) : (
            <button type="button" className={cx("btn btn-primary", activeLinkedTenants.length === 0 && styles.dimmed)} disabled={activeLinkedTenants.length === 0 || deployPolling} onClick={deployAll}>
              {deployPolling ? <RefreshCw size={13} className="spin" /> : <Zap size={13} />} Déployer vers {activeLinkedTenants.length} tenant(s)
            </button>
          )}
        </div>
        {!data.id && (
          <div className={styles.deployHelp}>
            Les pipelines sont créés côté serveur à partir des templates <strong>sauvegardés</strong> — sauvegardez d'abord (le wizard reste ouvert), puis déployez.
          </div>
        )}
        {deployState?.phase === "error" && <div className={styles.deployError}>{deployState.error}</div>}
        {deployState?.phase === "invalid" && (
          <div className={styles.invalidPanel}>
            <div className={styles.invalidHeader}>
              <AlertTriangle size={15} color={INTEGRATION_COLORS.red} />
              <span className={styles.invalidTitle}>Déploiement bloqué — pipelines invalides</span>
            </div>
            {(deployState.errors || []).map((e, i) => (
              <div key={i} className={styles.invalidRow}>
                <span className={styles.invalidTemplate}>{e.templateKey}</span>
                <span className={styles.invalidMessage}> — {e.message}</span>
              </div>
            ))}
            <div className={styles.invalidHelp}>Corrigez les mappages de colonnes dans l'étape Pipelines, sauvegardez, puis redéployez.</div>
          </div>
        )}
        {deployState?.totals && (() => {
          const t = deployState.totals;
          const done = (t.success || 0) + (t.failed || 0) + (t.partial || 0);
          const total = Math.max(1, (t.running || 0) + (t.pending || 0) + done);
          return (
            <div className={styles.progressBlock}>
              <div className={styles.progressMeta}>
                <span>{deployState.phase === "done" ? "Déploiement terminé" : "Déploiement en cours…"}</span>
                <span>{done}/{total} terminé(s) · {t.running || 0} en cours · {t.pending || 0} en attente{(t.failed || 0) > 0 ? ` · ${t.failed} échec(s)` : ""}</span>
              </div>
              <progress className={cx(styles.progressBar, (t.failed || 0) > 0 && styles.progressBarWarning)} value={done} max={total} />
              <div className={styles.deployRows}>
                {(deployState.rows || []).map(r => {
                  const statusClass = r.jobStatus === "SUCCESS" ? styles.rowSuccess
                    : r.jobStatus === "FAILED" ? styles.rowFailed
                    : r.jobStatus === "PARTIAL_SUCCESS" ? styles.rowPartial
                    : r.jobStatus === "RUNNING" ? styles.rowRunning : styles.rowIdle;
                  return (
                    <span key={r.connectionId} className={cx("mono", styles.deployRow, statusClass)}>
                      {r.externalId} · {r.jobStatus === "RUNNING" ? `${r.pipelinesCompleted ?? 0}/${r.pipelinesTotal ?? "?"} pipelines` : (r.jobStatus || "non démarré")}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Platform tenant reference list */}
      {platformTenants.length > 0 && (
        <div className={styles.platformPanel}>
          <div className={styles.platformHeader}>
            <Users size={13} color={INTEGRATION_COLORS.g500} />
            <span className={styles.platformTitle}>Tenants plateforme ({platformTenants.length})</span>
          </div>
          <div className={styles.platformList}>
            {platformTenants.map(pt => (
              <div key={pt.id} className={styles.platformRow}>
                <div className={styles.platformIcon}>
                  <CheckCircle2 size={12} color={INTEGRATION_COLORS.info} />
                </div>
                <div className={styles.platformInfo}>
                  <div className={styles.platformName}>{pt.name}</div>
                  <div className={styles.platformMeta}>ID: {pt.id}{pt.industry ? ` · ${pt.industry}` : ""}</div>
                </div>
                {tenants.some(t => t.platformTenantId === pt.id) && (
                  <span className={styles.platformLinked}>Lié</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
