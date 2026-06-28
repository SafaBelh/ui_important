/**
 * AI Assistant + JSON-import flow for the connector wizard: the guided Q&A chat
 * (mini + fullscreen), the structured smart-form panel, JSON paste/import, and the
 * generated config report/validation. Extracted from IntegrationsView. The wizard
 * shell mounts AssistantMiniChat / AssistantFullscreen / AssistantBubble.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, ArrowLeft, Bot, Check, CheckCircle2, ChevronRight, Copy, Cpu, Database, Download, Eye, EyeOff, FileJson, FileText, Loader2, MessageSquare, Minimize2, Plug, RotateCcw, Send, Settings2, Sparkles, Tag, Upload, Wand2, X } from "lucide-react";
import { AUTH_FIELDS, GENERIC_SCHEMA, JSON_IMPORT_TEMPLATE, PIPELINE_DEFS, TENANT_IDS_PLACEHOLDER, buildWizardDataFromAnswers } from "@/constants/integrationWizard";
import { connectorTemplateString, processConnectorImport, summarizeConfig } from "@/features/integrations/utils/connectorImport";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { buildReport, computeScore, QA_FLOW, QA_SIDEBAR_STEPS } from "@/features/integrations/utils/wizardHelpers";
import styles from "./IntegrationAssistant.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

function JSONRender({ obj, depth = 0 }) {
  const pad = "  ".repeat(depth), pad1 = "  ".repeat(depth + 1);
  if (obj === null) return <span className="asst-jnull">null</span>;
  if (typeof obj === "boolean") return <span className="asst-jbool">{String(obj)}</span>;
  if (typeof obj === "number") return <span className="asst-jnum">{obj}</span>;
  if (typeof obj === "string") return <span className="asst-jstr">"{obj}"</span>;
  if (Array.isArray(obj)) {
    if (!obj.length) return <span><span className="asst-jbrace">[]</span></span>;
    return <span><span className="asst-jbrace">{"["}</span>{"\n"}{obj.map((v, i) => <span key={i}>{pad1}<JSONRender obj={v} depth={depth + 1} />{i < obj.length - 1 ? "," : ""}{"\n"}</span>)}{pad}<span className="asst-jbrace">{"]"}</span></span>;
  }
  const entries = Object.entries(obj);
  if (!entries.length) return <span><span className="asst-jbrace">{"{}"}</span></span>;
  return <span><span className="asst-jbrace">{"{"}</span>{"\n"}{entries.map(([k, v], i) => <span key={k}>{pad1}<span className="asst-jkey">"{k}"</span><span className={styles.jsonColon}>: </span><JSONRender obj={v} depth={depth + 1} />{i < entries.length - 1 ? "," : ""}{"\n"}</span>)}{pad}<span className="asst-jbrace">{"}"}</span></span>;
}

/* ─── REPORT VIEW (assistant) ───────────────────────────────── */
function ReportView({ report, onAutofill, onBack: _onBack }) {
  const [copied, setCopied] = useState(false);
  const score = computeScore(report);
  const str = JSON.stringify(report, null, 2);
  const scoreTone = score >= 70 ? styles.scoreGood : score >= 40 ? styles.scoreWarn : styles.scoreBad;
  const handleCopy = () => { try { navigator.clipboard?.writeText(str); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { } };
  const handleDL = () => { const b = new Blob([str], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = "erp-config.json"; a.click(); URL.revokeObjectURL(u); };
  return (
    <div className="asst-report-wrap">
      <div className={cx(styles.reportScoreCard, scoreTone)}>
        <div className={styles.flexOne}>
          <div className={styles.scoreTitle}>Score : {score}/100</div>
          <progress className={cx(styles.scoreProgress, scoreTone)} value={score} max="100" aria-label={`Score ${score}/100`} />
          <div className={styles.scoreHint}>{score >= 70 ? "Configuration prête à être appliquée." : "Des champs importants sont manquants."}</div>
        </div>
        <button className="asst-pbtn" onClick={onAutofill}><Wand2 size={15} /> Confirmer &amp; remplir le wizard</button>
      </div>
      <div className={styles.reportChipRow}>
        {[{ label: report?.identity?.name || "Sans nom", tone: styles.chipRed }, { label: report?.identity?.connectorType || "ERP", tone: styles.chipBlue }, { label: report?.identity?.authType || "NONE", tone: styles.chipPurple }, { label: `${(report?.tables?.selected || []).length} table(s)`, tone: styles.chipGreen }, { label: `${(report?.tenants || []).length} tenant(s)`, tone: styles.chipAmber }].map(c => <div key={c.label} className={cx(styles.reportChip, c.tone)}>{c.label}</div>)}
      </div>
      <div className="asst-jblock">
        <div className="asst-jtbar">
          <FileJson size={14} color="#7dd3fc" />
          <span className={styles.jsonTitle}>Configuration JSON</span>
          <button className="asst-cpbtn" onClick={handleCopy}>{copied ? <CheckCircle2 size={12} color="#4ade80" /> : <Copy size={12} />} {copied ? "Copié !" : "Copier"}</button>
          <button className="asst-cpbtn" onClick={handleDL}><Download size={12} /> Télécharger</button>
        </div>
        <div className="asst-jcontent"><JSONRender obj={report} /></div>
      </div>
      <div className={styles.spacer32} />
    </div>
  );
}

/* ─── JSON IMPORT VIEW ──────────────────────────────────────── */
function JSONImportView({ onAutofill, onBack: _onBack }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [score, setScore] = useState(null);
  const TEMPLATE = JSON_IMPORT_TEMPLATE;
  const handleParse = () => { try { const p = JSON.parse(raw); setParsed(p); setError(null); setScore(computeScore(p)); } catch (e) { setError("JSON invalide : " + e.message); setParsed(null); setScore(null); } };
  const handleTemplate = () => { setRaw(JSON.stringify(TEMPLATE, null, 2)); setParsed(null); setError(null); setScore(null); };
  const handleConfirm = () => {
    if (!parsed) return;
    const d = { name: parsed.identity?.name || "", connectorType: parsed.identity?.connectorType || "ERP", authType: parsed.identity?.authType || "NONE", logo: parsed.identity?.logo || "", color: parsed.identity?.color || "#D94F3D", description: parsed.identity?.description || "", ...(parsed.authentication || {}), connectionType: parsed.connection?.type || "jdbc", jdbcUrl: parsed.connection?.jdbcUrl || "", jdbcUsername: parsed.connection?.jdbcUsername || "", jdbcPassword: parsed.connection?.jdbcPassword || "", selectedTables: parsed.tables?.selected || [], budgetSourceTables: parsed.tables?.budgetSources || [], tenants: (parsed.tenants || []).map(t => typeof t === "string" ? { id: t, label: t, active: false, statuses: { facture: { provisional: ["En attente"], final: ["Payé"], statusColumn: "STATUT" }, commande: { provisional: ["En cours"], final: ["Livré"], statusColumn: "STATUT" } } } : t), pipelines: { facture: { enabled: parsed.pipelines?.factures?.enabled !== false, tables: parsed.pipelines?.factures?.sourceTables || [], fieldMappings: parsed.pipelines?.factures?.fieldMappings || {}, conditions: [], joins: [], groupByCols: [] }, commande: { enabled: parsed.pipelines?.commandes?.enabled !== false, tables: parsed.pipelines?.commandes?.sourceTables || [], fieldMappings: {}, conditions: [], joins: [], groupByCols: parsed.pipelines?.commandes?.groupBy || [] } }, budgetFormula: [], customPipelines: [], generatedData: {} };
    onAutofill(d);
  };
  return (
    <div className="json-import-wrap">
      <div className={styles.jsonImportInner}>
        <div className={styles.mb20}>
          <div className={styles.jsonImportHeader}>
            <div><div className={styles.jsonImportTitle}>Importer une configuration JSON</div><div className={styles.jsonImportSubtitle}>Collez votre JSON de configuration ERP ci-dessous</div></div>
            <button className={cx("asst-gbtn", styles.btnXs)} onClick={handleTemplate}><FileText size={13} /> Charger un modèle</button>
          </div>
          <textarea className="json-textarea" value={raw} onChange={e => { setRaw(e.target.value); setParsed(null); setError(null); setScore(null); }} placeholder={'{\n  "identity": { "name": "Mon ERP", ... },\n  ...\n}'} />
        </div>
        {error && <div className={styles.errorBox}><AlertTriangle size={16} color="#dc2626" /><span>{error}</span></div>}
        {score !== null && parsed && (
          <div className={cx(styles.importScoreCard, score >= 70 ? styles.scoreGood : styles.scoreWarn)}>
            <div className={styles.importScoreHeader}>
              <div className={styles.importScoreTitle}>Score : {score}/100</div>
              {score >= 40 && <button className="asst-pbtn" onClick={handleConfirm}><Wand2 size={14} /> Confirmer &amp; remplir le wizard</button>}
            </div>
            <progress className={cx(styles.scoreProgress, score >= 70 ? styles.scoreGood : styles.scoreWarn)} value={score} max="100" aria-label={`Score ${score}/100`} />
          </div>
        )}
        <button className="asst-pbtn" onClick={handleParse} disabled={!raw.trim()}><CheckCircle2 size={14} /> Analyser le JSON</button>
        <div className={styles.spacer32} />
      </div>
    </div>
  );
}

/* ─── MULTI CHIP ─────────────────────────────────────────────── */
function MultiChip({ options, value, onChange }) {
  return (
    <div className="asst-chip-row">
      {options.map(opt => {
        const s = value.includes(opt.value);
        return <button key={opt.value} className={`asst-chip${s ? " sel" : ""}`} onClick={() => onChange(s ? value.filter(x => x !== opt.value) : [...value, opt.value])}>{opt.label}</button>;
      })}
    </div>
  );
}

/* ─── PIPELINE FACTURE STEP (in Q&A) ─────────────────────────── */
function PipelineFactureMsgWidget({ plCols, value, onChange }) {
  const fixedFields = PIPELINE_DEFS.facture.fixedFields;
  const [mapping, setMapping] = useState(value || {});
  const update = (k, v) => { const next = { ...mapping, [k]: v }; setMapping(next); onChange(next); };
  return (
    <div className={styles.pipelineWidget}>
      {fixedFields.map(f => (
        <div key={f.key} className={styles.pipelineRow}>
          <div className={styles.pipelineLabel}>{f.label} <span className={styles.required}>*</span></div>
          <span className={styles.arrow}>→</span>
          <select value={mapping[f.key] || ""} onChange={e => update(f.key, e.target.value)} className={styles.pipelineSelect}>
            <option value="">-- Colonne --</option>
            {plCols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {mapping[f.key] && <CheckCircle2 size={13} color={INTEGRATION_COLORS.success} />}
        </div>
      ))}
    </div>
  );
}

/* ─── SMART FORM SECTIONS ───────────────────────────────────── */
const SMART_FORM_SECTIONS = [
  { id: "identity", label: "Identité", color: "#D94F3D", Icon: Tag, fields: [{ key: "name", label: "Nom du connecteur", type: "text", placeholder: "SAP S/4HANA Production", span: 2 }, { key: "connectorType", label: "Type de système", type: "select", options: ["ERP", "DATA_SOURCE", "ACCOUNTING"] }, { key: "authType", label: "Authentification", type: "select", options: ["NONE", "BASIC", "API_KEY", "OAUTH2", "JWT_SIGNED", "SAML"] }, { key: "description", label: "Description", type: "text", placeholder: "Connecteur ERP…", span: 2 }, { key: "logo", label: "Initiales (2 car.)", type: "text", placeholder: "SP", maxLen: 2 }, { key: "color", label: "Couleur", type: "color" }] },
  { id: "auth_details", label: "Détails d'authentification", color: "#6366f1", Icon: Settings2, fields: [], dynamic: true },
  { id: "connection", label: "Connexion", color: "#3b82f6", Icon: Plug, fields: [{ key: "connectionType", label: "Type de connexion", type: "select", options: ["jdbc", "api", "csv"] }, { key: "jdbcUrl", label: "URL JDBC", type: "text", placeholder: "jdbc:postgresql://host:5432/erp_db", span: 2, mono: true }, { key: "jdbcUsername", label: "Utilisateur", type: "text", placeholder: "erp_user" }, { key: "jdbcPassword", label: "Mot de passe", type: "password", placeholder: "••••••••" }] },
  { id: "tables", label: "Tables", color: "#059669", Icon: Database, fields: [{ key: "selectedTables", label: "Tables à importer", type: "table_picker", span: 2 }, { key: "budgetSourceTables", label: "Tables sources budget", type: "table_subset", span: 2 }] },
  { id: "alerts", label: "Tenants", color: "#f59e0b", Icon: Cpu, fields: [{ key: "_tenantsRaw", label: "IDs Tenants (virgule)", type: "text", placeholder: TENANT_IDS_PLACEHOLDER, span: 2 }] },
];

function SmartFormPanel({ formData, setFormData, schema, onSubmit }) {
  const allTables = schema?.tables || [];
  const update = (k, v) => setFormData(p => ({ ...p, [k]: v }));
  const [pwVis, setPwVis] = useState({});
  const authFields = AUTH_FIELDS[formData.authType] || [];
  const nonPickerFields = SMART_FORM_SECTIONS.flatMap(s => s.dynamic ? authFields : s.fields).filter(f => !["table_picker", "table_subset", "table_subset_key", "color"].includes(f?.type));
  const filled = nonPickerFields.filter(f => f?.key && formData[f.key]).length;
  const pct = nonPickerFields.length ? Math.round((filled / nonPickerFields.length) * 100) : 0;

  const renderF = (f) => {
    if (!f || !f.key) return null;
    const v = formData[f.key];
    const spanAll = f.span === 2 ? styles.spanAll : null;
    if (f.type === "table_picker") { const sel = Array.isArray(v) ? v : []; return <div key={f.key} className={styles.spanAll}><label className="asst-flabel">{f.label}</label>{allTables.length === 0 ? <div className={styles.emptyHint}>Saisissez d'abord une URL JDBC</div> : <div className="asst-chip-row">{allTables.map(t => { const s = sel.includes(t.name); return <button key={t.name} className={`asst-chip${s ? " sel" : ""}`} onClick={() => update(f.key, s ? sel.filter(x => x !== t.name) : [...sel, t.name])}>{t.name}</button>; })}</div>}</div>; }
    if (f.type === "table_subset" || f.type === "table_subset_key") { const parentSel = Array.isArray(formData.selectedTables) ? formData.selectedTables : []; const v2 = Array.isArray(v) ? v : []; const avail = allTables.filter(t => parentSel.includes(t.name)); return <div key={f.key} className={styles.spanAll}><label className="asst-flabel">{f.label}</label>{avail.length === 0 ? <div className={styles.emptyHint}>Sélectionnez d'abord des tables</div> : <div className="asst-chip-row">{avail.map(t => { const s = v2.includes(t.name); return <button key={t.name} className={`asst-chip${s ? " sel" : ""}`} onClick={() => update(f.key, s ? v2.filter(x => x !== t.name) : [...v2, t.name])}>{t.name}</button>; })}</div>}</div>; }
    if (f.type === "select") return <div key={f.key} className={spanAll}><label className="asst-flabel">{f.label}</label><select className="asst-fsel" value={v || ""} onChange={e => update(f.key, e.target.value)}>{(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select></div>;
    if (f.type === "color") return <div key={f.key}><label className="asst-flabel">{f.label}</label><div className={styles.colorRow}><input type="color" value={v || "#D94F3D"} onChange={e => update(f.key, e.target.value)} className={styles.colorInput} /><input className={cx("asst-fi", styles.colorTextInput)} value={v || "#D94F3D"} onChange={e => update(f.key, e.target.value)} /></div></div>;
    if (f.type === "password") return <div key={f.key} className={spanAll}><label className="asst-flabel">{f.label}</label><div className={styles.passwordWrap}><input type={pwVis[f.key] ? "text" : "password"} className={cx("asst-fi", styles.passwordInput)} value={v || ""} onChange={e => update(f.key, e.target.value)} placeholder={f.placeholder} /><button onClick={() => setPwVis(p => ({ ...p, [f.key]: !p[f.key] }))} className={styles.passwordToggle}>{pwVis[f.key] ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></div>;
    return <div key={f.key} className={spanAll}><label className="asst-flabel">{f.label}</label><input type={f.type === "number" ? "number" : "text"} className={cx("asst-fi", f.mono && styles.monoInput)} value={v || ""} onChange={e => update(f.key, e.target.value)} placeholder={f.placeholder || ""} maxLength={f.maxLen} /></div>;
  };

  return (
    <div className="asst-form-wrap">
      <div className={styles.formProgressRow}>
        <progress className={styles.formProgress} value={pct} max="100" aria-label={`Formulaire rempli à ${pct}%`} />
        <span className={cx(styles.formPct, pct === 100 && styles.formPctDone)}>{pct}%</span>
      </div>
      {SMART_FORM_SECTIONS.map(sec => {
        const SI = sec.Icon;
        const fields = sec.dynamic ? authFields : sec.fields;
        if (sec.dynamic && fields.length === 0) return null;
        return <div key={sec.id} className="asst-fsec"><div className="asst-fsec-hdr"><div className={cx(styles.sectionIcon, styles[`sectionIcon_${sec.id}`])}><SI size={15} color={sec.color} /></div><div className={styles.sectionTitle}>{sec.label}</div></div><div className="asst-fsec-body"><div className="asst-frow">{fields.map(f => renderF(f))}</div></div></div>;
      })}
      <div className={styles.formFooter}>
        <button className="asst-pbtn" onClick={onSubmit}><Sparkles size={15} /> Générer le rapport JSON</button>
      </div>
    </div>
  );
}

/* ─── FULL ASSISTANT PANEL ──────────────────────────────────── */
export function AssistantFullscreen({ onClose, onAutofill, rawSchema, initialMode, onMinimize }) {
  const [mode, setMode] = useState(null);
  const appliedInitial = useRef(false);
  const [qaStepIdx, setQaStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [multiSel, setMultiSel] = useState([]);
  const [factureMappingTemp, setFactureMappingTemp] = useState({});
  const [report, setReport] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [formData, setFormData] = useState({ color: "#D94F3D", connectorType: "ERP", authType: "NONE", connectionType: "jdbc", selectedTables: [], budgetSourceTables: [] });
  const chatEndRef = useRef(null);
  const curStep = QA_FLOW[qaStepIdx];
  const schema = useMemo(() => { const url = answers.jdbcUrl || ""; if (!url && !rawSchema) return null; if (rawSchema) { const sel = answers.selectedTables || []; if (sel.length === 0) return rawSchema; const tables = rawSchema.tables.filter(t => sel.includes(t.name)); const tableNames = new Set(tables.map(t => t.name)); return { tables, rels: rawSchema.rels.filter(r => tableNames.has(r.from) && tableNames.has(r.to)) }; } return GENERIC_SCHEMA; }, [answers.jdbcUrl, answers.selectedTables, rawSchema]);
  const scrollB = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    if (messages.length !== 0) return;
    setQaStepIdx(0);
    setMode(null);
    setAnswers({});
    setMultiSel([]);
    setReport(null);
    setShowReport(false);
    setFactureMappingTemp({});
    const firstStep = QA_FLOW[0];
    setTimeout(() => setMessages([{ role: "bot", text: firstStep.bot, type: firstStep.type, options: firstStep.options }]), 80);
  }, [messages.length]);
  useEffect(() => { scrollB(); }, [messages, typing]);
  // When launched from the mini chat with a chosen mode (e.g. "qa"), jump straight in.
  useEffect(() => {
    if (initialMode && !appliedInitial.current && mode === null && messages.length > 0) {
      appliedInitial.current = true;
      handleModeChoice(initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, mode, messages.length]);
  const addBot = (text, opts = {}) => setMessages(p => [...p, { role: "bot", text, ...opts }]);
  const addUser = text => setMessages(p => [...p, { role: "user", text }]);
  const initChat = () => { setQaStepIdx(0); setMode(null); setAnswers({}); setMultiSel([]); setReport(null); setShowReport(false); setFactureMappingTemp({}); const s = QA_FLOW[0]; setTimeout(() => setMessages([{ role: "bot", text: s.bot, type: s.type, options: s.options }]), 80); };
  const advanceToStep = useCallback((targetId, curAnswers) => {
    const idx = QA_FLOW.findIndex(s => s.id === targetId);
    if (idx < 0) return;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      let si = idx, ns = QA_FLOW[si];
      while (ns?.condition && !ns.condition(curAnswers)) { const ni = QA_FLOW.findIndex(s => s.id === ns.next); if (ni < 0) break; si = ni; ns = QA_FLOW[si]; }
      if (!ns) return;
      const bt = typeof ns.bot === "function" ? ns.bot(curAnswers, schema) : ns.bot;
      const opts = { type: ns.type };
      if (ns.type === "choice" || ns.type === "mode_pick") opts.options = ns.options;
      else if (ns.type === "multi_schema") opts.schOpts = (schema?.tables || GENERIC_SCHEMA.tables).map(t => ({ label: t.name, value: t.name }));
      else if (ns.type === "choice_dynamic") opts.dynOpts = (curAnswers.selectedTables || []).map(n => ({ label: n, value: n }));
      else if (ns.type === "pipeline_facture") { const selTables = curAnswers.selectedTables || []; const plCols = (schema?.tables || GENERIC_SCHEMA.tables).filter(t => selTables.includes(t.name)).flatMap(t => t.cols.map(c => `${t.name}.${c}`)); opts.plCols = plCols; }
      else if (ns.type === "pipeline_commande") { const selTables = curAnswers.selectedTables || []; const plCols = (schema?.tables || GENERIC_SCHEMA.tables).filter(t => selTables.includes(t.name)).flatMap(t => t.cols.map(c => ({ label: `${t.name}.${c}`, value: `${t.name}.${c}` }))); opts.schOpts = plCols; }
      else if (ns.placeholder) opts.placeholder = ns.placeholder;
      addBot(bt, opts); setQaStepIdx(si);
    }, 600);
  }, [schema]);
  const advanceQA = useCallback((key, answer, display) => {
    const step = QA_FLOW[qaStepIdx];
    const na = key ? { ...answers, [key]: answer } : { ...answers };
    if (key) setAnswers(na);
    setMultiSel([]);
    if (display) addUser(display);
    else if (answer !== undefined && answer !== null) addUser(Array.isArray(answer) ? answer.join(", ") : String(answer));
    let nextId;
    if (step.nextFn) nextId = step.nextFn(answer, na);
    else nextId = step.next;
    if (!nextId) return;
    advanceToStep(nextId, na);
  }, [qaStepIdx, answers, advanceToStep]);
  const handleModeChoice = (v) => {
    setMode(v); addUser(v === "qa" ? "Questions / Réponses" : v === "form" ? "Formulaire" : "Import JSON");
    if (v === "qa") { setTyping(true); setTimeout(() => { setTyping(false); const n = QA_FLOW[1]; addBot(n.bot, { type: n.type, placeholder: n.placeholder }); setQaStepIdx(1); }, 400); }
    else { setTyping(true); setTimeout(() => { setTyping(false); addBot(v === "form" ? "Parfait ! Remplissez le formulaire ci-dessous." : "Collez votre JSON de configuration ci-dessous.", { type: "switch_" + v }); }, 400); }
  };
  const handleTextSubmit = () => { if (!textInput.trim()) return; advanceQA(curStep?.key, textInput.trim(), textInput.trim()); setTextInput(""); };
  const genReport = (src) => { const r = buildReport(src); setReport(r); setShowReport(true); };
  const handleAutofillAndClose = () => { const src = mode === "form" ? formData : answers; onAutofill(buildWizardDataFromAnswers(src, schema)); onClose(); };
  const isDone = curStep?.id === "q_done";
  const showSidebar = mode === "qa";
  const modePct = mode === "qa" ? Math.round((qaStepIdx / (QA_FLOW.length - 1)) * 100) : 0;
  const isForm = mode === "form";
  const isJSON = mode === "json";
  return createPortal(
    <div className="asst-fs">
      <div className="asst-fs-hdr">
        <div className={styles.fsTitleRow}>
          <div className={styles.fsBotIcon}><Bot size={18} color="#D94F3D" /></div>
          <div><div className={styles.fsTitle}>Assistant Configuration ERP</div><div className={styles.fsSubtitle}><span className={styles.statusDot} />100% local · Aucune IA externe</div></div>
        </div>
        <div className={styles.fsActions}>
          {/* Mode tabs only when the user is free to switch (i.e. NOT launched from the
              mini chat with a fixed mode) — avoids a redundant 2nd way to choose. */}
          {mode && !showReport && !isJSON && !initialMode && (<div className="mode-tabs">{[{ v: "qa", I: MessageSquare, label: "Q&A" }, { v: "form", I: FileJson, label: "Formulaire" }, { v: "json", I: Upload, label: "JSON" }].map(({ v, I, label }) => (<button key={v} className={`mode-tab${mode === v ? " active" : ""}`} onClick={() => { setMode(v); setShowReport(false); }}><I size={12} /> {label}</button>))}</div>)}
          {(showReport || isJSON) && <button className="asst-gbtn" onClick={() => setShowReport(false)}><ArrowLeft size={13} /> Retour</button>}
          <button onClick={initChat} title="Recommencer" className={styles.iconButton}><RotateCcw size={14} /></button>
          {onMinimize && <button onClick={onMinimize} title="Réduire" className={styles.iconButton}><Minimize2 size={14} /></button>}
          <button onClick={onClose} title="Fermer" className={styles.iconButton}><X size={15} /></button>
        </div>
      </div>
      {mode === "qa" && <progress className={cx("asst-prog-rail", styles.qaProgress)} value={modePct} max="100" aria-label={`Progression ${modePct}%`} />}
      <div className="asst-fs-body">
        {showSidebar && (<div className="asst-fs-sidebar"><div className={styles.sidebarTitle}>Étapes</div>{QA_SIDEBAR_STEPS.map((s, i) => { const idx = QA_FLOW.findIndex(q => q.id === s.id); const done = qaStepIdx > idx, active = curStep?.id === s.id; return (<div key={s.id} className={`asst-ss${active ? " active" : done ? " done" : ""}`}><div className="asst-sn">{done ? <CheckCircle2 size={11} color={INTEGRATION_COLORS.success} /> : i + 1}</div><span className={cx(styles.sidebarStepLabel, active && styles.sidebarStepActive, done && styles.sidebarStepDone)}>{s.label}</span></div>); })}</div>)}
        <div className="asst-fs-main">
          {showReport && report ? (<ReportView report={report} onAutofill={handleAutofillAndClose} onBack={() => setShowReport(false)} />) :
            isJSON ? (<JSONImportView onAutofill={(d) => { onAutofill(d); onClose(); }} onBack={() => setMode(null)} />) :
              isForm ? (<SmartFormPanel formData={formData} setFormData={setFormData} schema={schema || GENERIC_SCHEMA} onSubmit={() => genReport(formData)} />) : (
                <>
                  <div className="asst-chat-wrap">
                    <div className="asst-chat-inner">
                      {messages.map((msg, i) => (
                        <div key={i} className={`${msg.role === "bot" ? "asst-msg-bot" : "asst-msg-user"} asst-anim`}>
                          {msg.role === "bot" && (<div className={styles.chatBotIcon}><Bot size={15} color="#D94F3D" /></div>)}
                          <div className={styles.chatMsgContent}>
                            <div className={msg.role === "bot" ? "asst-bb" : "asst-bu"}>{msg.text}</div>
                            {msg.role === "bot" && msg.type === "mode_pick" && i === messages.length - 1 && (<div className={styles.mt10}>{(msg.options || []).map((opt, oi) => (<button key={oi} className="asst-opt" onClick={() => handleModeChoice(opt.value)}><span className={styles.flexOne}>{opt.label}</span>{opt.desc && <span className={styles.optionDesc}>{opt.desc}</span>}<ChevronRight size={14} color={INTEGRATION_COLORS.g300} /></button>))}</div>)}
                            {msg.role === "bot" && msg.type === "choice" && i === messages.length - 1 && (<div className={styles.mt10}>{(msg.options || []).map((opt, oi) => (<button key={oi} className="asst-opt" onClick={() => advanceQA(curStep?.key, opt.value, opt.label)}><span className={styles.flexOne}>{opt.label}</span><ChevronRight size={14} color={INTEGRATION_COLORS.g300} /></button>))}</div>)}
                            {msg.role === "bot" && msg.type === "choice_dynamic" && i === messages.length - 1 && (<div className={styles.mt10}>{(msg.dynOpts || []).length === 0 ? <div className={styles.emptyHint}>Aucune table sélectionnée</div> : (msg.dynOpts || []).map((opt, oi) => (<button key={oi} className="asst-opt" onClick={() => advanceQA(curStep?.key, [opt.value], opt.label)}><Database size={13} color={INTEGRATION_COLORS.g400} /><span className={styles.flexOne}>{opt.label}</span><ChevronRight size={14} color={INTEGRATION_COLORS.g300} /></button>))}</div>)}
                            {msg.role === "bot" && msg.type === "multi_schema" && i === messages.length - 1 && (<div className={styles.mt10}><MultiChip options={msg.schOpts || []} value={multiSel} onChange={setMultiSel} /><button className={cx("asst-pbtn", styles.inlineConfirm)} disabled={multiSel.length === 0} onClick={() => advanceQA(curStep?.key, multiSel, `${multiSel.length} table(s)`)}><Check size={13} /> Confirmer ({multiSel.length})</button></div>)}
                            {msg.role === "bot" && msg.type === "pipeline_facture" && i === messages.length - 1 && (<div className={styles.mt10}><PipelineFactureMsgWidget plCols={msg.plCols || []} value={factureMappingTemp} onChange={setFactureMappingTemp} /><button className={cx("asst-pbtn", styles.inlineConfirm)} onClick={() => advanceQA(curStep?.key, factureMappingTemp, "Mapping factures configuré")}><Check size={13} /> Confirmer le mapping</button><button className={cx("asst-gbtn", styles.inlineSkip)} onClick={() => advanceQA(curStep?.key, {}, "Mapping ignoré")}>Passer</button></div>)}
                            {msg.role === "bot" && msg.type === "pipeline_commande" && i === messages.length - 1 && (<div className={styles.mt10}><MultiChip options={msg.schOpts || []} value={multiSel} onChange={setMultiSel} /><div className={styles.inlineButtonRow}><button className={cx("asst-pbtn", styles.inlineButton)} onClick={() => advanceQA(curStep?.key, multiSel, multiSel.length ? `${multiSel.length} col(s)` : "Pas de Group By")}><Check size={13} /> Confirmer</button><button className={cx("asst-gbtn", styles.inlineSkipCompact)} onClick={() => advanceQA(curStep?.key, [], "Pas de Group By")}>Passer</button></div></div>)}
                            {msg.role === "bot" && msg.type === "done" && (<button className={cx("asst-pbtn", styles.mt12)} onClick={() => genReport(answers)}><FileJson size={15} /> Voir le rapport JSON</button>)}
                          </div>
                        </div>
                      ))}
                      {typing && (<div className="asst-msg-bot asst-anim"><div className={styles.chatBotIconNoMargin}><Bot size={15} color="#D94F3D" /></div><div className="asst-typing"><span /><span /><span /></div></div>)}
                      <div ref={chatEndRef} />
                    </div>
                  </div>
                  {mode === "qa" && !isDone && curStep?.type === "text" && (<div className="asst-input-bar"><div className="asst-input-bar-inner"><input className="asst-ti" value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleTextSubmit()} placeholder={curStep?.placeholder || "Tapez votre réponse…"} /><button className="asst-sb" onClick={handleTextSubmit} disabled={!textInput.trim()}><Send size={16} color="#fff" /></button></div></div>)}
                </>
              )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AssistantBubble({ onOpen, hasData }) {
  return createPortal(
    <button className="asst-fab" onClick={onOpen} title="Ouvrir l'assistant ERP">
      <Bot size={26} color="#fff" />
      {hasData && <div className="asst-fab-badge"><Check size={10} /></div>}
      <span className="asst-tooltip">Assistant ERP</span>
    </button>,
    document.body
  );
}

/* ─── VALIDATION REPORT (mini chat) ─────────────────────────── */
function ValidationReport({ result }) {
  if (!result) return null;
  const { errors = [], warnings = [], missing = [] } = result;
  const Section = ({ items, tone, Icon, label }) => {
    if (!items.length) return null;
    const shown = items.slice(0, 8);
    return (
      <div className={styles.validationSection}>
        <div className={cx(styles.validationSectionTitle, tone)}>
          <Icon size={12} /> {label} ({items.length})
        </div>
        <div className={styles.validationItems}>
          {shown.map((it, i) => (
            <div key={i} className={cx(styles.validationItem, tone)}>
              <span className={cx("mono", styles.validationPath)}>{it.path}</span>
              <span className={styles.validationSep}> · </span>{it.message}
            </div>
          ))}
          {items.length > shown.length && <div className={styles.validationMore}>+{items.length - shown.length} autre(s)…</div>}
        </div>
      </div>
    );
  };
  return (
    <div>
      <div className={cx(styles.validationStatus, result.ok ? styles.validationOk : styles.validationError)}>
        {result.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
        {result.ok ? "Validation réussie" : "Validation échouée"}
      </div>
      <Section items={errors} tone={styles.validationError} Icon={AlertCircle} label="Erreurs" />
      <Section items={missing} tone={styles.validationWarn} Icon={AlertTriangle} label="Champs manquants" />
      <Section items={warnings} tone={styles.validationWarn} Icon={AlertTriangle} label="Avertissements" />
    </div>
  );
}

/* ─── ASSISTANT MINI CHAT (Messenger-like, compact, NOT fullscreen) ─── */
export function AssistantMiniChat({ onClose, onAutofill, onOpenFullscreen, knownPlatformTenantIds }) {
  // Guided flow — minimal buttons. Stages:
  // await-choice → (json) template → await-import → working → (invalid→await-import | done)
  const [messages, setMessages] = useState([]);
  const [stage, setStage] = useState("intro");
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const mounted = useRef(true);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const say = (role, text, extra = {}) => { if (mounted.current) setMessages((p) => [...p, { role, text, ...extra }]); };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, stage]);

  // Intro: introduce + ask how to proceed (two choices).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(150);
      if (cancelled || !mounted.current) return;
      say("bot", "Bonjour, je suis l'assistant ERP d'AnomalyIQ. Je vous aide à configurer un nouveau connecteur, étape par étape.");
      await sleep(700);
      if (cancelled || !mounted.current) return;
      say("bot", "Comment souhaitez-vous procéder ?", { actions: "choice" });
      setStage("await-choice");
    })();
    return () => { cancelled = true; };
     
  }, []);

  const chooseQA = () => {
    say("user", "Questions / Réponses", { icon: MessageSquare });
    onOpenFullscreen("qa");
    onClose();
  };

  const chooseJson = async () => {
    say("user", "Import JSON", { icon: FileJson });
    setStage("template");
    await sleep(400);
    say("bot", "Téléchargez le modèle, remplissez-le avec les détails de votre ERP, puis importez le fichier.", { actions: "download" });
  };

  const downloadTemplate = async () => {
    const blob = new Blob([connectorTemplateString()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "erp-connector-template.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    say("user", "Modèle téléchargé", { icon: Download });
    setStage("await-import");
    await sleep(400);
    say("bot", "J'attends votre fichier rempli. Importez-le quand il est prêt — je le vérifie automatiquement.", { actions: "import" });
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // allow re-importing the same filename
    if (!file) return;
    let text = "";
    try { text = await file.text(); } catch { say("bot", "Impossible de lire le fichier.", { error: true, actions: "import" }); return; }
    say("user", file.name, { icon: FileText });
    await handleImport(text);
  };

  const handleImport = async (text) => {
    setStage("working");
    await sleep(350);
    say("bot", "Fichier reçu.", { icon: CheckCircle2, iconColor: INTEGRATION_COLORS.success });
    await sleep(550);
    say("bot", "Je vérifie votre configuration : champs requis, identifiants SQL, mappings, budget…");
    await sleep(650);
    const res = processConnectorImport(text, { knownPlatformTenantIds });

    if (!res.ok && res.stage === "parse") {
      say("bot", res.parseError, { error: true });
      say("bot", "Le fichier n'est pas un JSON valide. Corrigez-le puis réimportez-le.", { actions: "import" });
      setStage("await-import");
      return;
    }
    say("bot", "", { report: res.validation });
    if (!res.ok) {
      say("bot", "Il manque des informations ou certaines sont invalides (voir ci-dessus). Corrigez le fichier, puis réimportez-le.", { actions: "import" });
      setStage("await-import");
      return;
    }

    // Valid & complete → confirm, pause, then create + open the prefilled wizard.
    const sum = summarizeConfig(res.config);
    const pw = sum.hasPassword ? "" : " · mot de passe vide (à compléter dans le formulaire)";
    say("bot", `Configuration valide et complète — « ${sum.name} » · ${sum.connectionType.toUpperCase()} · ${sum.tables} table(s) · ${sum.pipelines.length} pipeline(s)${pw}.`, { icon: CheckCircle2, iconColor: INTEGRATION_COLORS.success });
    await sleep(1300);
    if (!mounted.current) return;
    say("bot", "Je crée le connecteur et j'ouvre le formulaire pré-rempli pour vérification…", { icon: Wand2, iconColor: INTEGRATION_COLORS.red });
    await sleep(1100);
    if (!mounted.current) return;
    onAutofill(res.normalized);
    onClose();
  };

  const renderActions = (kind) => {
    if (kind === "choice") return (
      <div className={styles.miniChoiceActions}>
        <button onClick={chooseJson} className={cx("btn btn-primary", styles.miniChoiceButton)}><FileJson size={14} /> Import JSON</button>
        <button onClick={chooseQA} className={cx("btn btn-ghost", styles.miniChoiceButton, styles.miniGhostButton)}><MessageSquare size={14} /> Questions / Réponses</button>
      </div>
    );
    if (kind === "download") return (
      <button onClick={downloadTemplate} className={cx("btn btn-primary", styles.miniFullAction)}><Download size={14} /> Télécharger le modèle</button>
    );
    if (kind === "import") return (
      <button onClick={() => fileRef.current?.click()} className={cx("btn btn-primary", styles.miniFullAction)}><Upload size={14} /> Importer le fichier JSON</button>
    );
    return null;
  };

  return createPortal(
    <div className={styles.miniChat}>
      {/* Header */}
      <div className={styles.miniHeader}>
        <div className={styles.miniHeaderIcon}><Bot size={18} color="#fff" /></div>
        <div className={styles.miniHeaderText}>
          <div className={styles.miniTitle}>Assistant ERP</div>
          <div className={styles.miniSubtitle}><span className={styles.miniStatusDot} /> Configuration guidée · 100% local</div>
        </div>
        <button onClick={onClose} title="Fermer" className={styles.miniClose}><X size={15} /></button>
      </div>

      {/* Messages + inline action buttons (under the latest bubble) */}
      <div className={cx("scroll", styles.miniMessages)}>
        {messages.map((m, i) => {
          const isBot = m.role !== "user";
          const Ic = m.icon;
          return (
            <div key={i} className={cx(styles.miniMessageRow, isBot ? styles.miniMessageBotRow : styles.miniMessageUserRow)}>
              {isBot && <div className={styles.miniAvatar}><Bot size={13} color={INTEGRATION_COLORS.red} /></div>}
              <div className={cx(styles.miniBubble, isBot ? styles.miniBubbleBot : styles.miniBubbleUser, isBot && m.error && styles.miniBubbleError, m.report && styles.miniBubbleReport)}>
                {m.report ? <ValidationReport result={m.report} /> : (
                  <span className={styles.miniTextRow}>
                    {Ic && <Ic size={14} color={m.iconColor || (isBot ? INTEGRATION_COLORS.g500 : "#fff")} className={styles.miniInlineIcon} />}
                    <span>{m.text}</span>
                  </span>
                )}
                {i === messages.length - 1 && m.actions && renderActions(m.actions)}
              </div>
            </div>
          );
        })}
        {stage === "working" && (
          <div className={styles.miniWorkingRow}>
            <div className={styles.miniAvatar}><Bot size={13} color={INTEGRATION_COLORS.red} /></div>
            <div className={styles.miniWorkingBubble}>
              <Loader2 size={13} className="spin" /> Un instant…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <input ref={fileRef} type="file" accept=".json,.jsonc,application/json" className={styles.hiddenFileInput} onChange={onPickFile} />
    </div>,
    document.body
  );
}
