import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesByTenantId } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadCommandesForTenant, loadInvoicesForTenant, loadPipelinesForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { downloadCSV } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { addAuditEntry } from "@/features/audit/model/auditActions";
import { createManualCommande } from "@/features/budget/api/BudgetApi";
import { checkPipelineInvoice, confirmPipelineInvoice } from "@/features/pipelines/api/pipelinesApi";
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

export function ExplorerView() {
  const { tenant, isEngineAdmin } = useSession();
  const tenants = useAppSelector(selectTenants);
  const invoicesByTenantId = useAppSelector((state) => state.documents.invoicesByTenantId);
  const commandesByTenantId = useAppSelector((state) => state.documents.commandesByTenantId);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [extFilter, setExtFilter] = useState("all");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [sel, setSel] = useState(null);
  const [dataset, setDataset] = useState("factures");
  // Cascade filters: tenant (admin) → connector → pipeline. "" / "all" = no filter.
  const [selTenant, setSelTenant] = useState("");
  const [selConnector, setSelConnector] = useState("all");
  const [selPipeline, setSelPipeline] = useState("all");
  // Manual add (facture/commande) to the selected pipeline.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Manual-add detection preview (facture): score the entered invoice before saving.
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
      const data = dataset === "commandes" ? commandesByTenantId[tid] || [] : invoicesByTenantId[tid] || [];
      return data.map(row => ({ ...row, tenantId: row.tenantId || row.tenant_id || tid }));
    });
  }, [tenantIds, dataset, commandesByTenantId, invoicesByTenantId]);

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
      // Load the dataset rows AND the tenant's pipelines (for the connector/pipeline filters + names).
      await Promise.all(tenantIds.flatMap(tid => [
        (dataset === "commandes" ? loadCommandesForTenant(tid) : loadInvoicesForTenant(tid, 1000)).catch((error) => logError("explorer.loadRows", error)),
        loadPipelinesForTenant(tid).catch((error) => logError("explorer.loadPipelines", error)),
      ]));
      if (!mounted) return;
      setSel(null);
    })();
    return () => { mounted = false; };
  }, [tenantIds, isEngineAdmin, dataset, reloadKey]);

  // Derived cascade options, scoped to the current dataset kind.
  const datasetKind = dataset === "commandes" ? "COMMANDE" : "FACTURE";
  const kindPipelines = pipelines.filter(p => (p.kind || "FACTURE") === datasetKind);
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

  // Custom group-by dimensions (beyond supplier/label) the entered invoice must
  // carry so it resolves to the SAME series/group the engine built.
  const STD_GROUP_KEYS = new Set(["supplier", "supplierName", "label", "amount", "date", "invoiceDate", "status"]);
  const extraGroupFields = dataset === "factures" && selectedPipeline?.config
    ? ((selectedPipeline.config.groupByCols || selectedPipeline.config.groupCols || []).filter(k => k && !STD_GROUP_KEYS.has(k)))
    : [];
  const buildInvoiceDto = () => {
    const f = addForm;
    const extraFields = {};
    extraGroupFields.forEach(k => { if (f.extra?.[k] != null && String(f.extra[k]).trim() !== "") extraFields[k] = String(f.extra[k]); });
    return {
      supplier: f.supplier || "", label: f.label || "",
      amount: f.amount ? Number(f.amount) : 0,
      date: f.date || new Date().toISOString().slice(0, 10),
      extraFields,
      ...(selectedPipeline?.tenantId ? { adminTenantId: selectedPipeline.tenantId } : {}),
    };
  };
  // Detection preview: score the invoice against its series WITHOUT saving, so the
  // user sees anomaly/clean (+ μ/max) before committing. Reuses the same engine as
  // the pipeline run and the custom-pipeline test tab.
  const checkScore = async () => {
    if (selPipeline === "all" || dataset !== "factures") return;
    setChecking(true); setAddError(""); setCheckResult(null);
    try {
      setCheckResult(await checkPipelineInvoice(selPipeline, buildInvoiceDto()));
    } catch (e) { setAddError(e.message || "Échec de la vérification du score"); }
    finally { setChecking(false); }
  };

  const submitAdd = async () => {
    if (selPipeline === "all" || !selectedPipeline) return;
    setAddSaving(true);
    setAddError("");
    const f = addForm;
    const targetTenant = selectedPipeline.tenantId;
    const amount = f.amount ? Number(f.amount) : 0;
    const date = f.date || new Date().toISOString().slice(0, 10);
    try {
      if (dataset === "commandes") {
        await createManualCommande(selPipeline, {
          commandeRef: f.commandeRef || "", supplier: f.supplier || "", budgetCode: f.budgetCode || "",
          orderedAmount: amount, commandeDate: date,
          ...(targetTenant ? { adminTenantId: targetTenant } : {}),
        });
      } else {
        // confirm scores + saves (status ANOMALY/ACTIVE), creates the anomaly +
        // alert when anomalous, and is counted in the budget realised on next read.
        await confirmPipelineInvoice(selPipeline, buildInvoiceDto());
      }
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
        // Legacy invoice DTOs may not include pipelineId. When a same-kind
        // pipeline is selected, keep those rows visible instead of showing an
        // empty table; historical rows cannot be attributed more precisely.
        const legacySelectedPipeline = !i.pipelineId && selectedPipeline && (selectedPipeline.kind || datasetKind) === datasetKind;
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
      // Invoice status is "anomaly" or "active"/etc. — "Normales" means "not an
      // anomaly", so treat anything that isn't an anomaly as normal. (Bug 4)
      if (dataset === "factures" && filter !== "all") {
        const isAnomaly = (i.status || "") === "anomaly";
        if (filter === "anomaly" && !isAnomaly) return false;
        if (filter === "normal" && isAnomaly) return false;
      }
      if (dataset === "factures" && extFilter !== "all" && (i.extStatus || "") !== extFilter) return false;
      if (dataset === "commandes" && filter !== "all" && (i.status || "") !== filter) return false;
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
  const labels = dataset === "commandes"
    ? { ref: "Référence commande", supplier: "Fournisseur", amount: "Montant commande", date: "Date commande", org: "Budget", extStatus: "Statut", status: "Budget" }
    : { ref: "Référence facture", supplier: "Fournisseur", amount: "Montant", date: "Date facture", org: "Établissement", extStatus: "Statut externe", status: "Anomalie" };
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
        subtitle={`${filtered.length} ${dataset === "commandes" ? "commande" : "facture"}${filtered.length > 1 ? "s" : ""} · ${scopeName}`}
      />
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={13} color={COLORS.grey400} className={styles.searchIcon} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={`input-field ${styles.searchInput}`} placeholder={dataset === "commandes" ? "Commande, fournisseur, budget…" : "Référence, fournisseur…"} />
        </div>
        {["factures", "commandes"].map((d) => (
          <button key={d} onClick={() => { setDataset(d); setFilter("all"); setSelConnector("all"); setSelPipeline("all"); }} className={`${dataset === d ? "btn-primary" : "btn-ghost"} ${styles.filterBtn}`}>
            {d === "factures" ? "Factures" : "Commandes"}
          </button>
        ))}
        {(dataset === "factures" ? ["all", "anomaly", "normal"] : ["all", "OVER_BUDGET", "ON_TRACK"]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`${filter === f ? "btn-primary" : "btn-ghost"} ${styles.filterBtn}`}>
            {f === "all" ? "Toutes" : f === "anomaly" ? "Anomalies" : f === "normal" ? "Normales" : f === "OVER_BUDGET" ? "Dépassement" : "OK budget"}
          </button>
        ))}
        {dataset === "factures" && <select value={extFilter} onChange={(e) => setExtFilter(e.target.value)} className={`input-field ${styles.selectAuto}`}>
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
          ＋ {dataset === "commandes" ? "Commande" : "Facture"}
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
            addAuditEntry("Export CSV", `Explorateur — ${filtered.length} ${dataset} exportées`);
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
                    Aucune {dataset === "commandes" ? "commande" : "facture"} trouvée
                  </td>
                </tr>
              )}
              {filtered.slice(0, 1000).map((inv) => {
                const stCfg = dataset === "commandes" ? { label: inv.status === "OVER_BUDGET" ? "Dépassement" : "OK", cls: inv.status === "OVER_BUDGET" ? "badge-red" : "badge-ok" } : EXT_STATUS_CFG[inv.extStatus || ""] || { label: inv.extStatus || "—", cls: "badge-mute" };
                const isSel = sel?.id === inv.id;
                return (
                  <tr key={inv.id || inv.invoice_ref} onClick={() => setSel(isSel ? null : inv)} className={`table-row${isSel ? " selected" : ""} ${styles.dataRow}`}>
                    <td className={styles.refCell}>{inv.reference || inv.invoice_ref || inv.commandeRef}</td>
                    <td className={styles.supplierCell}>{inv.supplier || inv.supplierName || inv.supplier_code}</td>
                    <td className={styles.amountCell}>{(inv.amount || inv.orderedAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</td>
                    <td className={styles.dateCell}>{inv.date || inv.invoice_date || inv.commandeDate}</td>
                    <td className={styles.orgCell}>{dataset === "commandes" ? inv.budgetCode : inv.establishment || "—"}</td>
                    <td className={styles.badgeCell}><span className={`badge ${stCfg.cls}`}>{dataset === "commandes" ? stCfg.label : inv.extStatus || "—"}</span></td>
                    <td className={styles.badgeCell}>
                      {dataset === "commandes" ? <span className={`badge ${stCfg.cls}`}>{inv.status === "OVER_BUDGET" ? "À surveiller" : "Budget OK"}</span> : inv.status === "anomaly" ? (
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
                <p className={styles.detailSupplier}>{sel.supplier || sel.supplierName}</p>
                 <p className={styles.detailRef}>{sel.reference || sel.invoice_ref || sel.commandeRef}</p>
              </div>
              <button onClick={() => setSel(null)} className={`btn-icon ${styles.closeBtn}`}><Icon name="x" size={14} color={COLORS.grey500} /></button>
            </div>
            <div className={styles.detailBody}>
              <p className={styles.detailTitle}>Détails</p>
              {[
                [dataset === "commandes" ? "Référence commande" : "Référence facture", sel.reference || sel.invoice_ref || sel.commandeRef],
                ["Fournisseur", sel.supplier || sel.supplierName || sel.supplier_code],
                ["Montant", `${(sel.amount || sel.orderedAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`],
                [dataset === "commandes" ? "Date commande" : "Date facture", sel.date || sel.invoice_date || sel.commandeDate],
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
        {filtered.length} {dataset === "commandes" ? "commande" : "facture"}{filtered.length > 1 ? "s" : ""} · Source : {dataset === "commandes" ? "COMMANDES" : "EPFTET"} · Tenant <strong className={styles.footerTenant}>{scopeName}</strong>
      </p>

      {showAdd && (
        <div onClick={() => !addSaving && setShowAdd(false)} className={styles.overlay}>
          <div onClick={(e) => e.stopPropagation()} className={styles.modal}>
            <div className={styles.modalTitle}>Ajouter une {dataset === "commandes" ? "commande" : "facture"}</div>
            <div className={styles.modalSubtitle}>Pipeline : <strong>{selectedPipeline?.name || selPipeline}</strong></div>
            <div className={styles.modalForm}>
              {dataset === "commandes" ? (
                <>
                  <Field label="Référence commande" value={addForm.commandeRef} onChange={(v) => setAddForm(f => ({ ...f, commandeRef: v }))} placeholder="ex: CMD-2025-001" />
                  <Field label="Fournisseur" value={addForm.supplier} onChange={(v) => setAddForm(f => ({ ...f, supplier: v }))} />
                  <Field label="Code budget" value={addForm.budgetCode} onChange={(v) => setAddForm(f => ({ ...f, budgetCode: v }))} />
                  <Field label="Montant (€)" type="number" value={addForm.amount} onChange={(v) => setAddForm(f => ({ ...f, amount: v }))} />
                  <Field label="Date" type="date" value={addForm.date} onChange={(v) => setAddForm(f => ({ ...f, date: v }))} />
                </>
              ) : (
                <>
                  <Field label="Fournisseur" value={addForm.supplier} onChange={(v) => setAddForm(f => ({ ...f, supplier: v }))} />
                  <Field label="Libellé" value={addForm.label} onChange={(v) => setAddForm(f => ({ ...f, label: v }))} />
                  <Field label="Montant (€)" type="number" value={addForm.amount} onChange={(v) => setAddForm(f => ({ ...f, amount: v }))} />
                  <Field label="Date" type="date" value={addForm.date} onChange={(v) => setAddForm(f => ({ ...f, date: v }))} />
                  {/* Group-by dimensions so the invoice resolves to its correct series. */}
                  {extraGroupFields.map(k => (
                    <Field key={k} label={k} value={addForm.extra?.[k] || ""} onChange={(v) => { setAddForm(f => ({ ...f, extra: { ...(f.extra || {}), [k]: v } })); setCheckResult(null); }} placeholder={`Dimension de série : ${k}`} />
                  ))}
                </>
              )}
            </div>
            {addError && <div className={styles.addError}>{addError}</div>}
            {dataset === "factures" && (
              <div className={styles.scoreSection}>
                <button className={`btn-ghost ${styles.scoreBtn}`}
                  onClick={checkScore} disabled={checking || !addForm.supplier || !addForm.amount}>
                  {checking ? "Analyse…" : "Vérifier le score (détection)"}
                </button>
                {checkResult && (() => {
                  const isAnomaly = (checkResult.score || 0) > 0;
                  const aType = checkResult.anomaly_type ?? checkResult.anomalyType;
                  const mu = checkResult.reference_mu ?? checkResult.referenceMu;
                  const max = checkResult.max_acceptable ?? checkResult.maxAcceptable;
                  return (
                    <div className={`${styles.detectionResult} ${isAnomaly ? styles.detectionResultAnomaly : styles.detectionResultNormal}`}>
                      <div className={`${styles.resultTitle} ${isAnomaly ? styles.cRed : styles.cSuccess}`}>
                        {isAnomaly ? `⚠ Anomalie détectée · score ${((checkResult.score || 0) * 100).toFixed(0)}%` : "✓ Facture normale"}
                      </div>
                      {aType && <div className={styles.resultMeta}>Type : {aType}</div>}
                      {checkResult.explanation && <div className={styles.resultText}>{checkResult.explanation}</div>}
                      {(mu != null || max != null) && (
                        <div className={styles.resultMono}>
                          μ réf : {mu != null ? Number(mu).toLocaleString("fr-FR") : "—"} · max acceptable : {max != null ? Number(max).toLocaleString("fr-FR") : "—"}
                        </div>
                      )}
                      <div className={styles.resultFootnote}>Vous pouvez enregistrer dans les deux cas. Une alerte sera créée automatiquement si la facture est anormale.</div>
                    </div>
                  );
                })()}
              </div>
            )}
            {dataset === "factures" && !checkResult && <div className={styles.scoreHint}>La facture est rattachée à une série existante du pipeline et scorée à l'enregistrement.</div>}
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
