import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import styles from "./BudgetView.module.css";
import { COLORS } from "@/constants/colors";
import ErpAnalysisTabs from "@/features/budget/components/ErpAnalysisTabs";
import { EMPTY_INVOICES, EMPTY_COMMANDES, HEAT_LEVELS, HEAT_BLUE, formatCurrency, formatCompactCurrency, SPEC_INVOICE_BUDGETS, seriesNameForInvoice, CURRENT_EXERCISE_YEAR, DATA_YEAR, CURRENT_MONTH_IDX, STATUS_META, computeSeasonalRisks } from "@/features/budget/utils/budgetHelpers";
import { SectionNum, SectionLabel, StatusPill, KpiTile, MonthlyBarsChart, TrendAreaChart, BudgetAlertsBanner, SeasonalRiskBanner } from "@/features/budget/components/BudgetWidgets";
import { GlobalAdminDashboard, SeriesBudgetPanel, GlobalBudgetTable, SimulationPanel, CommandesBudgetPanel, BudgetConnectorBar, ErpBudgetPanel } from "@/features/budget/components/BudgetPanels";

import { useSession } from "@/features/auth/model/useSession";
import { selectCommandesForTenant, selectInvoicesForTenant } from "@/features/documents/model/documentSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadCommandesForTenant, loadInvoicesForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { getBudgetConnectors, getBudgetOverview, getBudgetSeriesAnalysis } from "@/features/budget/api/BudgetApi";
import { logError } from "@/shared/utils/logError";
import { BarChart3, Brain, Flag, Lightbulb, Search, TriangleAlert, Waves, Globe, TrendingUp, TrendingDown, AlertTriangle, Building2, ChevronRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";


const BUDGET_TABS = [
  { id: "suivi", label: "Suivi budgétaire" },
  { id: "alertes", label: "Alertes" },
  { id: "serie", label: "Analyse par série" },
  { id: "simulation", label: "Simulation budget" },
  { id: "commandes", label: "Budget Commandes" },
  { id: "engage", label: "Engagé" },
  { id: "liquide", label: "Liquidé" },
  { id: "synthese", label: "Synthèse globale" },
  { id: "previsions", label: "Prévisions" },
  { id: "facture-analyse", label: "Analyse budget facture" },
  { id: "commande-analyse", label: "Analyse budget commande" },
];
// ERP-driven budget intelligence tabs (GET /budget/analysis) — rendered by
// ErpAnalysisTabs instead of the invoice-based panels below.
const ANALYSIS_TABS = new Set(["engage", "liquide", "synthese", "previsions"]);
// Legacy local-budget tabs, hidden when an ERP budget connector is active.
const LEGACY_BUDGET_TABS = new Set(["serie", "simulation", "commandes"]);
// New backend-aggregated series-analysis tabs (shown ONLY in ERP-connector mode).
const SERIES_ANALYSIS_TABS = new Set(["facture-analyse", "commande-analyse"]);


/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────── */
export function BudgetView() {
  const { tenant, isEngineAdmin } = useSession();
  const [tab, setTab] = useState("suivi");
  const [customBudgets, setCustomBudgets] = useState({});
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [seriesBudgetInput, setSeriesBudgetInput] = useState("");
  const [flaggedSuppliers, setFlaggedSuppliers] = useState(new Set());
  const [adminTenantId, setAdminTenantId] = useState(() => isEngineAdmin ? tenant?.id || "" : "");
  // Budget is connector-scoped: a tenant may run several ERP connectors with
  // different budget models. null connectorId + "consolidated" mode = explicit
  // merged view; otherwise one connector must be chosen.
  const [budgetConnectors, setBudgetConnectors] = useState([]);
  const [budgetConnectorId, setBudgetConnectorId] = useState(null);
  const [budgetMode, setBudgetMode] = useState(null);
  // True while GET /budget/connectors is in flight. Until it resolves we cannot
  // tell "no ERP budget" from "not loaded yet" (both are connectors.length === 0),
  // so the frontend non-ERP panels must wait rather than flash then vanish.
  const [connectorsLoading, setConnectorsLoading] = useState(false);

  const tenants = useAppSelector(selectTenants);
  const invoicesByTenantId = useAppSelector((state) => state.documents.invoicesByTenantId);
  const adminTenants = useMemo(() => isEngineAdmin ? tenants : [], [isEngineAdmin, tenants]);

  useEffect(() => {
    if (isEngineAdmin) loadTenants().catch((error) => logError("budget.loadTenants", error));
  }, [isEngineAdmin]);

  useEffect(() => {
    if (!isEngineAdmin) return;
    setAdminTenantId(tenant?.id || "");
  }, [isEngineAdmin, tenant?.id]);

  // When admin selects a tenant (from dropdown OR by clicking in GlobalAdminDashboard)
  const handleSelectTenant = useCallback((tenantId) => {
    setAdminTenantId(tenantId);
    setSelectedSeries(null);
    setSeriesBudgetInput("");
    setTab("suivi");
  }, []);

  const selectedTenantId = isEngineAdmin ? adminTenantId : tenant?.id;
  const selectedInvoices = useAppSelector((state) => selectInvoicesForTenant(state, selectedTenantId));
  const selectedCommandes = useAppSelector((state) => selectCommandesForTenant(state, selectedTenantId));
  const selectedTenantName = isEngineAdmin
    ? (adminTenantId ? adminTenants.find(t => t.id === adminTenantId)?.name : "Tous les tenants")
    : tenant?.name;

  // Load the tenant's budget-enabled connectors for the scope selector; auto-
  // select when there is exactly one (no forced choice for the common case).
  useEffect(() => {
    if (!selectedTenantId) { setBudgetConnectors([]); setBudgetConnectorId(null); setBudgetMode(null); setConnectorsLoading(false); return; }
    let live = true;
    setConnectorsLoading(true);
    const params = isEngineAdmin ? { adminTenantId: selectedTenantId } : {};
    getBudgetConnectors(params)
      .then(res => {
        if (!live) return;
        const list = res?.budgetConnectors || [];
        setBudgetConnectors(list);
        setBudgetMode(null);
        setBudgetConnectorId(list.length === 1 ? list[0].connectorId : null);
      })
      .catch((error) => { logError("budget.loadConnectors", error); if (live) { setBudgetConnectors([]); setBudgetConnectorId(null); } })
      .finally(() => { if (live) setConnectorsLoading(false); });
    return () => { live = false; };
  }, [selectedTenantId, isEngineAdmin]);

  // Show global admin dashboard when admin and no tenant selected
  const showGlobalDashboard = isEngineAdmin && !adminTenantId;

  const adminTenantsKey = adminTenants.map(t => t.id).join(",");
  useEffect(() => {
    if (!showGlobalDashboard || !adminTenantsKey) return;
    adminTenantsKey.split(",").forEach(id => loadInvoicesForTenant(id).catch((error) => logError("budget.loadAdminTenantInvoices", error)));
  }, [showGlobalDashboard, adminTenantsKey]);
  const allTenantInvoices = useMemo(
    () => adminTenants.flatMap(t => (invoicesByTenantId[t.id] || []).map(i => ({ ...i, tenantId: i.tenantId || t.id }))),
    [adminTenants, invoicesByTenantId]
  );

  const invoices = useMemo(() => {
    return selectedTenantId ? selectedInvoices : EMPTY_INVOICES;
  }, [selectedTenantId, selectedInvoices]);

  const commandes = useMemo(() => {
    return selectedTenantId ? selectedCommandes : EMPTY_COMMANDES;
  }, [selectedTenantId, selectedCommandes]);

  useEffect(() => {
    if (!selectedTenantId) return;
    loadInvoicesForTenant(selectedTenantId).catch((error) => logError("budget.loadInvoices", error));
    loadCommandesForTenant(selectedTenantId).catch((error) => logError("budget.loadCommandes", error));
  }, [selectedTenantId]);

  const historicalInvoices = useMemo(() => [], []);
  // Per-budget-code commande series for the old "Budget Commandes" view, sourced from the
  // backend (GET /budget/series-analysis?pipelineType=COMMANDE) and adapted to the panel shape.
  const [commandBudgetSeries, setCommandBudgetSeries] = useState([]);
  useEffect(() => {
    const erp = budgetConnectors.length > 0;
    if (!selectedTenantId || !erp) { setCommandBudgetSeries([]); return; }
    let live = true;
    const params = { pipelineType: "COMMANDE", ...(isEngineAdmin ? { adminTenantId: selectedTenantId } : {}) };
    getBudgetSeriesAnalysis(params)
      .then(rows => {
        if (!live) return;
        const idxOf = (m) => {
          if (typeof m?.month === "number") return m.month - 1;
          const s = String(m?.month ?? "");
          const mm = s.length >= 7 ? Number(s.slice(5, 7)) - 1 : Number(s) - 1;
          return Number.isFinite(mm) ? mm : -1;
        };
        setCommandBudgetSeries((Array.isArray(rows) ? rows : []).map(s => {
          // Per-month totals from the engine: currentAmount = this year's real spend,
          // histAmount = average monthly total across prior years (same basis as réel, so
          // the two are directly comparable). This is the true historical rhythm.
          const actual = Array.from({ length: 12 }, () => 0);
          const hist = Array.from({ length: 12 }, () => 0);
          (s.monthlyBehavior || []).forEach(m => {
            const i = idxOf(m);
            if (i >= 0 && i < 12) {
              actual[i] = m.currentAmount ?? m.amount ?? 0;
              hist[i] = m.histAmount ?? 0;
            }
          });
          // Cadence fallback (per-order μ × expected orders) for series with no prior-year
          // history, where there is no monthly average to draw on.
          const mf = s.monthlyForecast || {};
          const forecast = Array.from({ length: 12 }, (_, i) => Number(mf[i + 1] ?? mf[String(i + 1)] ?? 0));
          const total = s.total ?? s.realisedYtd ?? 0;
          const alloc = s.budgetAllocated;
          const budgetAlloue = alloc != null ? alloc : total;
          const centreName = s.centreName || "";
          const articleName = s.articleName || "";
          // Months (1-12) whose spend spiked vs the baseline → 0-based set for the heatmap.
          const anomalyMonths = new Set((s.anomalyMonths || []).map(m => Number(m) - 1));
          return {
            centreCode: s.centreCode || "",
            articleCode: s.articleCode || "",
            centreName,
            articleName,
            budgetCode: (s.centreCode && s.articleCode) ? `${s.centreCode} · ${s.articleCode}` : (s.displayName || s.id),
            label: [centreName || s.centreCode, articleName || s.label].filter(Boolean).join(" · ") || s.displayName || "",
            orderCount: s.count ?? 0,
            totalCommandes: total,
            budgetAlloue,
            projection: total,
            overrunAmount: Math.max(0, total - budgetAlloue),
            monthlyProfile: actual,
            monthlyActual: actual,
            monthlyRhythm: hist,
            monthlyForecast: forecast,
            anomalyMonths,
            anomalyCount: s.anomalyCount ?? 0,
          };
        }));
      })
      .catch((error) => { logError("budget.loadCommandSeries", error); if (live) setCommandBudgetSeries([]); });
    return () => { live = false; };
  }, [selectedTenantId, isEngineAdmin, budgetConnectors.length]);

  // Real seasonal profile per facture series (engine monthly μ) keyed by "supplier — label",
  // so the old "Analyse par série" / "Simulation" show TRUE seasonality (not a flat budget/12).
  const [factureSeasonal, setFactureSeasonal] = useState({});
  // Article code → human name, derived from facture series labels (commande series only
  // carry codes), so the commande heatmap can show real names instead of "A1".
  const [articleNames, setArticleNames] = useState({});
  useEffect(() => {
    const erp = budgetConnectors.length > 0;
    if (!selectedTenantId || !erp) { setFactureSeasonal({}); setArticleNames({}); return; }
    let live = true;
    const params = { pipelineType: "FACTURE", ...(isEngineAdmin ? { adminTenantId: selectedTenantId } : {}) };
    getBudgetSeriesAnalysis(params)
      .then(rows => {
        if (!live) return;
        const map = {};
        const names = {};
        (Array.isArray(rows) ? rows : []).forEach(s => {
          // Article-code → name (a label that isn't just the code itself).
          if (s.articleCode && s.label && s.label !== s.articleCode) names[s.articleCode] = s.label;
          const mm = s.monthlyMu || {};
          const mu = Number(s.mu ?? s.average ?? 0);
          // Real per-month μ where the engine has it; months with no data yet (e.g. future
          // months of the current exercise) fall back to the series mean, not 0/budget-12.
          const profile = Array.from({ length: 12 }, (_, i) => {
            const v = Number(mm[i + 1] ?? mm[String(i + 1)] ?? 0);
            return v > 0 ? v : mu;
          });
          if (!profile.some(v => v > 0)) return;
          const key = `${s.supplier || ""} — ${s.label || ""}`;
          const prev = map[key];
          map[key] = prev ? prev.map((v, i) => v + profile[i]) : profile;
        });
        setFactureSeasonal(map);
        setArticleNames(names);
      })
      .catch((error) => { logError("budget.loadFactureSeasonal", error); if (live) { setFactureSeasonal({}); setArticleNames({}); } });
    return () => { live = false; };
  }, [selectedTenantId, isEngineAdmin, budgetConnectors.length]);

  // Budget-overrun risks surfaced inside the budget view — derived from the SAME live
  // /budget/overview the panel uses (always current, no read/unread state). Mirrors the
  // engine's BUDGET_MONTHLY/ANNUAL_OVERRUN logic (consumed ≥ budget, or projected > budget).
  const [budgetRisks, setBudgetRisks] = useState([]);
  useEffect(() => {
    const erp = budgetConnectors.length > 0;
    if (!selectedTenantId || !erp) { setBudgetRisks([]); return; }
    if (budgetConnectors.length > 1 && !budgetConnectorId && budgetMode !== "consolidated") { setBudgetRisks([]); return; }
    let live = true;
    const params = {
      ...(isEngineAdmin ? { adminTenantId: selectedTenantId } : {}),
      ...(budgetConnectorId ? { connectorId: budgetConnectorId } : {}),
      ...(budgetMode ? { mode: budgetMode } : {}),
    };
    getBudgetOverview(params)
      .then(res => {
        if (!live) return;
        const rows = res?.rows || [];
        const risks = rows.map(r => {
          const budget = Number(r.budgetAllocated) || 0;
          const consumed = Number(r.consumedToDate) || 0;
          const projected = Number(r.projectedAtTargetDate) || 0;
          const remaining = r.remaining != null ? Number(r.remaining) : budget - consumed;
          const pct = budget > 0 ? Math.round(consumed / budget * 100) : 0;
          const futureSpend = Math.max(0, projected - consumed);          // expected spend still to come
          const futureFrac = projected > 0 ? Math.round(futureSpend / projected * 100) : 0;
          const exceeded = budget > 0 && consumed >= budget;
          const projOverrun = budget > 0 && projected > budget;
          const near = budget > 0 && consumed / budget >= 0.9;
          if (!exceeded && !projOverrun && !near) return null;
          const severity = exceeded ? "CRITIQUE" : projOverrun ? "ALERTE" : "OK";
          // The forward-looking case: still under budget now, but the seasonal rhythm back-loads spend.
          const seasonalRisk = projOverrun && !exceeded && pct < 90;
          const typeText = exceeded ? "Budget dépassé" : seasonalRisk ? "Risque saisonnier — dépassement à venir" : projOverrun ? "Dépassement projeté" : "Proche du seuil";
          let explanation;
          if (exceeded) explanation = `Consommé ${formatCurrency(consumed)} pour un budget alloué de ${formatCurrency(budget)} — dépassé de ${formatCurrency(consumed - budget)}.`;
          else if (projOverrun) explanation = `Encore sous le budget (${pct} % consommé), mais le rythme saisonnier prévoit ~${formatCurrency(futureSpend)} de dépenses sur les mois restants (≈ ${futureFrac} % du total projeté arrive après le mois courant) → projection ${formatCurrency(projected)} > budget ${formatCurrency(budget)}, dépassement prévu ${formatCurrency(projected - budget)}${r.estimatedThresholdReachDate ? `, seuil atteint vers ${r.estimatedThresholdReachDate}` : ""}.`;
          else explanation = `${pct} % du budget consommé (${formatCurrency(consumed)} / ${formatCurrency(budget)}) — proche du seuil.`;
          return {
            name: `${r.axisKey || ""}${r.label ? " · " + r.label : ""}`.trim() || "Pointeur",
            severity, typeText, explanation, consumed, budget, projected, remaining,
            thresholdDate: r.estimatedThresholdReachDate || null,
          };
        }).filter(Boolean).sort((a, b) => {
          const order = { CRITIQUE: 0, ALERTE: 1, OK: 2 };
          return (order[a.severity] - order[b.severity]) || (b.projected - a.projected);
        });
        setBudgetRisks(risks);
      })
      .catch((error) => { logError("budget.loadRisks", error); if (live) setBudgetRisks([]); });
    return () => { live = false; };
  }, [selectedTenantId, isEngineAdmin, budgetConnectors.length, budgetConnectorId, budgetMode]);

  const nowYear = CURRENT_EXERCISE_YEAR;
  const dataYear = DATA_YEAR;
  const nowMonth = CURRENT_MONTH_IDX;

  const { seriesStats, allMonths, totalRealized, totalBudget } = useMemo(() => {
    // Computed from the tenant's loaded invoices (series = supplier · label). Feeds the
    // restored old "Analyse par série" / "Simulation" views (facture-analyse / simulation tabs).
    const sMap = {};
    const mSet = new Set();
    invoices.forEach(inv => {
      const m = inv.date?.slice(0, 7);
      if (m && Number(m.slice(0, 4)) === dataYear && Number(m.slice(5, 7)) <= nowMonth + 1) mSet.add(`${nowYear}-${m.slice(5, 7)}`);
      const s = seriesNameForInvoice(inv);
      if (!sMap[s]) sMap[s] = { name: s, supplier: inv.supplier || inv.supplierName, label: inv.label, monthly: {} };
      if (m) sMap[s].monthly[m] = (sMap[s].monthly[m] || 0) + inv.amount;
    });

    historicalInvoices.forEach(inv => {
      const s = seriesNameForInvoice(inv);
      if (!sMap[s]) sMap[s] = { name: s, supplier: inv.supplier || inv.supplierName, label: inv.label, monthly: {} };
    });

    const sortedMonths = Array.from(mSet).sort();
    let tReal = 0, tBudg = 0;

    const stats = Object.values(sMap).map((s) => {
      const currentYearTotal = Object.entries(s.monthly)
        .filter(([k]) => k.startsWith(String(dataYear)) && Number(k.slice(5, 7)) <= nowMonth + 1)
        .reduce((a, [, v]) => a + v, 0);
      const historicalByMonth = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));
      historicalInvoices.forEach(inv => {
        if (seriesNameForInvoice(inv) !== s.name || !inv.date) return;
        const idx = Number(inv.date.slice(5, 7)) - 1;
        historicalByMonth[idx].sum += inv.amount;
        historicalByMonth[idx].count += 1;
      });
      const historicalPattern = historicalByMonth.map(({ sum, count }) => count ? sum / count : 0);
      const projectedYearTotal = currentYearTotal + historicalPattern.slice(nowMonth + 1).reduce((a, v) => a + v, 0);
      const autoAnnualBudget = SPEC_INVOICE_BUDGETS[s.name] ?? currentYearTotal;
      const annualBudget = customBudgets[s.name] != null ? customBudgets[s.name] : autoAnnualBudget;
      const avg = annualBudget / 12;
      tReal += currentYearTotal;
      tBudg += annualBudget;

      return {
        ...s, avg, annualBudget, autoAnnualBudget, projectedYearTotal, historicalPattern,
        currentYearTotal, pct: annualBudget > 0 ? currentYearTotal / annualBudget : 0,
        exceeded: projectedYearTotal > annualBudget,
        // Real engine monthly μ (12 values) — the seasonal baseline. Null → flat fallback.
        seasonalProfile: factureSeasonal[s.name] || null,
      };
    }).sort((a, b) => b.currentYearTotal - a.currentYearTotal);

    return { seriesStats: stats, allMonths: sortedMonths, totalRealized: tReal, totalBudget: tBudg };
  }, [invoices, historicalInvoices, customBudgets, nowYear, dataYear, nowMonth, factureSeasonal]);

  const trendData = useMemo(() => {
    return allMonths.slice(-12).map(m => ({
      m: m.slice(5),
      real: seriesStats.reduce((a, s) => a + (s.monthly?.[`${dataYear}-${m.slice(5)}`] || 0), 0),
      budget: seriesStats.reduce((a, s) => a + s.avg, 0),
    }));
  }, [allMonths, seriesStats, dataYear]);

  const seasonalRisks = useMemo(() =>
    computeSeasonalRisks(seriesStats, invoices, nowMonth),
    [seriesStats, invoices, nowMonth]
  );

  const ecart = totalRealized - totalBudget;
  const consumptionRate = totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0;
  const exceededCount = seriesStats.filter(s => s.exceeded).length;

  const handleToggleFlag = useCallback((name) => {
    setFlaggedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  // In ERP-connector budget mode the official allocation comes from the ERP
  // budget sources (Suivi / Engagé / Liquidé / Synthèse / Prévisions). The legacy
  // local-budget tabs (Analyse par série, Simulation budget, Budget Commandes)
  // show stale/0-0/budget=realized data there, so hide them when an ERP budget
  // connector is active. They remain for tenants with no ERP budget. (#4,#5,#6,#12)
  const isErpBudget = budgetConnectors.length > 0;
  // ERP order: backend pointer tabs + the restored old views (facture-analyse = old
  // "Analyse par série", commande-analyse = old "Budget Commandes", simulation = old SimulationPanel).
  const ERP_TAB_ORDER = ["suivi", "alertes", "engage", "liquide", "synthese", "previsions", "facture-analyse", "commande-analyse", "simulation"];
  const TABS = isErpBudget
    ? ERP_TAB_ORDER.map(id => BUDGET_TABS.find(t => t.id === id)).filter(Boolean)
    : BUDGET_TABS.filter(t => !SERIES_ANALYSIS_TABS.has(t.id));        // non-ERP: legacy tabs

  // If the active tab was just hidden (mode switch), fall back to "suivi".
  useEffect(() => {
    // ERP renders the old serie/commandes views under facture-analyse / commande-analyse.
    if (isErpBudget && (tab === "serie" || tab === "commandes")) setTab("suivi");
    if (!isErpBudget && SERIES_ANALYSIS_TABS.has(tab)) setTab("suivi");
  }, [isErpBudget, tab]);

  return (
    <div className={styles.root}>

      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div>
          <div className={styles.headerKicker}>
            <div className={styles.headerLine} />
            <span className={styles.headerEyebrow}>{showGlobalDashboard ? "Pilotage" : "Budget"}</span>
          </div>
          <h2 className={styles.title}>
            {showGlobalDashboard ? "Vue Globale — Tous les Tenants" : "Budget & Prévisions"}
          </h2>
          <p className={styles.subtitle}>
            {showGlobalDashboard
              ? `Moteur — ${adminTenants.length} organisations · exercice ${CURRENT_EXERCISE_YEAR}`
              : `Démo · Suivi saisonnalisé · Gardien budgétaire${selectedTenantName ? ` · ${selectedTenantName}` : ""}`
            }
          </p>
        </div>

        <div className={styles.headerActions}>

        {/* Admin tenant selector */}
        {isEngineAdmin && (
          <div className={styles.tenantSelectShell}>
            <Globe size={13} color={!adminTenantId ? COLORS.red : COLORS.grey500} className={styles.tenantSelectIcon} />
          <select
            value={adminTenantId}
            onChange={e => handleSelectTenant(e.target.value)}
            className={`${styles.tenantSelect} ${!adminTenantId ? styles.tenantSelectGlobal : ""}`}
          >
            <option value="">Vue globale</option>
            {adminTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          </div>
        )}

        {/* Back to global button when a tenant is selected */}
        {isEngineAdmin && adminTenantId && (
          <button
            onClick={() => handleSelectTenant("")}
            className={styles.globalBackButton}
          >
            <Globe size={13} /> Vue globale
          </button>
        )}

        {/* Budget configuration drawer removed — tenants switch between their ERP
            connectors' budgets via the connector selector below instead. */}

        </div>
      </div>

      {/* Tabs — left-aligned below header */}
      {!showGlobalDashboard && (
        <div className={styles.tabsOuter}>
          <div className={styles.tabsList}>
            {TABS.map(t => {
              const active = tab === t.id;
              const badge = t.id === "alertes" ? budgetRisks.length : 0;
              return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`${styles.tabButton} ${active ? styles.tabButtonActive : ""}`}>
                {t.label}
                {badge > 0 && (
                  <span className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}>{badge}</span>
                )}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GLOBAL ADMIN DASHBOARD ── */}
      {showGlobalDashboard && (
        <GlobalAdminDashboard
          tenants={adminTenants}
          allInvoices={allTenantInvoices}
          historicalInvoices={historicalInvoices}
          onSelectTenant={handleSelectTenant}
        />
      )}

      {/* ── PER-TENANT VIEW ── */}
      {!showGlobalDashboard && (
        <>
          {/* Connector / budget-context selector (shown when >1 budget connector) */}
          {budgetConnectors.length > 1 && (
            <BudgetConnectorBar
              connectors={budgetConnectors}
              connectorId={budgetConnectorId}
              mode={budgetMode}
              onSelect={(id) => { setBudgetConnectorId(id); setBudgetMode(null); }}
              onConsolidated={() => { setBudgetConnectorId(null); setBudgetMode("consolidated"); }}
            />
          )}
          {/* ── TABS: Budget intelligence ERP (Engagé / Liquidé / Synthèse / Prévisions) ── */}
          {ANALYSIS_TABS.has(tab) && (
            <ErpAnalysisTabs tab={tab} tenantId={selectedTenantId} isEngineAdmin={isEngineAdmin} connectorId={budgetConnectorId} mode={budgetMode} />
          )}
          {/* Budget-overrun risk alerts — dedicated tab (ERP), badge count in the tab bar. */}
          {tab === "alertes" && isErpBudget && (
            budgetRisks.length > 0
              ? <BudgetAlertsBanner risks={budgetRisks} />
              : (
                <div className={`card ${styles.emptyAlertCard}`}>
                  <div className={styles.emptyAlertTitle}>Aucune alerte budgétaire active</div>
                  <div className={styles.emptyAlertText}>Tous les pointeurs sont sous le seuil de risque de dépassement.</div>
                </div>
              )
          )}
          {/* Suivi shows the backend ERP budget panel (per-pointeur Suivi budgétaire). */}
          {tab === "suivi" && (
            <ErpBudgetPanel tenantId={selectedTenantId} isEngineAdmin={isEngineAdmin} connectorId={budgetConnectorId} mode={budgetMode} />
          )}
          {/* Global KPI header — non-ERP frontend mode only (each restored panel carries its own KPIs). */}
          {!isErpBudget && !connectorsLoading && !ANALYSIS_TABS.has(tab) && !SERIES_ANALYSIS_TABS.has(tab) && (
            <div className={styles.kpiGrid}>
              <KpiTile label="Total Réalisé" value={formatCurrency(totalRealized)} sub={`Sur ${allMonths.slice(-12).length} mois glissants`} accent={ecart > 0 ? COLORS.red : COLORS.success} delay={0} />
              <KpiTile label="Budget Total" value={formatCurrency(totalBudget)} sub="Calculé sur historique N-1 / N-2" delay={60} />
              <KpiTile label="Écart" value={`${ecart > 0 ? "+" : ""}${formatCompactCurrency(ecart)}`} sub={ecart > 0 ? "Dépassement global" : "Économie globale"} accent={ecart > 0 ? COLORS.red : COLORS.success} delay={120} />
              <KpiTile label="Taux de consommation" value={`${consumptionRate.toFixed(1)}%`} sub={`${exceededCount} série(s) dépassée(s)`} accent={consumptionRate > 100 ? COLORS.red : consumptionRate > 90 ? COLORS.warning : COLORS.success} delay={180} />
            </div>
          )}

          {/* ── TAB: Suivi budgétaire ── */}
          {tab === "suivi" && (
            <>
              {/* Frontend seasonal banner + trend + spend table — non-ERP only.
                  In ERP mode the Suivi tab is the backend ErpBudgetPanel above.
                  Gated on !connectorsLoading so they don't flash before the
                  /budget/connectors check confirms this tenant has no ERP budget. */}
              {!isErpBudget && !connectorsLoading && <SeasonalRiskBanner risks={seasonalRisks} />}

              {!isErpBudget && !connectorsLoading && (
                <div className={`card ${styles.chartCard}`}>
                  <SectionLabel n="1">Évolution mensuelle — Réalisé vs Budget</SectionLabel>
                  <TrendAreaChart trendData={trendData} />
                  <div className={styles.chartLegend}>
                    {[
                      { color: COLORS.red, label: "Dépenses Réelles", dash: false },
                      { color: COLORS.grey400, label: "Budget Mensuel Moyen", dash: true },
                    ].map(l => (
                      <div key={l.label} className={styles.chartLegendItem}>
                        <svg width="24" height="10">
                          <line x1="0" y1="5" x2="24" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash ? "4 3" : "0"} />
                        </svg>
                        <span className={styles.chartLegendText}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isErpBudget && !connectorsLoading && (
                <GlobalBudgetTable
                  seriesStats={seriesStats}
                  onSelectSeries={s => { setSelectedSeries(s); setSeriesBudgetInput(""); setTab("serie"); }}
                  flaggedSuppliers={flaggedSuppliers}
                  onToggleFlag={handleToggleFlag}
                  invoices={invoices}
                />
              )}

              {Object.keys(customBudgets).length > 0 && (
                <div className={styles.resetRow}>
                  <button
                    onClick={() => setCustomBudgets({})}
                    className={styles.manualBudgetResetButton}
                  >Réinitialiser tous les budgets manuels</button>
                </div>
              )}
            </>
          )}

          {/* ── TAB: Analyse par série (ERP renders it under "Analyse budget facture") ── */}
          {(tab === "serie" || tab === "facture-analyse") && (
            <div className={styles.seriesStack}>
              <div className={`card ${styles.seriesSelectorCard}`}>
                <div className={styles.seriesSelectorColumn}>
                  <label className={styles.fieldLabel}>
                    Sélectionner une série
                  </label>
                  <select
                    className={styles.seriesSelect}
                    value={selectedSeries?.name || ""}
                    onChange={e => {
                      const s = seriesStats.find(x => x.name === e.target.value) || null;
                      setSelectedSeries(s);
                      setSeriesBudgetInput("");
                    }}
                  >
                    <option value="">— Choisir un fournisseur / série —</option>
                    {seriesStats.map(s => (
                      <option key={s.name} value={s.name}>
                        {s.name} · {formatCurrency(s.currentYearTotal)} / {formatCurrency(s.annualBudget)}{s.exceeded ? " · Dépassement" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSeries && (
                  <div className={styles.seriesDivider} />
                )}

                {selectedSeries && (
                  <div className={styles.seriesSelectorColumn}>
                    <label className={styles.fieldLabel}>
                      Budget annuel — {selectedSeries.name}
                    </label>
                    <div className={styles.budgetInputRow}>
                      <input
                        type="number"
                        className={styles.budgetInput}
                        placeholder={String(selectedSeries.autoAnnualBudget)}
                        value={seriesBudgetInput}
                        onChange={e => setSeriesBudgetInput(e.target.value)}
                      />
                      <span className={styles.currencySuffix}>€ / an</span>
                      {seriesBudgetInput !== "" && (
                        <button
                          className={styles.autoBudgetButton}
                          onClick={() => setSeriesBudgetInput("")}
                        >Auto</button>
                      )}
                    </div>
                    <div className={styles.budgetHelperText}>
                      {seriesBudgetInput === ""
                        ? `Budget auto : ${formatCurrency(selectedSeries.autoAnnualBudget)}`
                        : `Auto : ${formatCurrency(selectedSeries.autoAnnualBudget)}`}
                    </div>
                  </div>
                )}
              </div>

              {!selectedSeries && (
                <div className={styles.seriesInfoBox}>
                  <Lightbulb size={16} color={COLORS.info} />
                  <span>
                    <strong className={styles.seriesInfoStrong}>Mode Analyse par Série</strong> — Sélectionnez un fournisseur ci-dessus.
                    Le système calculera la prévision saisonnière mensuelle et vous alertera sur les mois à risque.
                  </span>
                </div>
              )}

              {selectedSeries && (
                <SeriesBudgetPanel
                  key={selectedSeries.name}
                  series={selectedSeries}
                  invoices={invoices}
                  historicalInvoices={historicalInvoices}
                  allMonths={allMonths}
                  budgetInput={seriesBudgetInput}
                  autoAnnualBudget={selectedSeries.autoAnnualBudget}
                />
              )}
            </div>
          )}

          {/* ── TAB: Simulation ── */}
          {tab === "simulation" && (
            <SimulationPanel invoices={invoices} seriesStats={seriesStats} historicalInvoices={historicalInvoices} />
          )}

          {/* ── TAB: Budget Commandes (ERP renders it under "Analyse budget commande") ── */}
          {(tab === "commandes" || tab === "commande-analyse") && (
            <CommandesBudgetPanel commandes={commandes} invoices={invoices} budgetSeries={commandBudgetSeries} articleNames={articleNames} />
          )}
        </>
      )}
    </div>
  );
}

export default BudgetView;
