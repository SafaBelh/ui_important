/**
 * "Pipelines" wizard step: per-pipeline source-table selection, field mapping and the
 * visual join configuration. Extracted from IntegrationsView.
 */
import { useCallback, useMemo, useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Clock, Database, GitBranch, Layers, Link2, Plus, Settings2, X } from "lucide-react";
import { CUSTOM_PIPELINE_COLORS, PIPELINE_DEFS } from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { normalizePipelineField } from "@/features/integrations/utils/wizardHelpers";
import { Toggle, InfoBox, SectionAccordion, VisualJoinBuilder } from "@/features/integrations/components/WizardUiPrimitives";
import styles from "./PipelinesStep.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const getPipelineTheme = (color) => {
  switch (String(color || "").toUpperCase()) {
    case "#D94F3D": return "red";
    case "#3B82F6": return "blue";
    case "#8B5CF6": return "purple";
    case "#14B8A6": return "teal";
    case "#F97316": return "orange";
    case "#EC4899": return "pink";
    default: return "gray";
  }
};

/* ─── PIPELINES STEP (updated with visual join builder) ──────── */
export function PipelinesStep({ data, setData, schema }) {
  const selectedTables = data.selectedTables || [];
  const pipelines = useMemo(() => data.pipelines || {}, [data.pipelines]);
  const customPipelines = data.customPipelines || [];
  const activeTables = (schema?.tables || []).filter(t => selectedTables.includes(t.name));
  const [activeTab, setActiveTab] = useState("facture");
  const [newPipelineName, setNewPipelineName] = useState("");
  const [showAddPipeline, setShowAddPipeline] = useState(false);

  const addCustomPipeline = () => {
    if (!newPipelineName.trim()) return;
    const id = `custom_${Date.now()}`;
    const colorIdx = customPipelines.length % CUSTOM_PIPELINE_COLORS.length;
    setData({ ...data, customPipelines: [...customPipelines, { id, label: newPipelineName.trim(), color: CUSTOM_PIPELINE_COLORS[colorIdx] }] });
    setNewPipelineName(""); setShowAddPipeline(false); setActiveTab(id);
  };
  const removeCustomPipeline = id => { const next = customPipelines.filter(cp => cp.id !== id); const nextPipelines = { ...pipelines }; delete nextPipelines[id]; setData({ ...data, customPipelines: next, pipelines: nextPipelines }); setActiveTab("facture"); };
  const setPipeline = useCallback((k, v) => setData({ ...data, pipelines: { ...pipelines, [k]: v } }), [data, pipelines, setData]);
  const isBuiltin = activeTab === "facture" || activeTab === "commande";
  const builtinDef = isBuiltin ? PIPELINE_DEFS[activeTab] : null;
  const customDef = !isBuiltin ? customPipelines.find(cp => cp.id === activeTab) : null;
  const plColor = builtinDef?.color || customDef?.color || INTEGRATION_COLORS.g400;
  const pipelineTheme = getPipelineTheme(plColor);
  const plLabel = builtinDef?.label || customDef?.label || activeTab;
  const PlIcon = builtinDef?.Icon || Settings2;
  const defaultPipeline = useMemo(() => ({ enabled: true, tables: [], joins: [], conditions: [], fieldMappings: {}, extraFields: [], userFields: [], groupByCols: [] }), []);
  const pl = pipelines[activeTab] || defaultPipeline;
  const setPl = useCallback((val) => setPipeline(activeTab, val), [activeTab, setPipeline]);
  const toggleTable = tname => setPl({ ...pl, tables: pl.tables.includes(tname) ? pl.tables.filter(t => t !== tname) : [...pl.tables, tname] });
  const plTables = activeTables.filter(t => (pl.tables || []).includes(t.name));
  const plCols = plTables.flatMap(t => t.cols.map(c => ({ full: `${t.name}.${c}`, table: t.name, col: c })));
  const fixedFields = (builtinDef?.fixedFields || (!isBuiltin ? [
    { key: "date", label: "Date", required: true },
    { key: "amount", label: "Montant", required: true },
    { key: "status", label: "Statut", required: true },
  ] : [])).map(normalizePipelineField);
  const userFields = pl.userFields || [];
  const addUserField = () => { const id = `field_${Date.now()}`; setPl({ ...pl, userFields: [...userFields, { id, key: "", label: "", type: "text", required: false }] }); };
  const updateUserField = (id, field, value) => { const nextFields = userFields.map(f => f.id === id ? { ...f, [field]: value } : f); setPl({ ...pl, userFields: nextFields }); };
  const removeUserField = (id) => { const field = userFields.find(f => f.id === id); const nextMappings = { ...(pl.fieldMappings || {}) }; if (field?.key) delete nextMappings[field.key]; setPl({ ...pl, userFields: userFields.filter(f => f.id !== id), fieldMappings: nextMappings }); };
  const setUserFieldMapping = (field, value) => { if (!field.key) return; setPl({ ...pl, fieldMappings: { ...(pl.fieldMappings || {}), [field.key]: value } }); };
  const requiresGroupBy = activeTab !== "facture";
  const supportsGroupByOverride = activeTab === "facture" || requiresGroupBy;
  // A groupBy field is selectable only once it's mapped to a source column
  // (mapped flag); unmapped fields render disabled with an "à mapper" hint.
  const gbFm = pl.fieldMappings || {};
  const mkOption = (f, source) => ({ key: f.key, label: (f.label || f.key).replace(/^Groupe:\s*/, ""), source, mapped: !!(gbFm[f.key] && String(gbFm[f.key]).trim()) });
  const groupByOptions = supportsGroupByOverride
    ? activeTab === "facture"
      ? [
        ...fixedFields.filter(f => !["invoiceDate", "amount", "status"].includes(f.key)).map(f => mkOption(f, "Champ standard")),
        ...userFields.filter(f => f.key).map(f => mkOption(f, "Champ additionnel")),
      ]
      : activeTab === "commande"
      ? [
        ...fixedFields.filter(f => !["commandeDate", "amount", "status"].includes(f.key)).map(f => mkOption(f, "Champ standard")),
        ...userFields.filter(f => f.key).map(f => mkOption(f, "Champ additionnel")),
      ]
      : userFields.filter(f => f.key).map(f => mkOption(f, "Champ additionnel"))
    : [];
  const toggleGroupBy = (key, mapped) => {
    if (mapped === false) return; // can't group by an unmapped field
    const current = Array.isArray(pl.groupByCols) ? pl.groupByCols : [];
    setPl({ ...pl, groupByCols: current.includes(key) ? current.filter(item => item !== key) : [...current, key] });
  };
  // Group by ANY source column (e.g. centre_code so one supplier split across
  // budget centres yields distinct series): auto-creates the matching custom
  // field + mapping, then selects it as a grouping dimension.
  const addGroupByFromColumn = (full) => {
    if (!full) return;
    const colName = String(full.split(".").pop() || "").replace(/[^A-Za-z0-9_]/g, "_");
    if (!colName) return;
    const current = Array.isArray(pl.groupByCols) ? pl.groupByCols : [];
    const known = [...fixedFields, ...userFields].find(f => f.key === colName);
    if (known) {
      setPl({
        ...pl,
        fieldMappings: { ...(pl.fieldMappings || {}), [colName]: (pl.fieldMappings || {})[colName] || full },
        groupByCols: current.includes(colName) ? current : [...current, colName],
      });
      return;
    }
    setPl({
      ...pl,
      userFields: [...userFields, { id: `gb_${Date.now()}`, key: colName, label: colName, type: "text", required: false }],
      fieldMappings: { ...(pl.fieldMappings || {}), [colName]: full },
      groupByCols: [...current, colName],
    });
  };
  const activeGbCols = Array.isArray(pl.groupByCols) ? pl.groupByCols : [];
  const activeUnmappedGb = activeGbCols.filter(c => !(pl.fieldMappings || {})[c] || !String((pl.fieldMappings || {})[c]).trim());
  const showGroupByEmptyError = requiresGroupBy && pl.enabled !== false && activeGbCols.length === 0;
  const showGroupByError = pl.enabled !== false && (showGroupByEmptyError || activeUnmappedGb.length > 0);

  useEffect(() => {
    if (activeTab !== "commande" || pl.enabled === false) return;
    const current = Array.isArray(pl.groupByCols) ? pl.groupByCols.filter(Boolean) : [];
    const withoutSupplier = current.filter(col => !/supplier|fournisseur/i.test(String(col)));
    const next = withoutSupplier.length > 0 ? withoutSupplier : PIPELINE_DEFS.commande.defaultGroupByCols;
    if (next.join("|") !== current.join("|")) setPl({ ...pl, groupByCols: next });
  }, [activeTab, pl, setPl]);

  return (
    <div className={styles.pipelineRoot} data-theme={pipelineTheme}>
      <InfoBox color={INTEGRATION_COLORS.info}>Configurez les pipelines métier — tables, jointures, mapping.</InfoBox>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {["facture", "commande"].map(key => { const def = PIPELINE_DEFS[key], Icon = def.Icon; return (<button key={key} onClick={() => setActiveTab(key)} className={styles.tabButton} data-theme={getPipelineTheme(def.color)} data-selected={activeTab === key}><Icon size={13} /> {def.label}</button>); })}
        {customPipelines.map(cp => (<div key={cp.id} className={styles.customTab} data-theme={getPipelineTheme(cp.color)} data-selected={activeTab === cp.id}><button onClick={() => setActiveTab(cp.id)} className={cx(styles.tabButton, styles.customTabMain)}><Settings2 size={13} /> {cp.label}</button><button onClick={() => removeCustomPipeline(cp.id)} className={styles.customTabRemove}><X size={11} /></button></div>))}
        {!showAddPipeline ? (<button onClick={() => setShowAddPipeline(true)} className={styles.addPipelineButton}><Plus size={12} /> Nouveau pipeline</button>) : (<div className={styles.addPipelineForm}><input value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomPipeline()} autoFocus className={cx("input", styles.pipelineNameInput)} placeholder="Nom du pipeline…" /><button className={cx("btn btn-primary", styles.createPipelineButton)} onClick={addCustomPipeline} disabled={!newPipelineName.trim()}>Créer</button><button onClick={() => setShowAddPipeline(false)} className={styles.iconButtonMuted}><X size={13} /></button></div>)}
      </div>

      {/* Pipeline header */}
      <div className={styles.pipelineHeader}>
        <div className={styles.pipelineIcon}><PlIcon size={16} color={plColor} /></div>
        <div className={styles.grow}><div className={styles.pipelineTitle}>Pipeline {plLabel}</div></div>
        <Toggle checked={pl.enabled !== false} onChange={v => setPl({ ...pl, enabled: v })} />
      </div>

      {pl.enabled !== false && (
        <>
          <SectionAccordion icon={<Database size={13} color={INTEGRATION_COLORS.red} />} title="Tables sources">
            <div className={styles.tableList}>
              {activeTables.length === 0 ? <div className={styles.emptyTables}>Sélectionnez des tables à l'étape Connexion</div> :
                activeTables.map(t => { const sel = pl.tables.includes(t.name); return (<div key={t.name} onClick={() => toggleTable(t.name)} className={styles.tableItem} data-selected={sel}><div className={styles.tableCheck}>{sel && <CheckCircle2 size={10} color="#fff" />}</div><span className={cx("mono", styles.tableName)}>{t.name}</span></div>); })}
            </div>
          </SectionAccordion>

          {/* ── NEW: Visual Join Builder ── */}
          {pl.tables.length > 1 && (
            <SectionAccordion icon={<Link2 size={13} color={INTEGRATION_COLORS.warning} />} title="Jointures (JOIN)" subtitle={`${pl.tables.length} tables — configurez les conditions ON`}>
              <VisualJoinBuilder
                tables={pl.tables}
                joins={pl.joins || []}
                rels={schema?.rels || []}
                onChange={(joins) => setPl({ ...pl, joins })}
              />
            </SectionAccordion>
          )}

          <SectionAccordion icon={<GitBranch size={13} color={plColor} />} title="Mapping des champs">
            <div className={styles.sectionStack}>
              <div className={cx(styles.mappingRow, styles.tenantRow)}>
                <div className={styles.mappingLabelBlock}>
                  <div className={styles.mappingTitle}>Colonne tenant</div>
                  <div className={styles.mappingHint}>multi-tenant : filtre l'import par l'external id</div>
                </div>
                <span className={styles.arrow}>→</span>
                <select value={pl.tenantColumn || ""} onChange={e => setPl({ ...pl, tenantColumn: e.target.value })} className={cx("select", styles.flexSelect)}>
                  <option value="">(aucune — source mono-tenant)</option>
                  {plCols.map(c => <option key={c.full} value={c.full}>{c.full}</option>)}
                </select>
                {pl.tenantColumn && <CheckCircle2 size={14} color={INTEGRATION_COLORS.success} />}
              </div>
              <div className={cx(styles.mappingRow, styles.sourceKeyRow)}>
                <div className={styles.mappingLabelBlock}>
                  <div className={styles.mappingTitle}>Clé source (incrémental)</div>
                  <div className={styles.mappingHint}>PK stable (ex: facture_id) pour le curseur de polling</div>
                </div>
                <span className={styles.arrow}>→</span>
                <select value={pl.sourceKeyColumn || ""} onChange={e => setPl({ ...pl, sourceKeyColumn: e.target.value })} className={cx("select", styles.flexSelect)}>
                  <option value="">(aucune — high-water mark par date)</option>
                  {plCols.map(c => <option key={c.full} value={c.full}>{c.full}</option>)}
                </select>
                {pl.sourceKeyColumn && <CheckCircle2 size={14} color={INTEGRATION_COLORS.success} />}
              </div>
              {fixedFields.length > 0 && (<div className={styles.fieldStack}>{fixedFields.map(f => (<div key={f.key} className={styles.mappingRow}><div className={styles.mappingLabelBlock}><div className={styles.mappingTitle}>{f.label}</div>{f.required && <div className={styles.requiredText}>Requis</div>}</div><span className={styles.arrow}>→</span><select value={(pl.fieldMappings || {})[f.key] || ""} onChange={e => setPl({ ...pl, fieldMappings: { ...(pl.fieldMappings || {}), [f.key]: e.target.value } })} className={cx("select", styles.flexSelect)}><option value="">-- Sélectionner colonne --</option>{plCols.map(c => <option key={c.full} value={c.full}>{c.full}</option>)}</select>{(pl.fieldMappings || {})[f.key] && <CheckCircle2 size={14} color={INTEGRATION_COLORS.success} />}</div>))}</div>)}
              {(fixedFields.length === 0 || builtinDef?.allowExtraFields || !isBuiltin) && (<div className={styles.fieldStack}>
                <div className={styles.extraFieldHeader}><div className={styles.grow}><div className={styles.extraFieldTitle}>{!isBuiltin ? "Champs de regroupement" : "Champs additionnels"}</div><div className={styles.extraFieldHint}>{!isBuiltin ? "Ajoutez uniquement les dimensions qui définissent une série. Le moteur analyse date + montant dans chaque groupe." : "Définissez des champs additionnels puis associez-les aux colonnes sources."}</div></div><button type="button" onClick={addUserField} className={cx("btn btn-ghost", styles.addFieldButton)}><Plus size={12} /> Ajouter un champ</button></div>
                {userFields.length === 0 ? (<div className={styles.emptyCustomFields}>Aucun champ personnalisé. Ajoutez un champ pour configurer un nouveau pipeline métier.</div>) : userFields.map((field) => (<div key={field.id} className={styles.userFieldRow}><input value={field.key} onChange={e => updateUserField(field.id, "key", e.target.value.trim())} className={cx("input mono", styles.userFieldKey)} placeholder="cle_champ" /><input value={field.label} onChange={e => updateUserField(field.id, "label", e.target.value)} className={cx("input", styles.userFieldLabel)} placeholder="Libellé" /><select value={field.type || "text"} onChange={e => updateUserField(field.id, "type", e.target.value)} className={cx("select", styles.userFieldType)}><option value="text">Texte</option><option value="number">Nombre</option><option value="date">Date</option><option value="status">Statut</option><option value="reference">Référence</option></select><label className={styles.requiredToggle}><input type="checkbox" checked={!!field.required} onChange={e => updateUserField(field.id, "required", e.target.checked)} /> Requis</label><select value={(pl.fieldMappings || {})[field.key] || ""} onChange={e => setUserFieldMapping(field, e.target.value)} disabled={!field.key} className={cx("select", styles.userFieldSource)}><option value="">-- Colonne source --</option>{plCols.map(c => <option key={c.full} value={c.full}>{c.full}</option>)}</select><button type="button" onClick={() => removeUserField(field.id)} className={styles.removeFieldButton}><X size={12} /></button></div>))}
              </div>)}
            </div>
          </SectionAccordion>

          {supportsGroupByOverride && (
            <SectionAccordion icon={<Layers size={13} color={plColor} />} title="Regroupement des séries" subtitle={activeTab === "facture" ? "Par défaut: fournisseur + label. Une sélection explicite remplace ce défaut." : "Obligatoire pour commandes et pipelines personnalisés"}>
              <div className={styles.sectionStack}>
                <InfoBox color={showGroupByError ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.info}>
                  {activeTab === "facture"
                    ? "Le pipeline Factures groupe toujours par fournisseur + label. Si vous sélectionnez des champs ici, ils deviennent le groupement explicite et remplacent fournisseur + label."
                    : "Sélectionnez au moins un champ qui définit une série métier. Le moteur détectera les anomalies dans chaque groupe."}
                </InfoBox>
                {groupByOptions.length === 0 ? (
                  <div className={styles.emptyGroupBy}>
                    Aucun champ disponible pour le regroupement. Ajoutez des champs personnalisés pour ce pipeline.
                  </div>
                ) : (
                  <div className={styles.groupByGrid}>
                    {groupByOptions.map(option => {
                      const checked = (pl.groupByCols || []).includes(option.key);
                      const disabled = !option.mapped;
                      return (
                        <label key={option.key} title={disabled ? "Mappez ce champ à une colonne source dans « Mapping des champs » avant de l'utiliser" : ""} className={styles.groupByOption} data-checked={checked} data-disabled={disabled}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleGroupBy(option.key, option.mapped)} />
                          <span className={styles.groupByContent}>
                            <span className={styles.groupByLabel}>{option.label}{disabled && <span className={styles.mapBadge}>à mapper</span>}</span>
                            <span className={cx("mono", styles.groupByMeta)}>{option.key} · {option.source}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {/* Group by any source column (auto-creates the custom field) */}
                <div className={styles.groupBySourceRow}>
                  <select className={cx("select", styles.groupBySourceSelect)} value="" disabled={plCols.length === 0}
                    onChange={e => { addGroupByFromColumn(e.target.value); e.target.value = ""; }}>
                    <option value="">+ Regrouper aussi par une colonne source (ex: centre_code)…</option>
                    {plCols.map(c => <option key={c.full} value={c.full}>{c.full}</option>)}
                  </select>
                  <span className={styles.groupBySourceHint}>
                    Utile quand un même fournisseur émarge sur plusieurs centres budgétaires : combinez fournisseur + label + centre pour des séries distinctes.
                  </span>
                </div>
                {showGroupByError && (
                  <div className={styles.groupByError}>
                    <AlertCircle size={14} /> {activeUnmappedGb.length > 0
                      ? `Le champ de regroupement « ${activeUnmappedGb[0]} » doit être mappé à une colonne source.`
                      : "Le regroupement des séries est obligatoire pour ce pipeline."}
                  </div>
                )}
              </div>
            </SectionAccordion>
          )}

          <SectionAccordion icon={<Clock size={13} color={plColor} />} title="Rythme d'exécution" subtitle="Appliqué automatiquement aux pipelines créés à l'activation des tenants">
            <div className={styles.sectionStack}>
              <div className={styles.scheduleGrid}>
                {[
                  { id: "MANUAL", label: "Manuel", hint: "exécution à la demande" },
                  { id: "CRON", label: "CRON", hint: "planification précise" },
                  { id: "POLLING", label: "Intervalle", hint: "toutes les N minutes" },
                ].map(m => {
                  const selected = (pl.schedule?.mode || "MANUAL") === m.id;
                  return (
                    <button key={m.id} type="button"
                      onClick={() => setPl({ ...pl, schedule: { ...(pl.schedule || {}), mode: m.id } })}
                      className={styles.scheduleButton} data-selected={selected}>
                      <div className={styles.scheduleLabel}>{m.label}</div>
                      <div className={styles.scheduleHint}>{m.hint}</div>
                    </button>
                  );
                })}
              </div>
              {(pl.schedule?.mode === "CRON") && (
                <div>
                  <label className="label">Expression CRON (Spring, 6 champs)</label>
                  <input className={cx("input mono", styles.cronInput)} value={pl.schedule?.cron || ""}
                    onChange={e => setPl({ ...pl, schedule: { ...(pl.schedule || {}), cron: e.target.value } })}
                    placeholder="0 0 2 * * *" />
                  <div className={styles.cronHint}>ex: «0 0 2 * * *» = chaque jour à 02:00 · «0 0 6 * * MON» = lundi 06:00</div>
                </div>
              )}
              {(pl.schedule?.mode === "POLLING") && (
                <div>
                  <label className="label">Intervalle (minutes)</label>
                  <input className={cx("input mono", styles.intervalInput)} type="number" min="1"
                    value={pl.schedule?.intervalMinutes || ""}
                    onChange={e => setPl({ ...pl, schedule: { ...(pl.schedule || {}), intervalMinutes: parseInt(e.target.value, 10) || null } })}
                    placeholder="60" />
                </div>
              )}
              {(!pl.schedule?.mode || pl.schedule?.mode === "MANUAL") && (
                <div className={styles.manualHint}>Les pipelines créés depuis ce template ne s'exécuteront que manuellement (bouton Run / import).</div>
              )}
            </div>
          </SectionAccordion>
        </>
      )}
    </div>
  );
}
