

import { useState, useEffect } from "react";
import { Building2, Link2, Plus } from "lucide-react";
import { Radar } from "recharts";
import { Icon } from "@/shared/ui/Icon";
import { Modal } from "@/shared/ui/Modal";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useToast } from "@/contexts/toastContextValue";
import { selectAuthUser } from "@/features/auth/model/authSelectors";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesByTenantId } from "@/features/pipelines/model/pipelineSelectors";
import { enrichTenantWithStats, selectTenantStatsById } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { isSystemTenant, setTenantsCache, updateTenantStore } from "@/features/tenants/model/tenantActions";
import { loadPipelinesForTenant, loadTenantStats } from "@/shared/model/dataLoaders";
import { MLContent } from "@/features/pipelines/components/MLContent";
import { createTenant, deleteTenant, deleteTenantConnection, getTenantConnections, getTenants, updateTenant, updateTenantConnection } from "@/features/tenants/api/tenantsApi";
import { CredsMView, CredsPanel, ChangeCredentialsForm } from "@/features/tenants/components/TenantCredentialsPanel";
import { ErpConnectInline, ErpConnectionForm } from "@/features/tenants/components/TenantErpConnection";
import { TenantForm } from "@/features/tenants/components/TenantForm";
import { logError } from "@/shared/utils/logError";
import styles from "./TenantsView.module.css";



export function TenantsView() {
  const toast = useToast();
  const { isAdmin } = useSession();
  const user = useAppSelector(selectAuthUser);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const tenantStatsById = useAppSelector(selectTenantStatsById);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const [expanded, setExpanded] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [drawerTenantId, setDrawerTenantId] = useState(null);
  const [mlPipeline, setMlPipeline] = useState(null);
  const [changingCredsFor, setChangingCredsFor] = useState(null);
  const [erpConnections, setErpConnections] = useState({});
  const [addErpFor, setAddErpFor] = useState(null);
  const [configErpConnId, setConfigErpConnId] = useState(null);
  const [configTemplates, setConfigTemplates] = useState({});
  const [apiTenants, setApiTenants] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    getTenants({ size: 100 })
      .then((res) => {
        const fetched = res?.content || [];
        setApiTenants(fetched);
        setTenantsCache(fetched);
        if (fetched.length > 0) {
          Promise.all(fetched.map(t => loadPipelinesForTenant(t.id))).catch(err => console.error("Failed to fetch pipelines:", err));
          // Per-tenant backend stats feed the cards via Redux tenant enrichment.
          fetched.forEach(t => loadTenantStats(t.id).catch((error) => logError("tenants.loadTenantStats", error)));
        }
      })
      .catch(err => console.error("Failed to fetch tenants:", err))
  }, [isAdmin]);

  if (!user) return null;
  const tenantList = apiTenants || [];
  const enrichTenant = (tenant) => enrichTenantWithStats(tenant, tenantStatsById[tenant?.id]);
  const drawerTenant = drawerTenantId ? enrichTenant(tenantList.find(t => t.id === drawerTenantId)) : null;
  const drawerPipelines = drawerTenantId ? pipelinesByTenantId[drawerTenantId] || [] : [];
  const visibleTenants = (isAdmin
    ? tenantList.filter((t) => !t.parentId && !isSystemTenant(t))
    : tenantList.filter((t) => t.id === user.tenantId)
  ).map(enrichTenant);

  const handleCreate = async (parentId, data) => {
    try {
      await createTenant({
        name: data.name,
        username: data.username,
        password: data.password,
        color: data.color,
      });
      setNewCreds({ name: data.name, creds: { username: data.username, password: data.password } });
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      setShowAdd(false);
      setAddingSubFor(null);
      const res = await getTenants({ size: 100 });
      if (res?.content) { setApiTenants(res.content); setTenantsCache(res.content); }
      toast(`${parentId ? "Partenaire ERP" : "Tenant"} créé`, "success");
    } catch (e) {
      console.error("Failed to create tenant:", e);
      toast("Erreur lors de la création du tenant", "error");
    }
  };

  const handleEdit = async (id, data) => {
    try {
      await updateTenant(id, {
        name: data.name,
        color: data.color,
        username: data.username,
        ...(data.password ? { password: data.password } : {}),
      });
      setEditingId(null);
      refresh();
      toast("Mis à jour", "success");
    } catch (e) {
      console.error("Failed to update tenant:", e);
      toast("Erreur lors de la mise à jour", "error");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTenant(id);
      setConfirmDel(null);
      refresh();
      toast("Supprimé", "warning");
    } catch (e) {
      console.error("Failed to delete tenant:", e);
      toast("Erreur lors de la suppression", "error");
    }
  };

  const handleChangeCredentials = async (id, data) => {
    try {
      await updateTenant(id, {
        username: data.username,
        password: data.password,
      });
      setChangingCredsFor(null);
      toast("Credentials mis à jour", "success");
    } catch (e) {
      console.error("Failed to update credentials:", e);
      toast("Erreur lors de la mise à jour des credentials", "error");
    }
  };

  const fetchErpConnections = async (tenantId) => {
    try {
      const res = await getTenantConnections({ tenantId });
      if (res) setErpConnections(prev => ({ ...prev, [tenantId]: res }));
      await loadPipelinesForTenant(tenantId);
    } catch (e) {
      console.error("Failed to fetch ERP connections:", e);
    }
  };

  const paletteClass = (value) => {
    const palette = [styles.paletteRed, styles.paletteInfo, styles.paletteSuccess, styles.paletteWarning, styles.palettePurple, styles.paletteTeal, styles.paletteOrange, styles.palettePink];
    const source = String(value || "");
    const hash = source.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
  };

  return (
    <div className={`fade-up ${styles.page}`}>
      <PageHeader
        eyebrow="Administration"
        title={isAdmin ? "Gestion des tenants" : "Mes partenaires ERP"}
        subtitle={`${visibleTenants.length} tenant${visibleTenants.length > 1 ? "s" : ""} · administration hiérarchique`}
        actions={isAdmin && visibleTenants.length > 0 && (
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="btn-primary"
          >
            ＋ Nouveau tenant
          </button>
        )}
      />

      {/* ── Add tenant form (slide-down) ────────────────────────────────── */}
      {showAdd && (
        <TenantForm
          title="Créer un nouveau tenant"
          parentId={null}
          onSave={(d) => handleCreate(null, d)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className={styles.tenantList}>
        {visibleTenants.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Building2 size={34} color={COLORS.red} strokeWidth={1.8} />
            </div>
            <div className={styles.emptyTitle}>Aucun partenaire ERP</div>
            <div className={styles.emptyText}>Vous n'avez pas encore créé de partenaire ERP.</div>
            {isAdmin && (
              <button onClick={() => { setShowAdd(true); setEditingId(null); }} className="btn-primary">
                ＋ Nouveau tenant
              </button>
            )}
          </div>
        )}

        {visibleTenants.map((tenant) => {
          const children = tenantList.filter((item) => item.parentId === tenant.id).map(enrichTenant);
          const pipes = pipelinesByTenantId[tenant.id] || [];
          // Distinct ERP connectors this tenant's pipelines belong to → "connexion ERP".
          const erpConnCount = new Set(pipes.map((p) => p.connectorId).filter(Boolean)).size;
          const isExpand = expanded.has(tenant.id);
          return (
            <div key={tenant.id} className={`glass-card ${styles.tenantCard}`}>
              {editingId === tenant.id ? (
                <TenantForm
                  title={`Modifier ${tenant.name}`}
                  initial={tenant}
                  onSave={(d) => handleEdit(tenant.id, d)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className={styles.tenantHeader}>
                    <button
                      onClick={() =>
                        setExpanded((p) => {
                          const n = new Set(p);
                          if (n.has(tenant.id)) {
                            n.delete(tenant.id);
                          } else {
                            n.add(tenant.id);
                            fetchErpConnections(tenant.id);
                          }
                          return n;
                        })
                      }
                      className="btn-icon"
                    >
                      <Icon name={isExpand ? "chevronDown" : "chevronRight"} size={14} color={COLORS.grey500} />
                    </button>
                    <button
                      onClick={() => setDrawerTenantId(drawerTenantId === tenant.id ? null : tenant.id)}
                      className={styles.tenantTrigger}
                    >
                      <div className={`${styles.tenantLogo} ${paletteClass(tenant.color || tenant.id)} ${drawerTenantId === tenant.id ? styles.tenantLogoActive : ""}`}>
                        {tenant.logo}
                      </div>
                      <div className={styles.tenantInfo}>
                        <div className={`${styles.tenantName} ${drawerTenantId === tenant.id ? styles.tenantNameActive : ""}`}>
                          {tenant.name}
                        </div>
                        <div className={styles.tenantMeta}>
                          {tenant.plan} · {erpConnCount > 0 ? `${erpConnCount} connexion ERP${erpConnCount > 1 ? "s" : ""}` : `${children.length} partenaire ERP${children.length > 1 ? "s" : ""}`} · <span className={styles.infoText}>voir pipelines</span>
                        </div>
                      </div>
                    </button>
                    <div className={styles.statsGrid}>
                      {[
                        [(tenant.invoiceCount || 0).toLocaleString("fr-FR"), "Factures", styles.statNeutral],
                        [tenant.anomalyCount || 0, "Anomalies", styles.statDanger],
                        [pipes.length, "Pipelines", styles.statInfo],
                      ].map(([v, l, toneClass]) => (
                        <div key={l}>
                          <div className={`${styles.statValue} ${toneClass}`}>{v}</div>
                          <div className={styles.statLabel}>{l}</div>
                        </div>
                      ))}
                    </div>
                    {isAdmin && (
                      <div className={styles.iconActions}>
                        <button onClick={() => setEditingId(tenant.id)} className="btn-icon">
                          <Icon name="edit" size={14} color={COLORS.grey500} />
                        </button>
                        <button onClick={() => setConfirmDel(tenant.id)} className="btn-icon">
                          <Icon name="trash" size={14} color={COLORS.red} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpand && (
                    <div className={styles.expandedPanel}>
                      <CredsPanel
                        tenantId={tenant.id}
                        username={tenant.username}
                        onChangeCreds={() => setChangingCredsFor(tenant.id)}
                      />

                      {/* Change credentials inline */}
                      {changingCredsFor === tenant.id && (
                        <ChangeCredentialsForm
                          tenantId={tenant.id}
                          tenantName={tenant.name}
                          onSave={(data) => handleChangeCredentials(tenant.id, data)}
                          onCancel={() => setChangingCredsFor(null)}
                        />
                      )}

                      {/* Automation Toggle */}
                      <div className={styles.automationBlock}>
                        <div className={styles.sectionHeader}>
                          <span className={styles.sectionTitle}>
                            Automatisation des pipelines
                          </span>
                          <label className={`${styles.switch} ${styles.switchLarge}`}>
                            <input type="checkbox" checked={tenant.automationEnabled !== false}
                              onChange={async (e) => {
                                try {
                                  await updateTenant(tenant.id, { automationEnabled: e.target.checked });
                                  updateTenantStore(tenant.id, { automationEnabled: e.target.checked });
                                  toast("Automatisation " + (e.target.checked ? "activée" : "désactivée"), "info");
                                } catch {
                                  toast("Erreur", "error");
                                }
                              }}
                              className={styles.switchInput} />
                            <span className={styles.switchTrack}>
                              <span className={styles.switchThumb} />
                            </span>
                          </label>
                        </div>
                        <p className={styles.helperText}>
                          Si activé, les pipelines seront créés et configurés automatiquement à partir du schéma ERP déclaré.
                        </p>
                      </div>

                      {/* ERP Connections */}
                      <div>
                        <div className={styles.sectionHeaderSpaced}>
                          <span className={styles.sectionTitle}>
                            Connexions ERP ({erpConnections[tenant.id]?.length || 0})
                          </span>
                        </div>
                        <div className={styles.connectionList}>
                          {(erpConnections[tenant.id] || []).map(conn => {
                            const templates = (() => {
                              try { return JSON.parse(conn.processedTemplatesJson || "[]"); } catch { return []; }
                            })();
                            const currentTemplates = configTemplates[conn.id] || templates;
                            return (
                              <div key={conn.id} className={`${styles.connectionCard} ${conn.active ? styles.connectionActive : ""}`}>
                                <div className={styles.connectionRow}>
                                  <div className={`${styles.connectionLogo} ${paletteClass(conn.connectorColor || conn.connectorName)}`}>{conn.connectorLogo || conn.connectorName?.[0] || "?"}</div>
                                  <div className={styles.connectionInfo}>
                                    <div className={styles.connectionName}>{conn.connectorName || "ERP"}</div>
                                    <div className={styles.connectionMeta}>{conn.connectorType} · ID: {conn.externalId} · {templates.length ? templates.join(", ") : "Aucun template sync"}</div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setConfigErpConnId(configErpConnId === conn.id ? null : conn.id);
                                      setConfigTemplates((prev) => ({ ...prev, [conn.id]: prev[conn.id] || templates }));
                                    }}
                                    className={`btn-ghost ${styles.smallGhost}`}
                                  >
                                    Configurer
                                  </button>
                                  <label className={styles.switch}>
                                    <input type="checkbox" checked={conn.active !== false} onChange={async () => {
                                      try {
                                        await updateTenantConnection(conn.id, { active: !conn.active });
                                        setErpConnections(prev => ({ ...prev, [tenant.id]: (prev[tenant.id] || []).map(x => x.id === conn.id ? { ...x, active: !conn.active } : x) }));
                                        toast(conn.active ? "Désactivé" : "Activé", "info");
                                      } catch { toast("Erreur", "error"); }
                                    }} className={styles.switchInput} />
                                    <span className={styles.switchTrack}>
                                      <span className={styles.switchThumb} />
                                    </span>
                                  </label>
                                  <button onClick={async () => {
                                    if (!confirm("Supprimer cette connexion ERP ?")) return;
                                    try {
                                      await deleteTenantConnection(conn.id);
                                      setErpConnections(prev => ({ ...prev, [tenant.id]: (prev[tenant.id] || []).filter(x => x.id !== conn.id) }));
                                      toast("Connexion supprimée", "warning");
                                    } catch { toast("Erreur", "error"); }
                                  }} className={`btn-icon ${styles.tinyIconButton}`}>
                                    <Icon name="x" size={11} color={COLORS.grey400} />
                                  </button>
                                </div>
                                {configErpConnId === conn.id && (
                                  <div className={styles.configPanel}>
                                    <div className={styles.configTitle}>Configuration de synchronisation</div>
                                    <div className={styles.templateChips}>
                                      {["facture", "commande", "budget"].map((tpl) => {
                                        const checked = currentTemplates.includes(tpl);
                                        return (
                                          <button key={tpl} type="button" onClick={() => setConfigTemplates(prev => ({ ...prev, [conn.id]: checked ? currentTemplates.filter(x => x !== tpl) : [...currentTemplates, tpl] }))} className={`${styles.templateChip} ${checked ? styles.templateChipActive : ""}`}>
                                            {tpl}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className={styles.configActions}>
                                      <button className={`btn-ghost ${styles.configButton}`} onClick={() => fetchErpConnections(tenant.id)}>
                                        Synchroniser
                                      </button>
                                      <button className={`btn-primary ${styles.configButtonPrimary}`} onClick={async () => {
                                        const nextJson = JSON.stringify(currentTemplates);
                                        await updateTenantConnection(conn.id, { processedTemplatesJson: nextJson });
                                        setErpConnections(prev => ({ ...prev, [tenant.id]: (prev[tenant.id] || []).map(x => x.id === conn.id ? { ...x, processedTemplatesJson: nextJson } : x) }));
                                        toast("Configuration ERP sauvegardée", "success");
                                      }}>
                                        Sauvegarder
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setAddErpFor(addErpFor === tenant.id ? null : tenant.id)}
                          className={`btn-ghost ${styles.addErpButton} ${addErpFor === tenant.id ? styles.addErpButtonActive : ""}`}
                        >
                          <span className={styles.addErpIcon}>{addErpFor === tenant.id ? "−" : "+"}</span>
                          {addErpFor === tenant.id ? "Fermer" : "Lier un ERP"}
                        </button>
                        {addErpFor === tenant.id && (
                          <div className={`fade-in ${styles.addErpPanel}`}>
                            <ErpConnectInline
                              tenantId={tenant.id}
                              existingConnections={erpConnections[tenant.id] || []}
                              onCancel={() => setAddErpFor(null)}
                              onDone={() => {
                                fetchErpConnections(tenant.id);
                                setAddErpFor(null);
                              }}
                              toast={toast}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className={styles.sectionHeaderSpaced}>
                          <span className={styles.sectionTitle}>
                            Partenaires ERP ({children.length})
                          </span>
                          <button onClick={() => setAddingSubFor(tenant.id)} className={`btn-ghost ${styles.addSubButton}`}>
                            ＋ Ajouter
                          </button>
                        </div>
                        {addingSubFor === tenant.id && (
                          <div className={styles.addSubPanel}>
                            <ErpConnectionForm
                              tenantId={tenant.id}
                              onCancel={() => setAddingSubFor(null)}
                              onDone={() => { setAddingSubFor(null); refresh(); }}
                            />
                          </div>
                        )}
                        <div className={styles.subList}>
                          {children.map((sub) => (
                            <div key={sub.id}>
                              {editingId === sub.id ? (
                                <TenantForm
                                  title={`Modifier ${sub.name}`}
                                  initial={sub}
                                  onSave={(d) => handleEdit(sub.id, d)}
                                  onCancel={() => setEditingId(null)}
                                />
                              ) : (
                                <div className={`group ${styles.subRow}`}>
                                  <div className={`${styles.subLogoWrap} ${paletteClass(sub.color || sub.id)}`}>
                                    <div className={styles.subLogoDot} />
                                  </div>
                                  <div className={styles.subInfo}>
                                    <div className={styles.subName}>{sub.name}</div>
                                    <div className={styles.subPlan}>{sub.plan}</div>
                                  </div>
                                  <div className={styles.subStats}>
                                    <span className={styles.subStat}>
                                      <Icon name="fileText" size={11} color={COLORS.grey400} />
                                      {sub.invoiceCount || 0}
                                    </span>
                                    <span className={`${styles.subStat} ${styles.warningText}`}>
                                      <Icon name="triangle" size={11} color={COLORS.warning} />
                                      {sub.anomalyCount || 0}
                                    </span>
                                    <span className={styles.subStat}>
                                      <Icon name="pipelines" size={11} color={COLORS.grey400} />
                                      {(pipelinesByTenantId[sub.id] || []).length}
                                    </span>
                                  </div>
                                  <div className={styles.subActions}>
                                    <button onClick={() => setEditingId(sub.id)} className="btn-icon">
                                      <Icon name="edit" size={13} color={COLORS.grey500} />
                                    </button>
                                    <button onClick={() => setConfirmDel(sub.id)} className="btn-icon">
                                      <Icon name="trash" size={13} color={COLORS.red} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {children.length === 0 && (
                            <div className={styles.emptySubList}>
                              Aucun partenaire ERP
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tenant pipeline drawer ─────────────────────────────────────── */}
      {drawerTenant && (
        <div className={`scale-in ${styles.drawer}`}>
          <div className={styles.drawerHeader}>
            <div className={`${styles.drawerLogo} ${paletteClass(drawerTenant.color || drawerTenant.id)}`}>
              {drawerTenant.logo}
            </div>
            <div className={styles.drawerInfo}>
              <div className={styles.drawerTitle}>{drawerTenant.name}</div>
              <div className={styles.drawerMeta}>
                {drawerPipelines.length} pipeline{drawerPipelines.length !== 1 ? "s" : ""} · {drawerTenant.plan}
              </div>
            </div>
            <button onClick={() => setDrawerTenantId(null)} className="btn-icon">
              <Icon name="x" size={15} color={COLORS.grey500} />
            </button>
          </div>
          <div className={styles.drawerBody}>
            {drawerPipelines.length === 0 && (
              <div className={styles.emptyDrawer}>
                Aucun pipeline pour ce tenant
              </div>
            )}
            {drawerPipelines.map((p) => {
              const statusClass = p.status === "actif" ? styles.statusActive : p.status === "warning" ? styles.statusWarning : styles.statusPaused;
              const statusLabel = p.status === "actif" ? "Actif" : p.status === "warning" ? "Alerte" : "En pause";
              const statusIcon = p.status === "actif" ? "check" : p.status === "warning" ? "triangle" : "pauseCircle";
              const anomalyPct = (p.anomalyRate * 100).toFixed(1);
              const anomalyHigh = parseFloat(anomalyPct) > 2;
              const lastRun = p.lastRun ? new Date(p.lastRun).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
              return (
                <div key={p.id} className={`card-hover ${styles.pipelineRow}`}>
                  <div className={styles.pipelineIcon}>
                    <Icon name="pipelines" size={16} color={COLORS.red} />
                  </div>
                  <div className={styles.pipelineInfo}>
                    <div className={styles.pipelineName}>{p.name}</div>
                    <div className={styles.pipelineMeta}>
                      <span className={styles.pipelineConnector}>
                        <span className={`${styles.statusDot} ${statusClass}`} />
                        {p.connector}
                      </span>
                      <span>·</span>
                      <span>{p.freq}</span>
                      <span>·</span>
                      <span>Dernier run : {lastRun}</span>
                    </div>
                  </div>
                  <div className={styles.pipelineStats}>
                    <div className={styles.pipelineStat}>
                      <div className={styles.pipelineStatValue}>{p.invoicesProcessed.toLocaleString("fr-FR")}</div>
                      <div className={styles.pipelineStatLabel}>Factures</div>
                    </div>
                    <div className={styles.pipelineStat}>
                      <div className={`${styles.pipelineStatValue} ${anomalyHigh ? styles.statDanger : styles.statSuccess}`}>{anomalyPct}%</div>
                      <div className={styles.pipelineStatLabel}>Anomalies</div>
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusClass}`}>
                    <Icon name={statusIcon} size={10} />
                    {statusLabel}
                  </span>
                  <button onClick={() => setMlPipeline(p)} className={`btn-ghost ${styles.openPipelineButton}`}>
                    <Icon name="sparkle" size={12} color={COLORS.grey600} />
                    Ouvrir
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────── */}
      {confirmDel && (
        <div className="modal-overlay">
          <div className="modal-bg" onClick={() => setConfirmDel(null)} />
          <div className={`modal-box scale-in ${styles.confirmBox}`}>
            <div className={styles.confirmBody}>
              <div className={styles.confirmTitle}>Supprimer ce tenant ?</div>
              <p className={styles.confirmText}>Cette action est irréversible.</p>
              <div className={styles.confirmActions}>
                <button onClick={() => setConfirmDel(null)} className="btn-ghost">Annuler</button>
                <button onClick={() => handleDelete(confirmDel)} className="btn-primary">Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!newCreds} onClose={() => setNewCreds(null)} size="440px" title={newCreds ? `Credentials — ${newCreds.name}` : ""}>
        {newCreds && <CredsMView creds={newCreds.creds} onClose={() => setNewCreds(null)} />}
      </Modal>

      <Modal open={!!mlPipeline} onClose={() => setMlPipeline(null)} size="1280px" title={mlPipeline ? `Analyse ML — ${mlPipeline.name}` : ""} subtitle="Vue analytics complète · Tendances · Anomalies · Séries · Radar · Scores · Insights IA"
        icon={
          <div className={styles.mlIcon}>
            <Icon name="sparkle" size={18} color="#fff" />
          </div>
        }
      >
        {mlPipeline && <MLContent pipeline={mlPipeline} />}
      </Modal>
    </div>
  );
}
