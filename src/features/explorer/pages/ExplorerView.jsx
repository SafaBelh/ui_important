import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesByTenantId } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadDocumentsForTenant, loadPipelinesForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { downloadCSV } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { addAuditEntry } from "@/features/audit/model/auditActions";
import { checkPipelineDocument, confirmPipelineDocument } from "@/features/pipelines/api/pipelinesApi";
import { EXT_STATUS_CFG } from "@/features/explorer/model/ExplorerConstants";
import { logError } from "@/shared/utils/logError";
import styles from "./ExplorerView.module.css";

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className={styles.fieldLabel}>{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`input-field ${styles.fieldInput}`} />
    </div>
  );
}

const RECORD_TYPE_OPTIONS = [
  { value: "INVOICE", label: "Factures", singular: "facture", plural: "factures", dataset: "factures", source: "DOCUMENTS" },
  { value: "COMMANDE", label: "Commandes", singular: "commande", plural: "commandes", dataset: "commandes", source: "DOCUMENTS" },
  { value: "OTHER", label: "Autres", singular: "document", plural: "documents", dataset: "documents", source: "DOCUMENTS" },
];

const STANDARD_GROUP_FIELDS = new Set([
  "supplier", "supplier_code", "suppliername", "vendor", "vendor_code", "fournisseur",
  "label", "category", "categoryname", "libelle",
  "budgetcode", "budget_code", "ligne_budgetaire", "budget", "centre", "article",
  "amount", "date", "document_date", "invoicedate", "commandedate", "status", "source_status", "sourcekey", "source_key",
]);

function optionForRecordType(recordType) {
  return RECORD_TYPE_OPTIONS.find((option) => option.value === recordType) || RECORD_TYPE_OPTIONS[0];
}

function readPipelineConfig(pipeline) {
  const raw = pipeline?.config ?? pipeline?.configJson ?? {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw && typeof raw === "object" ? raw : {};
}

function pipelineRecordType(pipeline) {
  const config = readPipelineConfig(pipeline);
  const raw = String(pipeline?.recordType || config.recordType || pipeline?.kind || config.kind || pipeline?.templateKey || config.templateKey || "INVOICE").toUpperCase();
  if (raw === "FACTURE" || raw === "INVOICE") return "INVOICE";
  if (raw === "COMMANDE") return "COMMANDE";
  return "OTHER";
}

function groupFieldLabel(field) {
  if (!field) return "";
  const text = String(field);
  return (text.includes(".") ? text.slice(text.lastIndexOf(".") + 1) : text).trim();
}

function groupFieldsForPipeline(pipeline, recordType) {
  const config = readPipelineConfig(pipeline);
  const configured = Array.isArray(config.groupByCols) && config.groupByCols.length > 0
    ? config.groupByCols
    : Array.isArray(config.groupCols) && config.groupCols.length > 0
      ? config.groupCols
      : [];
  if (configured.length > 0) return configured;
  return recordType === "COMMANDE" ? ["budgetCode"] : ["supplier", "label"];
}

function canonicalGroupField(field) {
  return groupFieldLabel(field).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

function valueForGroupField(field, form) {
  const key = canonicalGroupField(field);
  if (["supplier", "supplier_code", "suppliername", "vendor", "vendor_code", "fournisseur"].includes(key)) return form.supplier;
  if (["label", "category", "categoryname", "libelle"].includes(key)) return form.label;
  if (["budgetcode", "budget_code", "ligne_budgetaire", "budget", "centre", "article"].includes(key)) return form.budgetCode;
  if (["date", "document_date", "invoicedate", "commandedate"].includes(key)) return form.date;
  if (key === "amount") return form.amount;
  if (["status", "source_status"].includes(key)) return form.sourceStatus || form.status;
  if (["sourcekey", "source_key", "id", "reference", "invoice_ref", "commanderef"].includes(key)) return form.sourceKey || form.commandeRef || form.reference;
  return form.extra?.[field] ?? form.extra?.[groupFieldLabel(field)] ?? form[key] ?? "";
}

function isStandardGroupField(field) {
  return STANDARD_GROUP_FIELDS.has(canonicalGroupField(field));
}

export function ExplorerView() {
  const { tenant, isEngineAdmin } = useSession();
  const tenants = useAppSelector(selectTenants);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const [documentsByTenantId, setDocumentsByTenantId] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [extFilter, setExtFilter] = useState("all");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [sel, setSel] = useState(null);
  const [recordType, setRecordType] = useState("INVOICE");
  // Cascade filters: tenant (admin) → connector → pipeline. "" / "all" = no filter.
  const [selTenant, setSelTenant] = useState("");
  const [selConnector, setSelConnector] = useState("all");
  const [selPipeline, setSelPipeline] = useState("all");
  // Manual add to the selected pipeline.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Manual-add detection preview: score the entered document before saving.
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const tenantIds = useMemo(() => {
    if (isEngineAdmin) {
      const all = tenants.map(t => t.id);
      return selTenant ? all.filter(id => id === selTenant) : all;
    }
    return tenant?.id ? [tenant.id] : [];
  }, [isEngineAdmin, tenants, selTenant, tenant?.id]);

  const rows = useMemo(() => {
    return tenantIds.flatMap(tid => {
      const data = documentsByTenantId[tid] || [];
      return data
        .filter(row => (row.recordType || "INVOICE") === recordType)
        .map(row => ({ ...row, tenantId: row.tenantId || row.tenant_id || tid }));
    });
  }, [tenantIds, documentsByTenantId, recordType]);

  const pipelines = useMemo(() => {
    return tenantIds.flatMap(tid => (pipelinesByTenantId[tid] || []).map(p => ({ ...p, tenantId: p.tenantId || tid })));
  }, [tenantIds, pipelinesByTenantId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (isEngineAdmin) {
        try { await loadTenants(); } catch (error) { logError("explorer.loadTenants", error); }
      }
      if (tenantIds.length === 0) {
        if (mounted) { setSel(null); }
        return;
      }
      // Load documents and pipelines for the connector/pipeline filters + names.
      const entries = await Promise.all(tenantIds.map(async (tid) => {
        const [documents] = await Promise.all([
          loadDocumentsForTenant(tid, 1000).catch((error) => { logError("explorer.loadRows", error); return []; }),
          loadPipelinesForTenant(tid).catch((error) => logError("explorer.loadPipelines", error)),
        ]);
        return [tid, documents];
      }));
      if (!mounted) return;
      setDocumentsByTenantId(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      setSel(null);
    })();
    return () => { mounted = false; };
  }, [tenantIds, isEngineAdmin, reloadKey]);

  const recordTypeOption = optionForRecordType(recordType);
  const dataset = recordTypeOption.dataset;
  const isCommande = recordType === "COMMANDE";
  const isInvoice = recordType === "INVOICE";
  // Derived cascade options, scoped to the current record type.
  const kindPipelines = pipelines.filter(p => pipelineRecordType(p) === recordType);
  // Resolve a row's connector via its pipeline using ALL pipelines (not just the
  // current kind), so the connector filter still matches rows whose pipelineId
  // points at a pipeline missing from the kind list (e.g. a now-removed duplicate
  // from a pre-idempotency deploy). pipelineId → connectorId|null.
  const pipeConnector = new Map(pipelines.map(p => [p.id, p.connectorId || null]));
  const connectorMap = new Map();
  let hasCustomPipelines = false;
  kindPipelines.forEach(p => {
    if (p.connectorId) connectorMap.set(p.connectorId, p.connectorName || `ERP ${String(p.connectorId).slice(0, 8)}`);
    else hasCustomPipelines = true;
  });
  const connectorOptions = [...connectorMap.entries()].map(([id, name]) => ({ id, name }));
  const pipelineOptions = kindPipelines.filter(p =>
    selConnector === "all" ? true
      : selConnector === "none" ? !p.connectorId
        : p.connectorId === selConnector);
  const selectedPipeline = pipelines.find(p => p.id === selPipeline) || null;

  const manualGroupFields = selectedPipeline ? groupFieldsForPipeline(selectedPipeline, recordType) : [];
  const extraGroupFields = manualGroupFields.filter(field => field && !isStandardGroupField(field));
  const buildDocumentDto = () => {
    const f = addForm;
    const amount = f.amount ? Number(f.amount) : 0;
    const date = f.date || new Date().toISOString().slice(0, 10);
    const parts = manualGroupFields.map((field) => ({
      field,
      label: groupFieldLabel(field),
      value: valueForGroupField(field, f),
    }));
    const fallbackGroup = isCommande
      ? (f.budgetCode || f.supplier || f.commandeRef)
      : (f.supplier || f.label || f.sourceKey || f.reference);
    const groupKey = parts.length > 0
      ? parts.map(part => `${part.label}=${part.value != null ? String(part.value).trim() : ""}`).join("|")
      : `group=${fallbackGroup || "manual"}`;
    const groupLabel = parts.map(part => part.value).filter(value => value != null && String(value).trim() !== "").join(" · ") || fallbackGroup || "Manual";
    const extraFields = { ...(f.extra || {}) };
    if (isCommande) {
      parts.forEach((part) => {
        if (part.value == null || String(part.value).trim() === "") return;
        extraFields[part.field] = String(part.value).trim();
        extraFields[part.label] = String(part.value).trim();
      });
    }
    return {
      recordType,
      groupKey,
      groupLabel,
      amount,
      date,
      sourceKey: f.sourceKey || f.commandeRef || f.reference || undefined,
      sourceStatus: f.sourceStatus || f.status || undefined,
      budgetAxisKey: isCommande ? (f.budgetCode || undefined) : undefined,
      extraFields,
      ...(selectedPipeline?.tenantId ? { adminTenantId: selectedPipeline.tenantId } : {}),
    };
  };
  // Detection preview: score the document against its series WITHOUT saving, so the
  // user sees anomaly/clean (+ μ/max) before committing. Reuses the same engine as
  // the pipeline run and the custom-pipeline test tab.
  const checkScore = async () => {
    if (selPipeline === "all") return;
    setChecking(true); setAddError(""); setCheckResult(null);
    try {
      setCheckResult(await checkPipelineDocument(selPipeline, buildDocumentDto()));
    } catch (e) { setAddError(e.message || "Échec de la vérification du score"); }
    finally { setChecking(false); }
  };

  const submitAdd = async () => {
    if (selPipeline === "all" || !selectedPipeline) return;
    setAddSaving(true);
    setAddError("");
    try {
      // confirm scores + saves (status ANOMALY/ACTIVE), creates the anomaly +
      // alert when anomalous, and is counted in the budget realised on next read.
      await confirmPipelineDocument(selPipeline, buildDocumentDto());
      addAuditEntry?.({ action: "manual_add", entity: dataset, pipelineId: selPipeline });
      setShowAdd(false);
      setAddForm({});
      setCheckResult(null);
      setReloadKey(k => k + 1);
    } catch (e) {
      setAddError(e.message || "Échec de l'ajout");
    } finally {
      setAddSaving(false);
    }
  };

  if (!tenant && !isEngineAdmin) return null;
  const filtered = rows
    .filter((i) => {
      // Cascade scoping: tenant → connector → pipeline.
      if (selTenant && i.tenantId !== selTenant) return false;
      if (selPipeline !== "all" && i.pipelineId !== selPipeline) {
        // Legacy document DTOs may not include pipelineId. When a same-type
        // pipeline is selected, keep those rows visible instead of showing an
        // empty table; historical rows cannot be attributed more precisely.
        const legacySelectedPipeline = !i.pipelineId && selectedPipeline && pipelineRecordType(selectedPipeline) === recordType;
        if (!legacySelectedPipeline) return false;
      }
      if (selConnector !== "all") {
        // Prefer row connectorId when present, otherwise resolve through pipelineId.
        // Older/scheduled invoice rows may have connectorId=null even though their
        // pipeline is linked to the ERP connector.
        const conn = i.connectorId || pipeConnector.get(i.pipelineId) || null;
        // Legacy rows imported before connector metadata was exposed have neither
        // connectorId nor pipelineId in the DTO. If this tenant has a single ERP
        // connector option, keep those rows visible for that connector instead of
        // showing an empty table.
        if (!conn && !i.pipelineId && connectorOptions.length === 1 && connectorOptions[0].id === selConnector) return true;
        if (selConnector === "none" ? conn !== null : conn !== selConnector) return false;
      }
      // Document status is "anomaly" or active/etc. — "Normales" means "not an
      // anomaly", so treat anything that isn't an anomaly as normal.
      if (!isCommande && filter !== "all") {
        const isAnomaly = (i.status || "") === "anomaly";
        if (filter === "anomaly" && !isAnomaly) return false;
        if (filter === "normal" && isAnomaly) return false;
      }
      if (isInvoice && extFilter !== "all" && (i.extStatus || "") !== extFilter) return false;
      if (isCommande && filter !== "all" && (i.status || "") !== filter) return false;
      const ref = i.reference || i.invoice_ref || i.invoiceId || i.commandeRef || i.id || "";
      const name = i.supplier || i.supplierName || i.supplier_code || i.budgetCode || "";
      if (search && !`${ref} ${name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      const dateA = a.date || a.invoice_date || "";
      const dateB = b.date || b.invoice_date || "";
      const amtA = a.amount || a.orderedAmount || 0;
      const amtB = b.amount || b.orderedAmount || 0;
      const supA = a.supplier || a.supplierName || a.supplier_code || "";
      const supB = b.supplier || b.supplierName || b.supplier_code || "";
      if (sortKey === "date") cmp = dateA.localeCompare(dateB);
      if (sortKey === "amount") cmp = amtA - amtB;
      if (sortKey === "supplier") cmp = supA.localeCompare(supB);
      return sortDir === "asc" ? cmp : -cmp;
    });
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const SortIcon = ({ k }) =>
    sortKey === k ? <span className={styles.sortIcon}>{sortDir === "asc" ? "▲" : "▼"}</span> : null;
  const labels = isCommande
    ? { ref: "Référence commande", supplier: "Fournisseur", amount: "Montant commande", date: "Date commande", org: "Budget", extStatus: "Statut", status: "Budget" }
    : isInvoice
      ? { ref: "Référence facture", supplier: "Fournisseur", amount: "Montant", date: "Date facture", org: "Établissement", extStatus: "Statut externe", status: "Anomalie" }
      : { ref: "Référence document", supplier: "Groupe", amount: "Montant", date: "Date", org: "Source", extStatus: "Statut source", status: "Anomalie" };
  // Name of the current scope for the subtitle/footer — reflects the SELECTED
  // tenant in admin mode (not just the auth context, which is null for admins).
  const scopeName = isEngineAdmin
    ? (selTenant ? (tenants.find(t => t.id === selTenant)?.name || selTenant) : "Tous les tenants")
    : (tenant?.name || "Tous les tenants");
  // Anomaly score may arrive 0-1 (legacy) or 0-100 (engine) — normalise to a percent.
  const scorePct = (s) => { const n = Number(s) || 0; return n <= 1 ? n * 100 : n; };
  return (
    <div className={`fade-up ${styles.root}`}>
      <PageHeader
        eyebrow="Data"
        title="Explorateur"
        subtitle={`${filtered.length} ${filtered.length > 1 ? recordTypeOption.plural : recordTypeOption.singular} · ${scopeName}`}
      />
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={13} color={COLORS.grey400} className={styles.searchIcon} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={`input-field ${styles.searchInput}`} placeholder={isCommande ? "Commande, fournisseur, budget…" : "Référence, fournisseur…"} />
        </div>
        {RECORD_TYPE_OPTIONS.map((option) => (
          <button key={option.value} onClick={() => { setRecordType(option.value); setFilter("all"); setExtFilter("all"); setSelConnector("all"); setSelPipeline("all"); }} className={`${recordType === option.value ? "btn-primary" : "btn-ghost"} ${styles.filterBtn}`}>
            {option.label}
          </button>
        ))}
        {(isCommande ? ["all", "OVER_BUDGET", "ON_TRACK"] : ["all", "anomaly", "normal"]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`${filter === f ? "btn-primary" : "btn-ghost"} ${styles.filterBtn}`}>
            {f === "all" ? "Toutes" : f === "anomaly" ? "Anomalies" : f === "normal" ? "Normales" : f === "OVER_BUDGET" ? "Dépassement" : "OK budget"}
          </button>
        ))}
        {isInvoice && <select value={extFilter} onChange={(e) => setExtFilter(e.target.value)} className={`input-field ${styles.selectAuto}`}>
          <option value="all">Statut (tous)</option>
          {Object.entries(EXT_STATUS_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({k})</option>
          ))}
        </select>}
        {isEngineAdmin && (
          <select value={selTenant} onChange={(e) => { setSelTenant(e.target.value); setSelConnector("all"); setSelPipeline("all"); }} className={`input-field ${styles.selectAuto}`}>
            <option value="">Tenant (tous)</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
          </select>
        )}
        <select value={selConnector} onChange={(e) => { setSelConnector(e.target.value); setSelPipeline("all"); }} className={`input-field ${styles.selectAuto}`} title="Filtrer par connecteur ERP">
          <option value="all">Connecteur (tous)</option>
          {connectorOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          {hasCustomPipelines && <option value="none">Sans connecteur</option>}
        </select>
        <select value={selPipeline} onChange={(e) => setSelPipeline(e.target.value)} className={`input-field ${styles.selectAuto}`} title="Filtrer par pipeline">
          <option value="all">Pipeline (tous)</option>
          {pipelineOptions.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
        </select>
        <button className={`btn-primary ${styles.addBtn}`} disabled={selPipeline === "all"}
          title={selPipeline === "all" ? "Sélectionnez un pipeline pour ajouter manuellement" : "Ajouter manuellement"}
          onClick={() => { setAddForm({}); setAddError(""); setCheckResult(null); setShowAdd(true); }}>
          ＋ {recordTypeOption.singular.charAt(0).toUpperCase() + recordTypeOption.singular.slice(1)}
        </button>
        <button className={`btn-ghost ${styles.exportBtn}`}
          onClick={() => {
            downloadCSV(filtered.map(i => ({
              reference: i.reference || i.invoice_ref || i.commandeRef,
              fournisseur: i.supplier || i.supplierName,
              montant: i.amount || i.orderedAmount,
              tva: i.vatAmount,
              date: i.date || i.invoice_date || i.commandeDate,
              echeance: i.dueDate,
              budget: i.budgetCode || "",
              statut: i.status,
              type_anomalie: i.anomalyType || "",
              score: i.score || "",
              ext_statut: i.extStatus,
            })), `${dataset}-${tenant?.name || "tous-les-tenants"}-${new Date().toISOString().slice(0, 10)}.csv`);
            addAuditEntry("Export CSV", `Explorateur — ${filtered.length} ${recordTypeOption.plural} exportés`);
          }}
        ><Download size={13} /> Exporter CSV ({filtered.length})</button>
      </div>
      <div className={styles.contentLayout}>
        <div className={`glass-card ${styles.tableCard}`}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={`${styles.th} ${styles.thAlignLeft}`}>{labels.ref}</th>
                <th className={`${styles.th} ${styles.thSort} ${styles.thAlignLeft}`} onClick={() => toggleSort("supplier")}>{labels.supplier} <SortIcon k="supplier" /></th>
                <th className={`${styles.th} ${styles.thSort} ${styles.thAlignRight}`} onClick={() => toggleSort("amount")}>{labels.amount} <SortIcon k="amount" /></th>
                <th className={`${styles.th} ${styles.thSort} ${styles.thAlignLeft}`} onClick={() => toggleSort("date")}>{labels.date} <SortIcon k="date" /></th>
                <th className={`${styles.th} ${styles.thAlignLeft}`}>{labels.org}</th>
                <th className={`${styles.th} ${styles.thAlignLeft}`}>{labels.extStatus}</th>
                <th className={`${styles.th} ${styles.thAlignLeft}`}>{labels.status}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    Aucun document {recordTypeOption.singular} trouvé
                  </td>
                </tr>
              )}
              {filtered.slice(0, 1000).map((inv) => {
                const stCfg = isCommande ? { label: inv.status === "OVER_BUDGET" ? "Dépassement" : "OK", cls: inv.status === "OVER_BUDGET" ? "badge-red" : "badge-ok" } : EXT_STATUS_CFG[inv.extStatus || ""] || { label: inv.extStatus || "—", cls: "badge-mute" };
                const isSel = sel?.id === inv.id;
                return (
                  <tr key={inv.id || inv.invoice_ref} onClick={() => setSel(isSel ? null : inv)} className={`table-row${isSel ? " selected" : ""} ${styles.dataRow}`}>
                    <td className={styles.refCell}>{inv.reference || inv.invoice_ref || inv.commandeRef}</td>
                    <td className={styles.supplierCell}>{inv.supplier || inv.supplierName || inv.supplier_code || inv.groupLabel || inv.groupKey}</td>
                    <td className={styles.amountCell}>{(inv.amount || inv.orderedAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</td>
                    <td className={styles.dateCell}>{inv.date || inv.invoice_date || inv.commandeDate}</td>
                    <td className={styles.orgCell}>{isCommande ? inv.budgetCode : inv.establishment || inv.source || "—"}</td>
                    <td className={styles.badgeCell}><span className={`badge ${stCfg.cls}`}>{isCommande ? stCfg.label : inv.extStatus || "—"}</span></td>
                    <td className={styles.badgeCell}>
                      {isCommande ? <span className={`badge ${stCfg.cls}`}>{inv.status === "OVER_BUDGET" ? "À surveiller" : "Budget OK"}</span> : inv.status === "anomaly" ? (
                        <span className="badge badge-red">{inv.anomalyType || "Anomalie"} · {scorePct(inv.score).toFixed(0)}%</span>
                      ) : (
                        <span className="badge badge-ok">Normal</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sel && (
          <div className={`glass-card fade-in ${styles.detailPanel}`}>
            <div className={styles.detailHeader}>
              <div>
                <p className={styles.detailSupplier}>{sel.supplier || sel.supplierName || sel.groupLabel || sel.groupKey}</p>
                 <p className={styles.detailRef}>{sel.reference || sel.invoice_ref || sel.commandeRef}</p>
              </div>
              <button onClick={() => setSel(null)} className={`btn-icon ${styles.closeBtn}`}><Icon name="x" size={14} color={COLORS.grey500} /></button>
            </div>
            <div className={styles.detailBody}>
              <p className={styles.detailTitle}>Détails</p>
              {[
                [isCommande ? "Référence commande" : isInvoice ? "Référence facture" : "Référence document", sel.reference || sel.invoice_ref || sel.commandeRef],
                [isCommande || isInvoice ? "Fournisseur" : "Groupe", sel.supplier || sel.supplierName || sel.supplier_code || sel.groupLabel || sel.groupKey],
                ["Montant", `${(sel.amount || sel.orderedAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`],
                [isCommande ? "Date commande" : isInvoice ? "Date facture" : "Date", sel.date || sel.invoice_date || sel.commandeDate],
                ["Statut", sel.extStatus || sel.status],
                ...(sel.label ? [["Libellé", sel.label]] : []),
                ...(sel.budgetCode ? [["Code budget", sel.budgetCode]] : []),
                // Real captured source columns (e.g. centre_code, article_code) — dynamic, never hardcoded.
                ...Object.entries(sel.extraFields || {}).map(([k, v]) => [k, v]),
              ].filter(([, value]) => value != null && String(value).trim() !== "" && String(value) !== "—").map(([field, value]) => (
                <div key={field} className={styles.detailRow}>
                  <div className={styles.detailFieldWrap}>
                    <span className={styles.detailField}>{field}</span>
                  </div>
                  <span className={styles.detailValue}>{String(value)}</span>
                </div>
              ))}
              {sel.status === "anomaly" && (
                <div className={styles.anomalyBox}>
                  <p className={styles.anomalyTitle}>Anomalie détectée</p>
                  <p className={styles.anomalyTextTop}>Type : {sel.anomalyType || "—"}</p>
                  <p className={styles.anomalyText}>Score : {scorePct(sel.score).toFixed(0)}%</p>
                  {sel.explanation && <p className={styles.anomalyTextTop}>{sel.explanation}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <p className={styles.footer}>
        {filtered.length} {filtered.length > 1 ? recordTypeOption.plural : recordTypeOption.singular} · Source : {recordTypeOption.source} · Tenant <strong className={styles.footerTenant}>{scopeName}</strong>
      </p>

      {showAdd && (
        <div onClick={() => !addSaving && setShowAdd(false)} className={styles.overlay}>
          <div onClick={(e) => e.stopPropagation()} className={styles.modal}>
            <div className={styles.modalTitle}>Ajouter {isCommande || isInvoice ? "une" : "un"} {recordTypeOption.singular}</div>
            <div className={styles.modalSubtitle}>Pipeline : <strong>{selectedPipeline?.name || selPipeline}</strong></div>
            <div className={styles.modalForm}>
              {isCommande ? (
                <>
                  <Field label="Référence commande" value={addForm.commandeRef} onChange={(v) => setAddForm(f => ({ ...f, commandeRef: v }))} placeholder="ex: CMD-2025-001" />
                  <Field label="Fournisseur" value={addForm.supplier} onChange={(v) => setAddForm(f => ({ ...f, supplier: v }))} />
                  <Field label="Code budget" value={addForm.budgetCode} onChange={(v) => setAddForm(f => ({ ...f, budgetCode: v }))} />
                  <Field label="Montant (€)" type="number" value={addForm.amount} onChange={(v) => setAddForm(f => ({ ...f, amount: v }))} />
                  <Field label="Date" type="date" value={addForm.date} onChange={(v) => setAddForm(f => ({ ...f, date: v }))} />
                </>
              ) : (
                <>
                  <Field label={isInvoice ? "Fournisseur" : "Groupe"} value={addForm.supplier} onChange={(v) => setAddForm(f => ({ ...f, supplier: v }))} />
                  <Field label="Libellé" value={addForm.label} onChange={(v) => setAddForm(f => ({ ...f, label: v }))} />
                  <Field label="Montant (€)" type="number" value={addForm.amount} onChange={(v) => setAddForm(f => ({ ...f, amount: v }))} />
                  <Field label="Date" type="date" value={addForm.date} onChange={(v) => setAddForm(f => ({ ...f, date: v }))} />
                  {/* Group-by dimensions so the document resolves to its correct series. */}
                  {extraGroupFields.map(k => (
                    <Field key={k} label={k} value={addForm.extra?.[k] || ""} onChange={(v) => { setAddForm(f => ({ ...f, extra: { ...(f.extra || {}), [k]: v } })); setCheckResult(null); }} placeholder={`Dimension de série : ${k}`} />
                  ))}
                </>
              )}
            </div>
            {addError && <div className={styles.addError}>{addError}</div>}
            <div className={styles.scoreSection}>
              <button className={`btn-ghost ${styles.scoreBtn}`}
                onClick={checkScore} disabled={checking || !addForm.amount}>
                {checking ? "Analyse…" : "Vérifier le score (détection)"}
              </button>
              {checkResult && (() => {
                const isAnomaly = scorePct(checkResult.score) > 0;
                const aType = checkResult.anomaly_type ?? checkResult.anomalyType;
                const mu = checkResult.reference_mu ?? checkResult.referenceMu;
                const max = checkResult.max_acceptable ?? checkResult.maxAcceptable;
                return (
                  <div className={`${styles.detectionResult} ${isAnomaly ? styles.detectionResultAnomaly : styles.detectionResultNormal}`}>
                    <div className={`${styles.resultTitle} ${isAnomaly ? styles.cRed : styles.cSuccess}`}>
                      {isAnomaly ? `Anomalie détectée · score ${scorePct(checkResult.score).toFixed(0)}%` : "Document normal"}
                    </div>
                    {aType && <div className={styles.resultMeta}>Type : {aType}</div>}
                    {checkResult.explanation && <div className={styles.resultText}>{checkResult.explanation}</div>}
                    {(mu != null || max != null) && (
                      <div className={styles.resultMono}>
                        μ réf : {mu != null ? Number(mu).toLocaleString("fr-FR") : "—"} · max acceptable : {max != null ? Number(max).toLocaleString("fr-FR") : "—"}
                      </div>
                    )}
                    <div className={styles.resultFootnote}>Vous pouvez enregistrer dans les deux cas. Une alerte sera créée automatiquement si le document est anormal.</div>
                  </div>
                );
              })()}
            </div>
            {!checkResult && <div className={styles.scoreHint}>Le document est rattaché à une série existante du pipeline et scoré à l'enregistrement.</div>}
            <div className={styles.modalActions}>
              <button className={`btn-ghost ${styles.cancelBtn}`} onClick={() => setShowAdd(false)} disabled={addSaving}>Annuler</button>
              <button className={`btn-primary ${styles.saveBtn}`} onClick={submitAdd} disabled={addSaving}>{addSaving ? "Ajout…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
