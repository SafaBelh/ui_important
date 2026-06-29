/**
 * "Détail Budget" wizard step: allocation source, axes, pointers,
 * and the live preview. Self-contained (its own sub-components + helpers);
 * extracted from IntegrationsView so the view holds the wizard shell, not this feature.
 */
import { memo, useState, useEffect } from "react";
import { Database, AlertCircle, AlertTriangle, Calculator, Check, ChevronRight, FlaskConical, Hash, RefreshCw, Wand2 } from "lucide-react";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { toConnectorApiPayload } from "@/features/integrations/api/connectorApi";
import { previewConnectorBudget, previewConnectorTable } from "@/features/integrations/api/IntegrationAdminApi";
import { InfoBox } from "@/features/integrations/components/WizardUiPrimitives";
import { BUDGET_DATE_MODES, BUDGET_KIND_META, BUDGET_POINTER_OPTIONS, BUDGET_STATUS_META, BUDGET_TARGET_MODES, DEFAULT_BUDGET_POINTERS, budgetTargetDate, deterministicBudgetTemplate, fmtBudget, migrateLegacyBudget, suggestBudgetTemplate } from "@/features/integrations/model/budgetStepModel";
import { logError } from "@/shared/utils/logError";
import styles from "./BudgetStep.module.css";

const BudgetCard = memo(function BudgetCard({ icon, title, subtitle, right, children }) {
  return (
    <div className="budget-section">
      <div className={`budget-section-hdr ${styles.sectionHeaderStatic}`}>
        <div className={styles.cardIcon}>{icon}</div>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardTitle}>{title}</div>
          {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="budget-section-body">{children}</div>
    </div>
  );
});

function BudgetSelect({ label, value, onChange, options, placeholder = "Sélectionner…", required, disabled }) {
  return (
    <div className={styles.selectWrap}>
      {label && <label className={`label ${styles.labelInline}`}>{label}{required && <span className={styles.requiredMark}>*</span>}</label>}
      <select className={`input mono ${styles.selectInput} ${required && !value ? styles.selectRequiredEmpty : ""}`} disabled={disabled} value={value || ""} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
      </select>
    </div>
  );
}

const BudgetPreviewTable = memo(function BudgetPreviewTable({ result, expandedRow, setExpandedRow }) {
  const rows = result.rows || [];
  if (rows.length === 0) {
    return <div className={styles.emptyPreview}>Aucune ligne budgétaire trouvée pour {result.fiscalYear}.</div>;
  }
  return (
    <div className={styles.previewTableShell}>
      <div className={`scroll ${styles.tableScroll}`}>
        <table className={styles.previewTable}>
          <thead>
            <tr className={styles.previewHeadRow}>
              {["Détail budget", "Alloué", "Consommé", "Restant", "Taux", "Projeté", "Seuil", "Statut"].map(h => (
                <th key={h} className={`${styles.headCell} ${h === "Détail budget" ? styles.headCellLeft : styles.headCellRight}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = BUDGET_STATUS_META[r.status] || BUDGET_STATUS_META.ok;
              const expanded = expandedRow === i;
              const detailKinds = Object.keys(r.details || {});
              const statusClass = r.status === "critical" || r.status === "over" ? styles.statusDanger : r.status === "warning" || r.status === "risk" ? styles.statusWarn : r.status === "info" ? styles.statusInfo : styles.statusOk;
              return (
                <FragmentRow key={i}>
                  <tr onClick={() => detailKinds.length && setExpandedRow(expanded ? null : i)} className={`${styles.previewRow} ${detailKinds.length ? styles.previewRowExpandable : ""} ${expanded ? styles.previewRowExpanded : ""}`}>
                    <td className={styles.cell}>
                      <div className={styles.axisCellInner}>
                        {detailKinds.length > 0 && <ChevronRight size={11} color={INTEGRATION_COLORS.g400} className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`} />}
                        <div>
                          <div className={`mono ${styles.axisKey}`}>{r.axisKey}</div>
                          {r.label && <div className={styles.axisLabel}>{r.label}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={`mono ${styles.cellRight} ${styles.allocatedCell}`}>{fmtBudget(r.budgetAllocated)}</td>
                    <td className={`mono ${styles.cellRight} ${styles.consumedCell}`}>
                      {fmtBudget(r.consumedToDate)}
                      {(r.engage != null || r.factureEnCours != null || r.liquide != null) && (r.engage > 0 || r.factureEnCours > 0 || r.liquide > 0) && (
                        <div className={styles.detailLine}>E {fmtBudget(r.engage)} · FEC {fmtBudget(r.factureEnCours)} · L {fmtBudget(r.liquide)}</div>
                      )}
                    </td>
                    <td className={`mono ${styles.cellRight} ${r.remaining < 0 ? styles.remainingNegative : styles.remainingPositive}`}>
                      {fmtBudget(r.remaining)}
                      <div className={styles.detailLine}>Disp. proj. {fmtBudget(r.disponibleProjete)}</div>
                    </td>
                    <td className={`${styles.cellRightMin} ${statusClass}`}>
                      <div className={styles.rateWrap}>
                        <progress className={styles.rateProgress} value={Math.min(100, r.consumptionRate || 0)} max="100" aria-label="Taux de consommation" />
                        <span className={`mono ${styles.rateText}`}>{Math.round(r.consumptionRate || 0)}%</span>
                      </div>
                    </td>
                    <td className={`mono ${styles.cellRight} ${styles.projectedCell}`}>
                      {fmtBudget(r.projectedAtTargetDate)}
                      <span title={r.seasonality === "series" ? "Saisonnalité des séries pipeline" : r.seasonality === "history" ? "Historique mensuel N-1" : "Extrapolation linéaire"} className={styles.seasonalityMark}>
                        {r.seasonality === "series" ? "◆" : r.seasonality === "history" ? "◇" : "—"}
                      </span>
                    </td>
                    <td className={`mono ${styles.cellRight} ${styles.thresholdCell} ${r.estimatedThresholdReachDate ? styles.thresholdWarn : ""}`} title="Date estimée d'atteinte du budget alloué">
                      {r.estimatedThresholdReachDate || "—"}
                    </td>
                    <td className={styles.cellRight}>
                      <span className={`${styles.statusBadge} ${statusClass}`}>{st.label}</span>
                    </td>
                  </tr>
                  {expanded && detailKinds.map(kind => (
                    <tr key={kind} className={styles.detailRow}>
                      <td colSpan={8} className={styles.detailCell}>
                        <div className={`${styles.detailTitle} ${kind === "COMMANDE" ? styles.kindDetailCommande : kind === "FACTURE" ? styles.kindDetailFacture : styles.detailTitleMuted}`}>
                          {BUDGET_KIND_META[kind]?.label || kind} · consommation rattachée ({fmtBudget(r.consumedByKind?.[kind])})
                        </div>
                        <div className={styles.detailChipRow}>
                          {(r.details[kind] || []).map((d, di) => (
                            <span key={di} className={`mono ${styles.detailChip}`}>
                              {String(d.date).slice(0, 10)} · {fmtBudget(d.amount)}{d.supplier ? ` · ${d.supplier}` : ""}{d.id ? ` · ${d.id}` : ""}{d.status ? ` · ${d.status}` : ""}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expanded && (r.topSuppliers || []).length > 0 && (
                    <tr className={styles.detailRow}>
                      <td colSpan={8} className={styles.supplierDetailCell}>
                        <div className={`${styles.detailTitle} ${styles.detailTitleMuted}`}>Responsabilité fournisseurs</div>
                        <div className={styles.detailChipRow}>
                          {r.topSuppliers.map((s, si) => (
                            <span key={si} className={`mono ${styles.detailChip} ${styles.supplierChip}`}>
                              {s.supplier} · {Math.round(s.sharePct)}% · E {fmtBudget(s.engage)} · FEC {fmtBudget(s.factureEnCours)} · L {fmtBudget(s.liquide)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function FragmentRow({ children }) { return <>{children}</>; }

export function BudgetStep({ data, setData, schema }) {
  const tables = schema?.tables || [];
  const tpl = deterministicBudgetTemplate(data.budgetTemplate || migrateLegacyBudget(data));
  const setTpl = patch => setData({ ...data, budgetTemplate: deterministicBudgetTemplate({ ...tpl, ...patch }) });
  useEffect(() => {
    const raw = data.budgetTemplate;
    if (!raw || (raw.consumptionSources || []).length > 0 || raw.formula?.mode === "CUSTOM" || (raw.formula?.tokens || []).length > 0 || raw.formula?.includeCommandes != null) {
      setData(d => ({ ...d, budgetTemplate: deterministicBudgetTemplate(d.budgetTemplate || migrateLegacyBudget(d)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colsOf = name => {
    const t = tables.find(x => x.name === name);
    return (t?.cols || []).map(c => (typeof c === "string" ? c : c.name));
  };

  const src = tpl.budgetSource || {};
  const setSrc = patch => setTpl({ budgetSource: { ...src, ...patch } });
  const budgetCols = colsOf(src.table);
  const byAxes = tpl.mode !== "GLOBAL";
  const axes = byAxes ? (tpl.axes || []) : [];
  const pointerIds = tpl.previewSettings?.sampleAxes?.length ? tpl.previewSettings.sampleAxes : DEFAULT_BUDGET_POINTERS;
  const setPointerIds = ids => setTpl({ previewSettings: { ...(tpl.previewSettings || {}), sampleAxes: ids } });
  const togglePointer = id => setPointerIds(pointerIds.includes(id) ? pointerIds.filter(item => item !== id) : [...pointerIds, id]);

  const toggleAxis = col => {
    const exists = (tpl.axes || []).find(a => a.budgetColumn === col);
    const nextAxes = exists ? tpl.axes.filter(a => a.budgetColumn !== col) : [...(tpl.axes || []), { key: col, label: col, budgetColumn: col, type: "string" }];
    setTpl({ axes: nextAxes });
  };
  const setAxisLabel = (key, label) => setTpl({ axes: (tpl.axes || []).map(a => a.key === key ? { ...a, label } : a) });

  // Sample key preview from real data (saved connectors only)
  const [sampleKey, setSampleKey] = useState(null);
  const axisColsKey = axes.map(a => a.budgetColumn).join(",");
  useEffect(() => {
    if (!data.id || !src.table || axes.length === 0) { setSampleKey(null); return; }
    let live = true;
    previewConnectorTable(data.id, { table: src.table, limit: 3 })
      .then(res => {
        if (!live) return;
        const row = (res?.sample || [])[0];
        if (row) setSampleKey(axes.map(a => row[a.budgetColumn] ?? "—").join(" · "));
      })
      .catch((error) => logError("integrations.budgetSampleKey", error));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, src.table, axisColsKey]);

  // Validation
  const errors = [];
  if (!src.table) errors.push("Sélectionnez la table budget.");
  if (src.table && !src.allocatedAmountColumn) errors.push("Sélectionnez la colonne du budget alloué.");
  if (src.dateMode === "YEAR_COLUMN" && !src.yearColumn) errors.push("Sélectionnez la colonne année.");
  if (src.dateMode === "START_END_COLUMNS" && (!src.startDateColumn || !src.endDateColumn)) errors.push("Sélectionnez les colonnes début et fin.");
  if (src.dateMode === "DATE_COLUMN" && !src.dateColumn) errors.push("Sélectionnez la colonne date.");
  if ((src.fiscalSourceMode || "MANUAL") === "ERP_MAPPED" && (!src.fiscalTable || !src.fiscalStartColumn || !src.fiscalEndColumn)) errors.push("Exercice ERP : sélectionnez la table et les colonnes début/fin (ou repassez en Manuel).");
  if (byAxes && axes.length === 0) errors.push("Sélectionnez au moins un axe budgétaire (ou passez en budget global).");
  const ready = errors.length === 0;

  // Preview
  const [targetMode, setTargetMode] = useState(tpl.forecast?.defaultTargetDateMode || "END_OF_YEAR");
  const [customDate, setCustomDate] = useState("");
  const [previewState, setPreviewState] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  // Multi-tenant ERP: preview one tenant's groups/pointers by its external id
  // (passed to the backend so allocations/consumption are scoped, not mixed).
  const [previewExternalId, setPreviewExternalId] = useState("");
  const runPreview = async () => {
    setPreviewState({ loading: true });
    setExpandedRow(null);
    // END_OF_YEAR is resolved server-side as the FISCAL year end (which may
    // be e.g. March 31 when the exercise starts in April).
    const targetDate = targetMode === "END_OF_YEAR" ? null : budgetTargetDate(targetMode, customDate);
    const params = new URLSearchParams();
    if (targetDate) params.set("targetDate", targetDate);
    if (previewExternalId.trim()) params.set("externalTenantId", previewExternalId.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    const body = deterministicBudgetTemplate({ ...tpl, enabled: true, forecast: { ...tpl.forecast, defaultTargetDateMode: targetMode === "CUSTOM" ? "CUSTOM" : targetMode } });
    try {
      const res = data.id
        ? await previewConnectorBudget(data.id, qs, body)
        : await previewConnectorBudget(null, qs, { ...toConnectorApiPayload(data), budgetTemplate: body });
      if (res?.status !== "ok") throw new Error(res?.message || "Aperçu impossible");
      setPreviewState({ result: res });
    } catch (err) {
      setPreviewState({ error: err.message || "Aperçu impossible" });
    }
  };
  const result = previewState?.result;

  return (
    <div className={styles.stepStack}>
      <div className={styles.topRow}>
        <InfoBox color={INTEGRATION_COLORS.success}><strong>Détail Budget</strong> — le wizard ne capture que l'allocation ; engagé, liquidé et facture en cours viennent des Documents.</InfoBox>
        <button type="button" className={`btn btn-ghost ${styles.suggestButton}`} onClick={() => { const s = suggestBudgetTemplate(tables); if (s) setData({ ...data, budgetTemplate: deterministicBudgetTemplate(s) }); }}>
          <Wand2 size={12} /> Suggestion auto
        </button>
      </div>

      <BudgetCard icon={<Database size={13} color={INTEGRATION_COLORS.success} />} title="1. Allocation source" subtitle="Table, montant alloué, période et colonnes d'axes">
        <div className={styles.sectionStack}>
          <div className={styles.formRow}>
            <BudgetSelect label="Table budget" required value={src.table} options={tables.map(t => t.name)} onChange={v => setTpl({ budgetSource: { ...src, table: v, allocatedAmountColumn: "", yearColumn: "", startDateColumn: "", endDateColumn: "", dateColumn: "", currencyColumn: "", labelColumn: "" }, axes: [] })} />
            <BudgetSelect label="Budget alloué" required disabled={!src.table} value={src.allocatedAmountColumn} options={budgetCols} onChange={v => setSrc({ allocatedAmountColumn: v })} />
            <BudgetSelect label="Colonne tenant" disabled={!src.table} value={src.tenantColumn} options={budgetCols} placeholder="(multi-tenant : filtre par external id)" onChange={v => setSrc({ tenantColumn: v })} />
          </div>
          <div>
            <label className={`label ${styles.labelSpaced}`}>Période du budget</label>
            <div className={styles.pillRow}>
              {BUDGET_DATE_MODES.map(m => (
                <button key={m.id} type="button" onClick={() => setSrc({ dateMode: m.id })} className={`${styles.optionButton} ${src.dateMode === m.id ? styles.optionButtonActive : ""}`}>
                  <div className={`${styles.optionTitle} ${src.dateMode === m.id ? styles.optionTitleActive : ""}`}>{m.label}</div>
                  <div className={styles.optionHint}>{m.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.formRow}>
            {src.dateMode === "YEAR_COLUMN" && <BudgetSelect label="Colonne année" required value={src.yearColumn} options={budgetCols} onChange={v => setSrc({ yearColumn: v })} />}
            {src.dateMode === "START_END_COLUMNS" && (<>
              <BudgetSelect label="Début" required value={src.startDateColumn} options={budgetCols} onChange={v => setSrc({ startDateColumn: v })} />
              <BudgetSelect label="Fin" required value={src.endDateColumn} options={budgetCols} onChange={v => setSrc({ endDateColumn: v })} />
            </>)}
            {src.dateMode === "DATE_COLUMN" && <BudgetSelect label="Colonne date" required value={src.dateColumn} options={budgetCols} onChange={v => setSrc({ dateColumn: v })} />}
            <BudgetSelect label="Libellé" value={src.labelColumn} options={budgetCols} placeholder="(optionnel)" disabled={!src.table} onChange={v => setSrc({ labelColumn: v })} />
            <BudgetSelect label="Devise" value={src.currencyColumn} options={budgetCols} placeholder="(optionnel)" disabled={!src.table} onChange={v => setSrc({ currencyColumn: v })} />
          </div>

          {/* Fiscal year: manual month OR mapped from the ERP per tenant */}
          <div className={styles.fiscalBox}>
            <div className={styles.fiscalHeader}>
              <span className={styles.subSectionTitle}>Exercice fiscal</span>
              {[{ id: "MANUAL", label: "Manuel" }, { id: "ERP_MAPPED", label: "Mappé ERP" }].map(m => {
                const on = (src.fiscalSourceMode || "MANUAL") === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => setSrc({ fiscalSourceMode: m.id })}
                    className={`${styles.optionButton} ${styles.optionButtonCompact} ${on ? styles.optionButtonActive : ""}`}>
                    {m.label}
                  </button>
                );
              })}
            </div>
            {(src.fiscalSourceMode || "MANUAL") !== "ERP_MAPPED" ? (
              <div className={styles.formRow}>
                <div className={styles.fieldLimited}>
                  <label className="label">Début d'exercice</label>
                  <select className={`input ${styles.fullSelect}`} value={src.fiscalYearStartMonth || 1} onChange={e => setSrc({ fiscalYearStartMonth: parseInt(e.target.value, 10) })}>
                    {["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"].map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}{i === 0 ? " (année civile)" : ` → ${["Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre"][i]}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className={styles.editorStack}>
                <div className={styles.formRow}>
                  <BudgetSelect label="Table des exercices" required value={src.fiscalTable} options={tables.map(t => t.name)} onChange={v => setSrc({ fiscalTable: v, fiscalStartColumn: "", fiscalEndColumn: "", fiscalTenantColumn: "" })} />
                  <BudgetSelect label="Colonne début" required disabled={!src.fiscalTable} value={src.fiscalStartColumn} options={colsOf(src.fiscalTable)} onChange={v => setSrc({ fiscalStartColumn: v })} />
                  <BudgetSelect label="Colonne fin" required disabled={!src.fiscalTable} value={src.fiscalEndColumn} options={colsOf(src.fiscalTable)} onChange={v => setSrc({ fiscalEndColumn: v })} />
                  <BudgetSelect label="Colonne tenant" disabled={!src.fiscalTable} value={src.fiscalTenantColumn} options={colsOf(src.fiscalTable)} placeholder="(optionnel)" onChange={v => setSrc({ fiscalTenantColumn: v })} />
                </div>
                <div className={styles.helpText}>
                  L'exercice (début + fin) est lu dans l'ERP pour l'identifiant tenant externe lié ; repli automatique sur le mois de début manuel s'il est introuvable.
                </div>
              </div>
            )}
          </div>
        </div>
      </BudgetCard>

      <BudgetCard icon={<Hash size={13} color={INTEGRATION_COLORS.success} />} title="2. Axes / grouping" subtitle="Choisissez centre, article ou toute colonne qui identifie une ligne budgétaire"
        right={sampleKey && <span className={`mono ${styles.sampleKey}`}>ex: {sampleKey}</span>}>
        <div className={styles.sectionStack}>
          <div className={styles.modeGrid}>
            {[{ id: "BY_AXES", label: "Budget par axes", hint: "centre / article / pointeur" }, { id: "GLOBAL", label: "Budget global", hint: "une enveloppe unique" }].map(m => (
              <div key={m.id} onClick={() => setTpl({ mode: m.id })} className={`${styles.modeCard} ${tpl.mode === m.id ? styles.modeCardActive : ""}`}>
                <div className={`${styles.modeTitle} ${tpl.mode === m.id ? styles.modeTitleActive : ""}`}>{m.label}</div>
                <div className={styles.modeHint}>{m.hint}</div>
              </div>
            ))}
          </div>
          {!byAxes ? (
            <div className={styles.emptyMessage}>Budget global sélectionné : aucune colonne d'axe requise.</div>
          ) : !src.table ? (
            <div className={styles.emptyMessage}>Sélectionnez d'abord la table budget.</div>
          ) : (
            <>
              <div className={styles.axisChipRow}>
                {budgetCols.filter(c => c !== src.allocatedAmountColumn).map(col => {
                  const selected = axes.some(a => a.budgetColumn === col);
                  return (
                    <button key={col} type="button" className={`col-chip ${selected ? styles.axisChipSelected : ""}`} onClick={() => toggleAxis(col)}>
                      {selected && <Check size={9} className={styles.checkOffset} />}{col}
                    </button>
                  );
                })}
              </div>
              {axes.length > 0 && (
                <div className={styles.axisLabelStack}>
                  <div className={styles.subSectionTitle}>Libellés des axes</div>
                  {axes.map(ax => (
                    <div key={ax.key} className={styles.axisLabelRow}>
                      <span className={`mono ${styles.axisColumnName}`}>{ax.budgetColumn}</span>
                      <input className={`input ${styles.axisLabelInput}`} value={ax.label || ""} placeholder={ax.key} onChange={e => setAxisLabel(ax.key, e.target.value)} />
                    </div>
                  ))}
                  <div className={styles.keyPreview}>Clé de détail : <span className={`mono ${styles.keyPreviewValue}`}>{axes.map(a => a.label || a.key).join(" · ")}</span></div>
                </div>
              )}
            </>
          )}
        </div>
      </BudgetCard>

      <BudgetCard icon={<Calculator size={13} color={INTEGRATION_COLORS.success} />} title="3. Pointers" subtitle="KPI affichés par le budget ; les montants viennent du moteur Documents">
        <div className={styles.sectionStack}>
          <div className={styles.helpText}>Formules fixes : restant = alloué - liquidé ; disponible projeté = restant - engagé - facture en cours.</div>
          <div className={styles.pillRow}>
            {BUDGET_POINTER_OPTIONS.map(pointer => {
              const selected = pointerIds.includes(pointer.id);
              return (
                <button key={pointer.id} type="button" onClick={() => togglePointer(pointer.id)} className={`${styles.optionButton} ${selected ? styles.optionButtonActive : ""}`}>
                  <div className={`${styles.optionTitle} ${selected ? styles.optionTitleActive : ""}`}>{pointer.label}</div>
                  <div className={styles.optionHint}>{pointer.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      </BudgetCard>

      {/* Validation */}
      {errors.length > 0 && (
        <div className={styles.validationBox}>
          <div className={styles.validationTitle}><AlertTriangle size={12} /> À compléter avant l'aperçu</div>
          {errors.slice(0, 5).map((e, i) => <div key={i} className={styles.validationItem}>• {e}</div>)}
          {errors.length > 5 && <div className={styles.validationItem}>… et {errors.length - 5} autre(s)</div>}
        </div>
      )}

      <BudgetCard icon={<FlaskConical size={13} color={INTEGRATION_COLORS.success} />} title="Live preview" subtitle="Consommation dérivée des Documents : liquidé, facture en cours, engagé">
        <div className={styles.sectionStack}>
          <div className={styles.previewControls}>
            {BUDGET_TARGET_MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setTargetMode(m.id)} className={`${styles.targetButton} ${targetMode === m.id ? styles.targetButtonActive : ""}`}>{m.label}</button>
            ))}
            {targetMode === "CUSTOM" && <input type="date" className={`input ${styles.dateInput}`} value={customDate} onChange={e => setCustomDate(e.target.value)} />}
            <input className={`input ${styles.tenantPreviewInput}`} placeholder="Aperçu tenant (external id)" value={previewExternalId} onChange={e => setPreviewExternalId(e.target.value)} title="Multi-tenant : prévisualiser les données d'un seul tenant via son identifiant ERP externe. Laisser vide = premier tenant actif." />
            <div className={styles.spacer} />
            <button type="button" className={`btn btn-primary ${!ready ? styles.runPreviewButtonDisabled : ""}`} disabled={!ready || previewState?.loading} onClick={runPreview}>
              {previewState?.loading ? <RefreshCw size={13} className="spin" /> : <FlaskConical size={13} />} Lancer l'aperçu
            </button>
          </div>
          {previewState?.error && (
            <div className={styles.previewError}><AlertCircle size={13} /> {previewState.error}</div>
          )}
          {result && (
            <>
              <div className={styles.totalsGrid}>
                {[
                  { label: "Alloué", val: result.totals?.allocated, tone: styles.totalDefault },
                  { label: "Liquidé", val: result.totals?.liquide, tone: styles.totalInfo },
                  { label: "Facture en cours", val: result.totals?.factureEnCours, tone: styles.totalWarn },
                  { label: "Engagé", val: result.totals?.engage, tone: styles.totalInfo },
                  { label: `Projeté au ${result.targetDate}`, val: result.totals?.projectedAtTargetDate, tone: styles.totalWarn },
                  { label: "Restant", val: result.totals?.remaining, tone: (result.totals?.remaining ?? 0) < 0 ? styles.totalDanger : styles.totalSuccess },
                  { label: "Disponible projeté", val: result.totals?.disponibleProjete, tone: (result.totals?.disponibleProjete ?? 0) < 0 ? styles.totalDanger : styles.totalSuccess },
                ].map(k => (
                  <div key={k.label} className={styles.totalCard}>
                    <div className={styles.totalLabel}>{k.label}</div>
                    <div className={`mono ${styles.totalValue} ${k.tone}`}>{fmtBudget(k.val)}</div>
                  </div>
                ))}
              </div>
              <BudgetPreviewTable result={result} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
              {(result.warnings || []).length > 0 && (
                <div className={styles.warningList}>
                  {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}
              <div className={styles.legendText}>
                ◆ saisonnalité séries pipeline · ◇ historique mensuel · — extrapolation linéaire · Exercice {result.fiscalYear} ({result.periodStart} → {result.periodEnd})
                {(result.ignoredYears || []).length > 0 && <span className={styles.warningInline}> · Années exclues : {result.ignoredYears.join(", ")}</span>}
                {(() => { const ys = [...new Set((result.rows || []).flatMap(r => r.historicalYearsUsed || []))].sort(); return ys.length > 0 ? ` · Historique utilisé : ${ys.join(", ")}` : ""; })()}
              </div>
            </>
          )}
        </div>
      </BudgetCard>
      <div className={styles.footerNote}>La configuration est sauvegardée avec le connecteur (étape Résumé) et survit au rechargement.</div>
    </div>
  );
}
