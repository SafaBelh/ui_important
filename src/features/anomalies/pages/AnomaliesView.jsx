
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import "./AnomaliesView.module.css";
import {
  Check,
  Download,
  TriangleAlert,
  ShieldCheck,
  MousePointerClick,
  X,
  Filter,
  AlertCircle,
  TrendingUp,
  Activity,
  ChevronRight,
} from "lucide-react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useToast } from "@/contexts/toastContextValue";
import { useSession } from "@/features/auth/model/useSession";
import { selectPartnersByTenantId } from "@/features/partners/model/partnerSelectors";
import { selectPipelinesByTenantId } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadPartnersForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { CONNECTOR_LABELS } from "@/constants/uiConstants";
import { downloadCSV } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { addAuditEntry } from "@/features/audit/model/auditActions";
import { getAnomalies, getAnomalyAggregate, getAnomalyDistribution, sendAnomalyFeedback } from "@/features/anomalies/api/AnomaliesApi";
import { logError } from "@/shared/utils/logError";

/* ─── helpers (unchanged) ─────────────────────────────────── */
const typeColor = (t) =>
  t === "montant" || t === "AMOUNT" || t === "AMOUNT_SPIKE" ? "#fb7185" :
    t === "doublon" || t === "DUPLICATE" ? "#fbbf24" : "#60a5fa";

const typeToneClass = (t) =>
  t === "montant" || t === "AMOUNT" || t === "AMOUNT_SPIKE" ? "anm-type-amount" :
    t === "doublon" || t === "DUPLICATE" ? "anm-type-duplicate" : "anm-type-default";

const scoreToneClass = (s) =>
  s >= 0.9 ? "anm-score-critical" : s >= 0.8 ? "anm-score-warning" : "anm-score-info";

const fmtAmount = (v) =>
  (v || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const anomalySupplierLabel = (a) =>
  a?.supplier || a?.supplierName || a?.invoiceSupplier || a?.seriesSupplier || a?.seriesName || a?.supplier_code || "—";

const anomalyAmountLabel = (a) =>
  a?.anomalyType === "MISSING" ? "Facture manquante" : fmtAmount(a?.actualAmount ?? a?.amount);

const severityOf = (a) => {
  if (a.severity) return String(a.severity).toLowerCase();
  const score = a.score ?? a.anomalyScore ?? 0;
  return score >= 0.9 ? "critical" : score >= 0.8 ? "warning" : "info";
};

const friendlyType = (t) =>
  t === "AMOUNT_SPIKE" || t === "AMOUNT" || t === "montant" ? "Montant" :
    t === "DUPLICATE" || t === "doublon" ? "Doublon" :
      t === "MISSING" ? "Manquante" : t || "Inconnu";

const connectorLabel = (connectorId) => {
  if (!connectorId) return "Sans ERP";
  return CONNECTOR_LABELS[connectorId] || connectorId;
};


/* ─── sub-components ─────────────────────────────────────── */

const AnomalyRow = memo(function AnomalyRow({ anomaly, isSelected, onClick, onInfo }) {
  const sc = anomaly.score || 0;
  const tColor = typeColor(anomaly.anomalyType);
  const typeTone = typeToneClass(anomaly.anomalyType);
  const scoreTone = scoreToneClass(sc);

  return (
    // Row is a clickable container, not a <button>, so the inner info <button>
    // is valid HTML (a button cannot be nested in a button).
    <div
      role="button"
      tabIndex={0}
      className={`anm-row ${scoreTone}${isSelected ? " selected" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      {/* type icon */}
      <div className={`anm-row-icon ${typeTone}`}>
        <TriangleAlert size={15} color={tColor} strokeWidth={2.5} />
      </div>

      {/* content */}
      <div className="anm-row-content">
        <div className="anm-row-supplier">
          {anomalySupplierLabel(anomaly)}
        </div>
        <div className="anm-row-meta">
          <span className={`anm-type-tag ${typeTone}`}>
            {friendlyType(anomaly.anomalyType)}
          </span>
          <span className="anm-meta-dot">·</span>
          <span className="anm-row-amount">{anomalyAmountLabel(anomaly)}</span>
          {(anomaly.detectedAt || anomaly.detectionDate) && (
            <>
              <span className="anm-meta-dot">·</span>
              <span className="anm-row-date">{anomaly.detectedAt || anomaly.detectionDate}</span>
            </>
          )}
        </div>
      </div>

      {/* info btn */}
      <button
        className="anm-info-btn"
        onClick={(e) => { e.stopPropagation(); onInfo(); }}
        title="Explication"
      >?</button>

      {/* score */}
      <div className={`anm-score-badge ${scoreTone}`}>
        <span className="anm-score-num">{(sc * 100).toFixed(0)}%</span>
        <span className="anm-score-label">Score</span>
      </div>

      <ChevronRight size={13} color="rgba(100,116,139,.45)" />
    </div>
  );
});

function DetailCell({ label, value, accentClass }) {
  return (
    <div className="anm-detail-cell">
      <span className="anm-cell-label">{label}</span>
      <span className={`anm-cell-value${accentClass ? ` ${accentClass}` : ""}`}>{value}</span>
    </div>
  );
}

function EmptyList() {
  return (
    <div className="anm-empty">
      <div className="anm-empty-icon anm-empty-icon-success">
        <ShieldCheck size={26} color="#34d399" strokeWidth={2} />
      </div>
      <div>
        <div className="anm-empty-title">Aucune anomalie détectée</div>
        <div className="anm-empty-sub">Votre pipeline est sain. Les anomalies apparaîtront ici dès leur détection.</div>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="anm-empty anm-empty-detail">
      <div className="anm-empty-icon anm-empty-icon-neutral">
        <MousePointerClick size={22} color="#6b7280" strokeWidth={1.8} />
      </div>
      <div>
        <div className="anm-empty-title anm-empty-title-small">Sélectionnez une anomalie</div>
        <div className="anm-empty-sub">Le détail et le graphique s'afficheront ici</div>
      </div>
    </div>
  );
}

/* ─── main view ─────────────────────────────────────────── */
export function AnomaliesView() {
  const toast = useToast();
  const { tenant, isEngineAdmin } = useSession();
  const [selected, setSelected] = useState(null);
  const [kFactor] = useState(3.0);
  const [showExplain, setShowExplain] = useState(null);
  const [rawAnomalies, setRawAnomalies] = useState([]);
  // Backend-computed distribution (median/MAD/band/points) + header aggregate.
  const [distribution, setDistribution] = useState(null);
  const [aggregate, setAggregate] = useState({ count: 0, avgScore: 0, totalAmount: 0 });
  const [adminTenantFilter, setAdminTenantFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [query, setQuery] = useState("");

  const tenants = useAppSelector(selectTenants);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const partnersByTenantId = useAppSelector(selectPartnersByTenantId);
  const allTenants = useMemo(() => {
    if (!isEngineAdmin) return [];
    return tenants;
  }, [isEngineAdmin, tenants]);

  useEffect(() => {
    if (isEngineAdmin) loadTenants().catch((error) => logError("anomalies.loadTenants", error));
  }, [isEngineAdmin]);

  const tenantIds = useMemo(() => {
    if (tenant?.id) return [tenant.id];
    if (adminTenantFilter) return [adminTenantFilter];
    return allTenants.map((t) => t.id);
  }, [tenant?.id, adminTenantFilter, allTenants]);

  const tenantIdsKey = tenantIds.join(",");
  useEffect(() => {
    if (!tenantIdsKey) return;
    tenantIdsKey.split(",").forEach(id => loadPartnersForTenant(id).catch((error) => logError("anomalies.loadPartners", error)));
  }, [tenantIdsKey]);

  const allPipelines = useMemo(
    () => tenantIds.flatMap((tenantId) => (pipelinesByTenantId[tenantId] || []).map((p) => ({ ...p, tenantId }))),
    [tenantIds, pipelinesByTenantId]
  );

  const allErps = useMemo(() => {
    const byId = new Map();
    tenantIds.forEach((tenantId) => {
      (partnersByTenantId[tenantId] || []).forEach((p) => {
        if (p.connectorId) byId.set(p.connectorId, p.name || connectorLabel(p.connectorId));
      });
    });
    allPipelines.forEach((p) => {
      if (p.connectorId && !byId.has(p.connectorId)) byId.set(p.connectorId, connectorLabel(p.connectorId));
    });
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [tenantIds, allPipelines, partnersByTenantId]);

  useEffect(() => {
    if (!tenant?.id && !isEngineAdmin) return;
    // Engine admins must impersonate each business tenant (adminTenantId →
    // X-Tenant-ID), otherwise the backend resolves the ADMIN tenant — which owns
    // no anomalies — and the page shows 0 even though anomalies exist.
    const ids = tenantIds.length ? tenantIds : (tenant?.id ? [tenant.id] : []);
    if (ids.length === 0) { setRawAnomalies([]); return; }
    Promise.all(
      ids.map((id) =>
        getAnomalies(isEngineAdmin ? { size: 100, adminTenantId: id } : { size: 100 })
          .then((res) => res?.content || [])
          .catch(() => [])
      )
    )
      .then((lists) => {
        // The backend DTO carries the linked invoice as invoiceSupplier/invoiceAmount;
        // the UI reads supplier/amount/actualAmount — alias them so amount anomalies
        // show the real supplier and montant instead of "—" / 0 €.
        const merged = lists.flat().map((a) => ({
          ...a,
          supplier: a.supplier || a.supplierName || a.invoiceSupplier || a.seriesSupplier || a.seriesName || a.supplier_code || "",
          amount: a.amount ?? a.invoiceAmount ?? 0,
          actualAmount: a.actualAmount ?? a.invoiceAmount ?? a.amount ?? 0,
          // Backend score is 0–100; the UI treats score as 0–1 (×100 for display and
          // threshold classes). Normalise once so 100 → "100%". (A)
          score: a.score != null && a.score > 1 ? a.score / 100 : a.score,
        }));
        const scopedItems = merged.filter((a) => !tenantIds.length || tenantIds.includes(a.tenantId));
        setRawAnomalies(scopedItems);
      })
      .catch((err) => console.error("Failed to fetch anomalies:", err));
  }, [tenant?.id, isEngineAdmin, tenantIds]);

  const anomalies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawAnomalies.filter((a) => {
      const supplier = a.supplier || a.supplierName || a.supplier_code || "";
      const ref = a.invoiceRef || a.reference || a.invoiceId || a.id || "";
      if (adminTenantFilter && a.tenantId !== adminTenantFilter) return false;
      if (erpFilter && a.connectorId !== erpFilter) return false;
      if (pipelineFilter && a.pipelineId !== pipelineFilter) return false;
      if (typeFilter && a.anomalyType !== typeFilter) return false;
      if (severityFilter && severityOf(a) !== severityFilter) return false;
      if (supplierFilter && supplier !== supplierFilter) return false;
      if (q && !`${supplier} ${ref} ${a.anomalyType || ""} ${a.pipelineName || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rawAnomalies, adminTenantFilter, erpFilter, pipelineFilter, typeFilter, severityFilter, supplierFilter, query]);

  const typeOptions = useMemo(() => Array.from(new Set(rawAnomalies.map((a) => a.anomalyType).filter(Boolean))), [rawAnomalies]);
  const supplierOptions = useMemo(() => Array.from(new Set(rawAnomalies.map((a) => a.supplier || a.supplierName || a.supplier_code).filter(Boolean))).sort(), [rawAnomalies]);

  useEffect(() => { setSelected(null); }, [adminTenantFilter, erpFilter, pipelineFilter, typeFilter, severityFilter, supplierFilter, query]);

  // "Zone habituelle" distribution comes fully from the backend (median/MAD/band/points)
  // for the selected anomaly's series — same tenant scope as the detail. No client stats.
  useEffect(() => {
    if (!selected) { setDistribution(null); return; }
    let live = true;
    const params = (isEngineAdmin && selected.tenantId) ? { adminTenantId: selected.tenantId } : {};
    getAnomalyDistribution(selected.id, params)
      .then((res) => { if (live) setDistribution(res || null); })
      .catch((error) => { logError("anomalies.loadDistribution", error); if (live) setDistribution(null); });
    return () => { live = false; };
  }, [selected, isEngineAdmin]);

  // Header KPIs (avg score, total amount) — backend aggregate per visible tenant,
  // honouring the same type/severity filters as the list; combined for "all tenants".
  useEffect(() => {
    if (!tenant?.id && !isEngineAdmin) return;
    const ids = tenantIds.length ? tenantIds : (tenant?.id ? [tenant.id] : []);
    if (ids.length === 0) { setAggregate({ count: 0, avgScore: 0, totalAmount: 0 }); return; }
    const f = {};
    if (typeFilter) f.type = typeFilter;
    if (severityFilter) f.severity = severityFilter;
    Promise.all(ids.map((id) =>
      getAnomalyAggregate(isEngineAdmin ? { ...f, adminTenantId: id } : f)
        .then((r) => r || {}).catch(() => ({}))
    )).then((parts) => {
      // Combine pre-aggregated per-tenant results (not raw rows).
      let count = 0, total = 0, scoreSum = 0;
      for (const r of parts) {
        const c = r.count || 0; count += c; total += r.totalAmount || 0; scoreSum += (r.avgScore || 0) * c;
      }
      setAggregate({ count, avgScore: count ? scoreSum / count : 0, totalAmount: total });
    });
  }, [tenant?.id, isEngineAdmin, tenantIds, typeFilter, severityFilter]);

  const handleFeedback = useCallback(async (id, type) => {
    const anomaly = anomalies.find((a) => a.id === id);
    const decision = type === "false_positive" ? "REJECTED" : "CONFIRMED";
    try { await sendAnomalyFeedback(id, decision); } catch (e) { console.error("Feedback failed:", e); }
    if (type === "false_positive") {
      toast(`Faux positif signalé pour ${anomaly?.invoiceRef || anomaly?.id || id}`, "info");
      addAuditEntry("Faux positif", `${anomaly?.invoiceRef || anomaly?.id || id}`);
    } else {
      toast("Anomalie confirmée. Alerte envoyée.", "success");
      addAuditEntry("Anomalie confirmée", `${anomaly?.invoiceRef || anomaly?.id || id} — ${anomaly?.anomalyType || ""}`);
    }
  }, [anomalies, toast]);

  useEffect(() => {
    const h = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!selected) return;
      if (e.key === "f" || e.key === "F") handleFeedback(selected.id, "confirmed");
      if (e.key === "d" || e.key === "D") handleFeedback(selected.id, "false_positive");
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleFeedback, selected]);

  if (!tenant && !isEngineAdmin) return null;

  // All from the backend distribution — no client median/MAD/bounds.
  const madResult = selected && distribution ? {
    median: distribution.median || 0,
    mad: distribution.mad || 0,
    upperBound: distribution.high || 0,
    lowerBound: distribution.low || 0,
  } : null;

  const minInvoiceCount = Math.round(kFactor);

  const chartData = (distribution?.points || []).map((p) => ({
    index: p.index, montant: p.amount || 0, isAnomaly: !!p.isAnomaly,
  }));

  // Header KPIs from the backend aggregate (avgScore is 0..100 → /100 for display/color).
  const avgScore = (aggregate.avgScore || 0) / 100;
  const totalAmount = aggregate.totalAmount || 0;
  const hasFilters = adminTenantFilter || erpFilter || pipelineFilter || typeFilter || severityFilter || supplierFilter || query;

  return (
    <div className="anomalies-root">

      {/* ── HEADER ── */}
      <div className="anm-header">
        <div>
          <div className="anm-eyebrow">Monitoring · Détection IA</div>
          <h1 className="anm-title">Anomalies détectées</h1>
          <div className="anm-subtitle">
            {tenant?.name || (adminTenantFilter ? allTenants.find(t => t.id === adminTenantFilter)?.name || adminTenantFilter : "Tous les tenants")}
            {" · "}
            {anomalies.length}/{rawAnomalies.length} anomalie{rawAnomalies.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* stat pills in header */}
        {anomalies.length > 0 && (
          <div className="anm-stats">
            <div className="anm-stat">
              <span className="anm-stat-label">Total</span>
              <span className="anm-stat-value anm-text-default">{anomalies.length}</span>
            </div>
            <div className="anm-stat">
              <span className="anm-stat-label">Score moyen</span>
              <span className={`anm-stat-value ${scoreToneClass(avgScore)}`}>
                {(avgScore * 100).toFixed(0)}%
              </span>
            </div>
            <div className="anm-stat">
              <span className="anm-stat-label">Montant total</span>
              <span className="anm-stat-value anm-stat-value-amount anm-text-default">
                {fmtAmount(totalAmount)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── FILTERS ── */}
      <div className="anm-filters">
        <span className="anm-filter-label">
          <Filter size={11} />
          Filtres
        </span>

        {!tenant && isEngineAdmin && allTenants.length > 0 && (
          <select value={adminTenantFilter} onChange={(e) => { setAdminTenantFilter(e.target.value); setErpFilter(""); setPipelineFilter(""); }} className="anm-select">
            <option value="">Tous les tenants</option>
            {allTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select value={erpFilter} onChange={(e) => { setErpFilter(e.target.value); setPipelineFilter(""); }} className="anm-select">
          <option value="">Tous les ERP</option>
          {allErps.map((erp) => <option key={erp.id} value={erp.id}>{erp.name}</option>)}
        </select>
        <select value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)} className="anm-select">
          <option value="">Tous les pipelines</option>
          {allPipelines.filter((p) => !erpFilter || p.connectorId === erpFilter).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="anm-select">
          <option value="">Tous les types</option>
          {typeOptions.map((type) => <option key={type} value={type}>{friendlyType(type)}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="anm-select">
          <option value="">Toutes criticités</option>
          <option value="critical">Critique</option>
          <option value="warning">À surveiller</option>
          <option value="info">Info</option>
        </select>
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="anm-select">
          <option value="">Tous fournisseurs</option>
          {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="anm-input anm-input-search"
        />
        {hasFilters && (
          <button className="anm-reset" onClick={() => { setAdminTenantFilter(""); setErpFilter(""); setPipelineFilter(""); setTypeFilter(""); setSeverityFilter(""); setSupplierFilter(""); setQuery(""); }}>
            × Réinitialiser
          </button>
        )}
        <span className="anm-filter-count">
          {anomalies.length}/{rawAnomalies.length}
        </span>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="anm-grid">

        {/* LEFT — list */}
        <div className="anm-list-col">
          <div className="anm-list-header">
            <span className="anm-list-title">
              <TriangleAlert size={12} color="#fb7185" />
              Anomalies
              <span className="anm-count-badge">{anomalies.length}</span>
            </span>
            <button
              className="anm-csv-btn"
              onClick={() => {
                downloadCSV(
                  anomalies.map((a) => ({
                    id: a.id,
                    fournisseur: a.supplier || a.supplierName,
                    montant: a.actualAmount || a.amount,
                    type: a.anomalyType,
                    score: a.score,
                    date: a.detectedAt || a.detectionDate,
                  })),
                  `anomalies-${tenant?.name || "global"}-${new Date().toISOString().slice(0, 10)}.csv`
                );
                addAuditEntry("Export CSV", `Anomalies — ${anomalies.length} lignes exportées`);
              }}
            >
              <Download size={11} />
              CSV
            </button>
          </div>

          {anomalies.length === 0 ? (
            <EmptyList />
          ) : (
            <div className="anm-list-stack">
              {anomalies.map((a) => (
                <AnomalyRow
                  key={a.id}
                  anomaly={a}
                  isSelected={selected?.id === a.id}
                  onClick={() => setSelected(a)}
                  onInfo={() => setShowExplain(showExplain === a.id ? null : a.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — detail */}
        <div className="anm-detail-col">
          {selected && madResult ? (
            <>
              {/* detail card */}
              <div
                className={`anm-detail-card ${scoreToneClass(selected.score || 0)}`}
              >
                <div className="anm-detail-header">
                  <div>
                    <div className="anm-detail-eyebrow">Fournisseur</div>
                    <div className="anm-detail-supplier">
                      {anomalySupplierLabel(selected)}
                    </div>
                  </div>
                  <button className="anm-close" onClick={() => setSelected(null)}>
                    <X size={14} />
                  </button>
                </div>

                <div className="anm-detail-grid">
                  <DetailCell label="Identifiant" value={selected.id} />
                  <DetailCell label={selected.anomalyType === "MISSING" ? "Événement détecté" : "Montant détecté"} value={anomalyAmountLabel(selected)} />
                  <DetailCell label="Score" value={`${((selected.score || 0) * 100).toFixed(0)}%`} accentClass={scoreToneClass(selected.score || 0)} />
                  <DetailCell label="Médiane référence" value={`${madResult.median.toFixed(2)} €`} />
                  <DetailCell label="Écart habituel" value={madResult.mad.toFixed(2)} />
                  <DetailCell label="Minimum factures" value={`${minInvoiceCount} fact.`} accentClass="anm-text-blue" />
                </div>
              </div>

              {/* chart card */}
              <div className="anm-chart-card">
                <div className="anm-chart-title">
                  <Activity size={12} />
                  Répartition des montants — zone habituelle
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,.16)" />
                    <XAxis dataKey="index" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v) => [`${Number(v).toFixed(2)} €`, "Montant"]}
                    />
                    <ReferenceArea y1={madResult.lowerBound} y2={madResult.upperBound} fill="#fb7185" fillOpacity={0.05} />
                    <ReferenceLine y={madResult.median} stroke="#fb7185" strokeDasharray="5 5" strokeWidth={1.5} />
                    <ReferenceLine y={madResult.upperBound} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={1} />
                    <ReferenceLine y={madResult.lowerBound} stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={1} />
                    <Scatter dataKey="montant" data={chartData.filter((d) => !d.isAnomaly)} fill="#fb7185" fillOpacity={0.6} />
                    <Scatter dataKey="montant" data={chartData.filter((d) => d.isAnomaly)} fill="#fbbf24" shape="diamond" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* actions card */}
              <div className="anm-actions-card">
                <span className="anm-actions-label">Actions</span>
                <button
                  className="anm-action-btn anm-action-confirm"
                  onClick={() => handleFeedback(selected.id, "confirmed")}
                >
                  <Check size={13} strokeWidth={3} />
                  Confirmer l'anomalie
                </button>
                <button
                  className="anm-action-btn anm-action-fp"
                  onClick={() => handleFeedback(selected.id, "false_positive")}
                >
                  <ShieldCheck size={13} strokeWidth={2.5} />
                  Faux positif
                </button>
                <div className="anm-shortcuts">
                  <span className="anm-kbd">F</span>
                  <span className="anm-shortcut-label">confirmer</span>
                  <span className="anm-divider" />
                  <span className="anm-kbd">D</span>
                  <span className="anm-shortcut-label">rejeter</span>
                </div>
              </div>
            </>
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}
