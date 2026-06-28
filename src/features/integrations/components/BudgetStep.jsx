/**
 * "Détail Budget" wizard step: budget source/formula configuration, consumption
 * mapping, and the live preview. Self-contained (its own sub-components + helpers);
 * extracted from IntegrationsView so the view holds the wizard shell, not this feature.
 */
import { memo, useState, useEffect } from "react";
import { Database, AlertCircle, AlertTriangle, ArrowRight, Calculator, Check, ChevronRight, Clock, FlaskConical, Hash, Plus, RefreshCw, TrendingUp, Wand2, X } from "lucide-react";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { toConnectorApiPayload } from "@/features/integrations/api/connectorApi";
import { previewConnectorBudget, previewConnectorTable } from "@/features/integrations/api/IntegrationAdminApi";
import { InfoBox } from "@/features/integrations/components/WizardUiPrimitives";
import { BUDGET_DATE_MODES, BUDGET_KIND_META, BUDGET_STATUS_META, BUDGET_TARGET_MODES, budgetTargetDate, defaultBudgetTemplate, fmtBudget, migrateLegacyBudget, suggestBudgetTemplate } from "@/features/integrations/model/budgetStepModel";
import { logError } from "@/shared/utils/logError";
import styles from "./BudgetStep.module.css";

const kindClass = (kind) => kind === "COMMANDE" ? styles.kindCommande : styles.kindFacture;

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

function BudgetStatusChips({ values = [], onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim().toUpperCase();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };
  return (
    <div>
      <div className={`${styles.chipRow} ${values.length ? styles.chipRowWithValues : ""}`}>
        {values.map(v => (
          <span key={v} className={`formula-node col ${styles.statusChip}`} onClick={() => onChange(values.filter(x => x !== v))}>{v}<X size={9} /></span>
        ))}
      </div>
      <input className={`input mono ${styles.smallInput}`} value={input} placeholder={placeholder}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add} />
    </div>
  );
}

function IgnoredYearsEditor({ forecast, onChange }) {
  const [year, setYear] = useState("");
  const [reason, setReason] = useState("");
  const years = forecast.ignoredYears || [];
  const notes = forecast.ignoredYearNotes || {};
  const add = () => {
    const y = parseInt(year, 10);
    if (!y || y < 1990 || y > 2100 || years.includes(y)) return;
    onChange({
      ignoredYears: [...years, y].sort(),
      ignoredYearNotes: reason.trim() ? { ...notes, [String(y)]: reason.trim() } : notes,
    });
    setYear("");
    setReason("");
  };
  const remove = (y) => {
    const nextNotes = { ...notes };
    delete nextNotes[String(y)];
    onChange({ ignoredYears: years.filter(x => x !== y), ignoredYearNotes: nextNotes });
  };
  return (
    <div className={styles.editorStack}>
      <div className={styles.editorRow}>
        <input className={`input mono ${styles.yearInput}`} type="number" placeholder="ex: 2022" value={year} onChange={e => setYear(e.target.value)} />
        <input className={`input ${styles.reasonInput}`} placeholder="Raison (ex: rénovation infrastructure)" value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button type="button" className={`btn btn-ghost ${styles.smallGhostButton}`} onClick={add} disabled={!year}><Plus size={12} /> Exclure</button>
      </div>
      {years.length === 0 ? (
        <div className={styles.mutedText}>Aucune année exclue — toutes les années historiques alimentent les prévisions.</div>
      ) : (
        <div className={styles.yearChipRow}>
          {years.map(y => (
            <span key={y} className={`formula-node op ${styles.statusChip}`} title={notes[String(y)] || ""} onClick={() => remove(y)}>
              {y}{notes[String(y)] ? ` — ${notes[String(y)]}` : ""}<X size={9} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetConsumptionCard({ source, axes, byAxes, tables, colsOf, onChange }) {
  const meta = BUDGET_KIND_META[source.kind];
  const cols = colsOf(source.table);
  const mappingOptions = [
    ...cols.map(c => ({ value: c, label: c })),
    ...(source.joins || []).filter(j => j.table).flatMap(j => colsOf(j.table).map(c => ({ value: `${j.table}.${c}`, label: `${j.table}.${c}` }))),
  ];
  const setJoin = (idx, patch) => onChange({ joins: (source.joins || []).map((j, i) => i === idx ? { ...j, ...patch } : j) });
  return (
    <div className={`${styles.sourceCard} ${kindClass(source.kind)} ${source.enabled ? styles.sourceEnabled : styles.sourceDisabled}`}>
      <div className={styles.sourceHeader} onClick={() => onChange({ enabled: !source.enabled })}>
        <div className={styles.sourceIcon}>
          <meta.Icon size={12} />
        </div>
        <div className={styles.sourceText}>
          <div className={styles.sourceTitle}>Consommation {meta.label.toLowerCase()}</div>
          <div className={styles.sourceSubtitle}>{source.enabled ? (source.table || "table à sélectionner") : "désactivée"}</div>
        </div>
        <div className={`${styles.switchTrack} ${source.enabled ? "" : styles.switchTrackOff}`}>
          <div className={`${styles.switchKnob} ${source.enabled ? styles.switchOn : styles.switchOff}`} />
        </div>
      </div>
      {source.enabled && (
        <div className={styles.sourceBody}>
          <div className={styles.formRow}>
            <BudgetSelect label="Table" required value={source.table} options={tables.map(t => t.name)} onChange={v => onChange({ table: v, amountColumn: "", dateColumn: "", statusColumn: "", axisMappings: {} })} />
            <BudgetSelect label="Montant" required disabled={!source.table} value={source.amountColumn} options={cols} onChange={v => onChange({ amountColumn: v })} />
            <BudgetSelect label="Date" required disabled={!source.table} value={source.dateColumn} options={cols} onChange={v => onChange({ dateColumn: v })} />
          </div>
          <div className={styles.formRowEnd}>
            <BudgetSelect label="Statut" disabled={!source.table} value={source.statusColumn} options={cols} placeholder="(optionnel)" onChange={v => onChange({ statusColumn: v })} />
            <div className={styles.wideField}>
              <label className="label">Statuts comptabilisés</label>
              <BudgetStatusChips values={source.finalStatuses || []} placeholder="ex: LIVRE ⏎" onChange={v => onChange({ finalStatuses: v })} />
            </div>
          </div>
          <div className={styles.formRow}>
            <BudgetSelect label="Fournisseur" disabled={!source.table} value={source.supplierColumn} options={mappingOptions.map(o => o.value)} placeholder="(optionnel — responsabilité fournisseur)" onChange={v => onChange({ supplierColumn: v })} />
            <BudgetSelect label="Identifiant (n° doc)" disabled={!source.table} value={source.idColumn} options={mappingOptions.map(o => o.value)} placeholder="(optionnel — drill-down)" onChange={v => onChange({ idColumn: v })} />
            <BudgetSelect label="Colonne tenant" disabled={!source.table} value={source.tenantColumn} options={mappingOptions.map(o => o.value)} placeholder="(multi-tenant : filtre par external id)" onChange={v => onChange({ tenantColumn: v })} />
          </div>
          {source.kind === "COMMANDE" && (
            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Anti double comptage — commandes liquidées</div>
              <div className={styles.subSectionHint}>
                Une commande liée à une facture comptabilisée est exclue de l'engagé : son montant est porté par la facture (liquidé).
              </div>
              <div className={styles.formRow}>
                <BudgetSelect label="Table de liquidation" disabled={!source.table} value={source.settlementTable} options={tables.filter(t => t.name !== source.table).map(t => t.name)} placeholder="(désactivé)" onChange={v => onChange({ settlementTable: v, settlementLinkColumn: "", settlementStatusColumn: "", settlementFinalStatuses: v ? source.settlementFinalStatuses : [] })} />
                <BudgetSelect label={`Lien (${source.settlementTable || "liquidation"}.col)`} required={!!source.settlementTable} disabled={!source.settlementTable} value={source.settlementLinkColumn} options={colsOf(source.settlementTable)} onChange={v => onChange({ settlementLinkColumn: v })} />
                <BudgetSelect label={`Identifiant (${source.table || "source"}.col)`} required={!!source.settlementTable} disabled={!source.settlementTable} value={source.sourceKeyColumn} options={cols} onChange={v => onChange({ sourceKeyColumn: v })} />
              </div>
              {source.settlementTable && (
                <div className={styles.formRowEnd}>
                  <BudgetSelect label="Statut liquidation" value={source.settlementStatusColumn} options={colsOf(source.settlementTable)} placeholder="(optionnel)" onChange={v => onChange({ settlementStatusColumn: v })} />
                  <div className={styles.wideField}>
                    <label className="label">Statuts liquidants</label>
                    <BudgetStatusChips values={source.settlementFinalStatuses || []} placeholder="ex: COMPTABILISE_CMD ⏎" onChange={v => onChange({ settlementFinalStatuses: v })} />
                  </div>
                </div>
              )}
            </div>
          )}
          {byAxes && axes.length > 0 && (
            <div>
              <div className={styles.axisTitle}>Correspondance des axes</div>
              <div className={styles.axisList}>
                {axes.map(ax => {
                  const mapped = source.axisMappings?.[ax.key];
                  return (
                    <div key={ax.key} className={styles.axisRow}>
                      <span className={`formula-node col ${styles.axisBadge}`}>{ax.label || ax.key}</span>
                      <ArrowRight size={11} color={mapped ? INTEGRATION_COLORS.success : INTEGRATION_COLORS.g300} className={styles.arrowIcon} />
                      <select className={`input mono ${styles.axisSelect} ${mapped ? "" : styles.axisSelectMissing}`} value={mapped || ""}
                        onChange={e => onChange({ axisMappings: { ...source.axisMappings, [ax.key]: e.target.value } })}>
                        <option value="">Mapper vers…</option>
                        {mappingOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className={styles.joinHeader}>
              <span className={styles.subSectionTitle}>Jointures (si un axe vit dans une autre table)</span>
              <button type="button" className={`btn btn-ghost ${styles.joinButton}`} onClick={() => onChange({ joins: [...(source.joins || []), { table: "", sourceColumn: "", targetColumn: "", type: "LEFT" }] })}><Plus size={10} /> Jointure</button>
            </div>
            {(source.joins || []).map((j, idx) => (
              <div key={idx} className={styles.joinRow}>
                <select className={`input mono ${styles.joinSelect}`} value={j.table || ""} onChange={e => setJoin(idx, { table: e.target.value, targetColumn: "" })}>
                  <option value="">Table…</option>
                  {tables.filter(t => t.name !== source.table).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <select className={`input mono ${styles.joinSelect}`} value={j.sourceColumn || ""} onChange={e => setJoin(idx, { sourceColumn: e.target.value })}>
                  <option value="">{source.table || "source"}.col…</option>
                  {cols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className={styles.equalsText}>=</span>
                <select className={`input mono ${styles.joinSelect}`} value={j.targetColumn || ""} onChange={e => setJoin(idx, { targetColumn: e.target.value })}>
                  <option value="">{j.table || "cible"}.col…</option>
                  {colsOf(j.table).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" className={`btn btn-ghost ${styles.iconOnlyButton}`} onClick={() => onChange({ joins: source.joins.filter((_, i) => i !== idx) })}><X size={11} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
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
                      {(r.engage != null || r.liquide != null) && (r.engage > 0 || r.liquide > 0) && (
                        <div className={styles.detailLine}>E {fmtBudget(r.engage)} · L {fmtBudget(r.liquide)}</div>
                      )}
                    </td>
                    <td className={`mono ${styles.cellRight} ${r.remaining < 0 ? styles.remainingNegative : styles.remainingPositive}`}>{fmtBudget(r.remaining)}</td>
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
                              {s.supplier} · {Math.round(s.sharePct)}% · E {fmtBudget(s.engage)} · L {fmtBudget(s.liquide)}
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
  const tpl = data.budgetTemplate || migrateLegacyBudget(data);
  const setTpl = patch => setData({ ...data, budgetTemplate: { ...tpl, ...patch } });
  useEffect(() => {
    if (!data.budgetTemplate) setData(d => ({ ...d, budgetTemplate: tpl }));
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
  const sources = (tpl.consumptionSources?.length ? tpl.consumptionSources : defaultBudgetTemplate().consumptionSources)
    .filter(s => s.kind === "COMMANDE" || s.kind === "FACTURE");
  const setSource = (kind, patch) => setTpl({ consumptionSources: sources.map(s => s.kind === kind ? { ...s, ...patch } : s) });

  const toggleAxis = col => {
    const exists = (tpl.axes || []).find(a => a.budgetColumn === col);
    const nextAxes = exists ? tpl.axes.filter(a => a.budgetColumn !== col) : [...(tpl.axes || []), { key: col, label: col, budgetColumn: col, type: "string" }];
    const nextSources = sources.map(s => {
      if (!exists) return s;
      const { [exists.key]: _removed, ...rest } = s.axisMappings || {};
      return { ...s, axisMappings: rest };
    });
    setTpl({ axes: nextAxes, consumptionSources: nextSources });
  };
  const setAxisLabel = (key, label) => setTpl({ axes: tpl.axes.map(a => a.key === key ? { ...a, label } : a) });

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
  const enabledSources = sources.filter(s => s.enabled);
  enabledSources.forEach(s => {
    const meta = BUDGET_KIND_META[s.kind];
    if (!s.table) errors.push(`${meta.label} : table requise.`);
    if (s.table && !s.amountColumn) errors.push(`${meta.label} : colonne montant requise.`);
    if (s.table && !s.dateColumn) errors.push(`${meta.label} : colonne date requise.`);
    if ((s.finalStatuses || []).length > 0 && !s.statusColumn) errors.push(`${meta.label} : colonne statut requise pour filtrer les statuts.`);
    if (s.settlementTable) {
      if (!s.settlementLinkColumn || !s.sourceKeyColumn) errors.push(`${meta.label} : anti double comptage — sélectionnez la colonne de lien et l'identifiant document.`);
      if ((s.settlementFinalStatuses || []).length > 0 && !s.settlementStatusColumn) errors.push(`${meta.label} : anti double comptage — colonne statut de liquidation requise pour filtrer les statuts.`);
    }
    if (byAxes) axes.forEach(a => { if (!s.axisMappings?.[a.key]) errors.push(`${meta.label} : mappez l'axe « ${a.label || a.key} ».`); });
  });
  const ready = errors.length === 0;

  // Formula
  const formula = tpl.formula || { mode: "DEFAULT", tokens: [], includeCommandes: true, includeFactures: true };
  const setFormula = patch => setTpl({ formula: { ...formula, ...patch } });
  const enabledKinds = enabledSources.map(s => s.kind);
  const defaultFormulaText = "Budget restant = Budget alloué"
    + (enabledKinds.includes("COMMANDE") && formula.includeCommandes !== false ? " − Consommation commandes" : "")
    + (enabledKinds.includes("FACTURE") && formula.includeFactures !== false ? " − Consommation factures" : "");
  const addTok = tok => setFormula({ tokens: [...(formula.tokens || []), tok] });
  const [constInput, setConstInput] = useState("");

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
    const body = { ...tpl, enabled: true, forecast: { ...tpl.forecast, defaultTargetDateMode: targetMode === "CUSTOM" ? "CUSTOM" : targetMode } };
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
        <InfoBox color={INTEGRATION_COLORS.success}><strong>Détail Budget</strong> — prévu (alloué), engagé (commandes) et liquidé (factures), groupés par les mêmes axes budgétaires.</InfoBox>
        <button type="button" className={`btn btn-ghost ${styles.suggestButton}`} onClick={() => { const s = suggestBudgetTemplate(tables); if (s) setData({ ...data, budgetTemplate: s }); }}>
          <Wand2 size={12} /> Suggestion auto
        </button>
      </div>

      {/* Mode */}
      <div className={styles.modeGrid}>
        {[{ id: "BY_AXES", label: "Budget par axes", hint: "détaillé par cle/centre budgétaire" }, { id: "GLOBAL", label: "Budget global", hint: "un total pour la période" }].map(m => (
          <div key={m.id} onClick={() => setTpl({ mode: m.id })} className={`${styles.modeCard} ${tpl.mode === m.id ? styles.modeCardActive : ""}`}>
            <div className={`${styles.modeTitle} ${tpl.mode === m.id ? styles.modeTitleActive : ""}`}>{m.label}</div>
            <div className={styles.modeHint}>{m.hint}</div>
          </div>
        ))}
      </div>

      {/* A — Budget source */}
      <BudgetCard icon={<Database size={13} color={INTEGRATION_COLORS.success} />} title="Source du budget" subtitle="Table, montant alloué et période">
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

      {/* B — Axes */}
      {byAxes && (
        <BudgetCard icon={<Hash size={13} color={INTEGRATION_COLORS.success} />} title="Axes budgétaires" subtitle="Les colonnes qui identifient une ligne de budget — la consommation sera groupée par ces mêmes axes"
          right={sampleKey && <span className={`mono ${styles.sampleKey}`}>ex: {sampleKey}</span>}>
          {!src.table ? (
            <div className={styles.emptyMessage}>Sélectionnez d'abord la table budget.</div>
          ) : (
            <div className={styles.sectionStack}>
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
            </div>
          )}
        </BudgetCard>
      )}

      {/* C — Consumption sources */}
      <BudgetCard icon={<TrendingUp size={13} color={INTEGRATION_COLORS.success} />} title="Sources de consommation" subtitle="Commandes et factures qui consomment le budget (écritures comptables : bientôt)">
        <div className={styles.sectionStack}>
          {sources.map(s => (
            <BudgetConsumptionCard key={s.kind} source={s} axes={axes} byAxes={byAxes} tables={tables} colsOf={colsOf} onChange={patch => setSource(s.kind, patch)} />
          ))}
        </div>
      </BudgetCard>

      {/* D — Formula */}
      <BudgetCard icon={<Calculator size={13} color={INTEGRATION_COLORS.success} />} title="Formule" subtitle="Budget restant"
        right={(
          <button type="button" className={`btn btn-ghost ${styles.formulaToggle}`} onClick={() => setFormula({ mode: formula.mode === "CUSTOM" ? "DEFAULT" : "CUSTOM" })}>
            {formula.mode === "CUSTOM" ? "← Formule standard" : "Formule avancée"}
          </button>
        )}>
        {formula.mode !== "CUSTOM" ? (
          <div className={styles.formulaStack}>
            <div className={`mono ${styles.formulaBox}`}>
              {enabledKinds.length === 0 ? "Budget restant = Budget alloué (activez une source de consommation)" : defaultFormulaText}
            </div>
            <div className={styles.checkboxRow}>
              {enabledKinds.includes("COMMANDE") && (
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={formula.includeCommandes !== false} onChange={e => setFormula({ includeCommandes: e.target.checked })} /> Déduire les commandes
                </label>
              )}
              {enabledKinds.includes("FACTURE") && (
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={formula.includeFactures !== false} onChange={e => setFormula({ includeFactures: e.target.checked })} /> Déduire les factures
                </label>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.sectionStack}>
            <div className={`formula-drop ${(formula.tokens || []).length ? styles.formulaDropReady : ""}`}>
              {(formula.tokens || []).length === 0
                ? <span className={styles.formulaPlaceholder}>Composez : Budget alloué − Σ Commandes − Σ Factures…</span>
                : formula.tokens.map((tok, i) => (
                  <div key={i} className={`formula-node ${tok.type === "op" ? "op" : tok.type === "const" ? "agg" : "col"}`} onClick={() => setFormula({ tokens: formula.tokens.filter((_, x) => x !== i) })} title="Clic pour supprimer">
                    {tok.type === "op" ? tok.op : tok.type === "const" ? tok.value : tok.label || tok.col}<X size={10} />
                  </div>
                ))}
            </div>
            <div className={styles.formulaToolRow}>
              <button type="button" className="col-chip" onClick={() => addTok({ type: "var", col: "allocatedBudget", label: "Budget alloué" })}>Budget alloué</button>
              <button type="button" className="col-chip" onClick={() => addTok({ type: "var", col: "commandes", label: "Σ Commandes" })}>Σ Commandes</button>
              <button type="button" className="col-chip" onClick={() => addTok({ type: "var", col: "factures", label: "Σ Factures" })}>Σ Factures</button>
              <div className={styles.divider} />
              {["+", "-", "*", "/", "(", ")"].map(op => <button key={op} type="button" className="formula-op-badge" onClick={() => addTok({ type: "op", op })}>{op}</button>)}
              <div className={styles.divider} />
              <input className={`input mono ${styles.constantInput}`} placeholder="constante" value={constInput} onChange={e => setConstInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !Number.isNaN(parseFloat(constInput))) { addTok({ type: "const", value: parseFloat(constInput) }); setConstInput(""); } }} />
            </div>
            <div className={styles.helpText}>La formule est sauvegardée en JSON structuré et évaluée côté serveur — jamais de SQL brut.</div>
          </div>
        )}
      </BudgetCard>

      {/* Exceptional years excluded from forecasting */}
      <BudgetCard icon={<Clock size={13} color={INTEGRATION_COLORS.success} />} title="Années exceptionnelles" subtitle="Exclues du calcul de saisonnalité et des prévisions (ex: rénovation 2022)">
        <IgnoredYearsEditor forecast={tpl.forecast || {}} onChange={patch => setTpl({ forecast: { ...(tpl.forecast || {}), ...patch } })} />
      </BudgetCard>

      {/* Validation */}
      {errors.length > 0 && (
        <div className={styles.validationBox}>
          <div className={styles.validationTitle}><AlertTriangle size={12} /> À compléter avant l'aperçu</div>
          {errors.slice(0, 5).map((e, i) => <div key={i} className={styles.validationItem}>• {e}</div>)}
          {errors.length > 5 && <div className={styles.validationItem}>… et {errors.length - 5} autre(s)</div>}
        </div>
      )}

      {/* E — Forecast preview */}
      <BudgetCard icon={<FlaskConical size={13} color={INTEGRATION_COLORS.success} />} title="Aperçu & prévision" subtitle="Consommation réelle + projection à la date cible (saisonnalité des séries si disponible)">
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
                  { label: "Consommé", val: result.totals?.consumedToDate, tone: styles.totalInfo },
                  { label: `Projeté au ${result.targetDate}`, val: result.totals?.projectedAtTargetDate, tone: styles.totalWarn },
                  { label: "Restant", val: result.totals?.remaining, tone: (result.totals?.remaining ?? 0) < 0 ? styles.totalDanger : styles.totalSuccess },
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
