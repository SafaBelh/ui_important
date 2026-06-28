import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { getBudgetSuivi } from "@/features/budget/api/BudgetApi";
import { computeSeasonalForecast, computeTenantStats, formatCurrency, seriesNameForInvoice, CURRENT_EXERCISE_YEAR } from "@/features/budget/utils/budgetHelpers";
import { Card, KpiTile, MonthlyBarsChart, SectionLabel, StatusPill } from "@/features/budget/components/BudgetWidgets";
import styles from "./BudgetPanels.module.css";

export function GlobalAdminDashboard({ tenants = [], allInvoices = [], historicalInvoices = [], onSelectTenant }) {
  const tenantStats = useMemo(() => tenants.map((tenant) => ({ tenant, stats: computeTenantStats(tenant.id, allInvoices, historicalInvoices) })), [tenants, allInvoices, historicalInvoices]);
  const totalRealized = tenantStats.reduce((sum, item) => sum + item.stats.totalRealized, 0);
  const totalBudget = tenantStats.reduce((sum, item) => sum + item.stats.totalBudget, 0);
  const overBudget = tenantStats.filter((item) => item.stats.ecart > 0).length;
  return (
    <div className={styles.panelStack}>
      <div className={styles.kpiGrid}>
        <KpiTile label="Réalisé global" value={formatCurrency(totalRealized)} sub={`${tenants.length} tenant(s)`} />
        <KpiTile label="Budget global" value={formatCurrency(totalBudget)} sub="Budget consolidé" />
        <KpiTile label="Tenants en dépassement" value={overBudget} sub="Sur périmètre visible" accent={overBudget ? COLORS.red : COLORS.success} />
      </div>
      <Card>
        <SectionLabel n="1">Vue globale tenants</SectionLabel>
        <div className={styles.listStack}>
          {tenantStats.map(({ tenant, stats }) => (
            <button key={tenant.id} onClick={() => onSelectTenant?.(tenant.id)} className={styles.tenantButton}>
              <span className={styles.tenantName}>{tenant.name || tenant.id}</span>
              <span className={`${styles.tenantAmount} ${stats.ecart > 0 ? styles.textDanger : styles.textSuccess}`}>
                {formatCurrency(stats.totalRealized)} / {formatCurrency(stats.totalBudget)} <ChevronRight size={14} />
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function GlobalBudgetTable({ seriesStats = [], onSelectSeries, flaggedSuppliers = [], onToggleFlag }) {
  const [search, setSearch] = useState("");
  const isFlagged = useMemo(() => {
    if (flaggedSuppliers instanceof Set) return (name) => flaggedSuppliers.has(name);
    if (Array.isArray(flaggedSuppliers)) return (name) => flaggedSuppliers.includes(name);
    return () => false;
  }, [flaggedSuppliers]);
  const filtered = seriesStats.filter((series) => series.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Card>
      <SectionLabel n="2">Suivi des séries budgétaires</SectionLabel>
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une série" className={styles.searchInput} />
      </div>
      <div className={styles.tableScroller}>
        <table className={styles.seriesTable}>
          <tbody>
            {filtered.slice(0, 40).map((series) => {
              const flagged = isFlagged(series.name);
              return (
                <tr key={series.name}>
                  <td className={styles.seriesNameCell}>{series.name}</td>
                  <td>{formatCurrency(series.currentYearTotal)}</td>
                  <td>{formatCurrency(series.annualBudget || series.autoAnnualBudget)}</td>
                  <td><StatusPill status={series.exceeded ? "critical" : "normal"} /></td>
                  <td className={styles.actionCell}>
                    <button onClick={() => onToggleFlag?.(series.name)} className={`${styles.flagButton} ${flagged ? styles.textDanger : styles.textMuted}`}>{flagged ? "Signalé" : "Signaler"}</button>
                    <button onClick={() => onSelectSeries?.(series)} className={styles.analysisButton}>Analyse</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SeriesBudgetPanel({ series, invoices = [], historicalInvoices = [], allMonths = [], budgetInput, autoAnnualBudget }) {
  if (!series) return null;
  const budget = Number(budgetInput || autoAnnualBudget || series.annualBudget || series.autoAnnualBudget || 0);
  const rows = allMonths.map((month) => ({ name: month.slice(5), value: invoices.filter((invoice) => seriesNameForInvoice(invoice) === series.name && invoice.date?.startsWith(month)).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) }));
  const historicalTotal = historicalInvoices.filter((invoice) => seriesNameForInvoice(invoice) === series.name).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  return (
    <Card>
      <SectionLabel n="3">Analyse série · {series.name}</SectionLabel>
      <div className={styles.kpiGridWithMargin}>
        <KpiTile label="Réalisé" value={formatCurrency(series.currentYearTotal)} sub="Année courante" />
        <KpiTile label="Budget" value={formatCurrency(budget)} sub="Budget annuel" />
        <KpiTile label="Historique" value={formatCurrency(historicalTotal)} sub="Base historique" />
      </div>
      <MonthlyBarsChart data={rows} />
    </Card>
  );
}

export function SimulationPanel({ invoices = [], seriesStats = [], historicalInvoices = [] }) {
  const [name, setName] = useState(seriesStats[0]?.name || "");
  const selected = seriesStats.find((series) => series.name === name) || seriesStats[0];
  const [budget, setBudget] = useState(selected?.autoAnnualBudget || selected?.annualBudget || 0);
  useEffect(() => { if (selected) setBudget(selected.autoAnnualBudget || selected.annualBudget || 0); }, [selected]);
  if (!selected) return <Card>Aucune série disponible pour la simulation.</Card>;
  const monthlyHistorical = {};
  historicalInvoices.filter((invoice) => seriesNameForInvoice(invoice) === selected.name).forEach((invoice) => { const month = invoice.date?.slice(0, 7); if (month) monthlyHistorical[month] = (monthlyHistorical[month] || 0) + Number(invoice.amount || 0); });
  const forecast = computeSeasonalForecast({ monthlyHistorical, annualBudget: Number(budget || 0) });
  const current = invoices.filter((invoice) => seriesNameForInvoice(invoice) === selected.name).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  return (
    <Card>
      <SectionLabel n="4">Simulation budget</SectionLabel>
      <div className={styles.controlsRow}>
        <select value={selected.name} onChange={(event) => setName(event.target.value)} className={styles.formControl}>{seriesStats.map((series) => <option key={series.name} value={series.name}>{series.name}</option>)}</select>
        <input type="number" value={budget} onChange={(event) => setBudget(event.target.value)} className={styles.formControl} />
      </div>
      <div className={styles.kpiGridWithMargin}>
        <KpiTile label="Réalisé" value={formatCurrency(current)} />
        <KpiTile label="Budget simulé" value={formatCurrency(Number(budget || 0))} />
      </div>
      <MonthlyBarsChart data={forecast.map((item) => ({ name: item.name, value: item.expected }))} color={COLORS.info} />
    </Card>
  );
}

export function CommandesBudgetPanel({ commandes = [], budgetSeries = [], articleNames = {} }) {
  const rows = budgetSeries.length ? budgetSeries : Object.values(commandes.reduce((acc, commande) => { const key = commande.articleCode || commande.article || commande.label || "Commande"; if (!acc[key]) acc[key] = { name: articleNames[key] || key, amount: 0 }; acc[key].amount += Number(commande.amount || commande.total || 0); return acc; }, {}));
  return (
    <Card>
      <SectionLabel n="5">Budget commandes</SectionLabel>
      {rows.length === 0 ? <div className={styles.emptyText}>Aucune commande disponible.</div> : <MonthlyBarsChart data={rows.map((row) => ({ name: row.name || row.label, value: row.amount || row.realized || row.total || 0 }))} color={COLORS.warning} />}
    </Card>
  );
}

export function BudgetConnectorBar({ connectors = [], connectorId, mode, onSelect, onConsolidated }) {
  return (
    <Card>
      <div className={styles.connectorBar}>
        <button onClick={onConsolidated} className={`${styles.connectorButton} ${mode === "consolidated" ? styles.connectorButtonActive : ""}`}>Consolidé</button>
        {connectors.map((connector) => (
          <button key={connector.id} onClick={() => onSelect?.(connector.id)} className={`${styles.connectorButton} ${connectorId === connector.id ? styles.connectorButtonActive : ""}`}>{connector.name || connector.label || connector.id}</button>
        ))}
      </div>
    </Card>
  );
}

export function ErpBudgetPanel({ tenantId, isEngineAdmin, connectorId, mode }) {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });
  useEffect(() => {
    let live = true;
    setState({ loading: true, rows: [], error: "" });
    const params = { year: CURRENT_EXERCISE_YEAR };
    if (connectorId) params.connectorId = connectorId;
    if (mode) params.mode = mode;
    if (isEngineAdmin && tenantId) params.adminTenantId = tenantId;
    getBudgetSuivi(params)
      .then((res) => { if (live) setState({ loading: false, rows: Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [], error: "" }); })
      .catch((err) => { if (live) setState({ loading: false, rows: [], error: err?.message || "Budget indisponible" }); });
    return () => { live = false; };
  }, [connectorId, isEngineAdmin, mode, tenantId]);
  if (state.loading) return <Card>Chargement du budget ERP...</Card>;
  if (state.error) return <Card><div className={styles.errorMessage}><AlertTriangle size={15} />{state.error}</div></Card>;
  return (
    <Card>
      <SectionLabel n="1">Suivi budgétaire ERP</SectionLabel>
      {state.rows.length === 0 ? <div className={styles.emptyText}>Aucune donnée budgétaire disponible.</div> : (
        <div className={styles.listStack}>
          {state.rows.map((row, idx) => <div key={row.id || idx} className={styles.erpRow}><span>{row.label || row.name || row.pointeur || `Ligne ${idx + 1}`}</span><strong>{formatCurrency(row.realized || row.amount || row.consumed || 0)}</strong></div>)}
        </div>
      )}
    </Card>
  );
}
