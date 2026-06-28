
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/contexts/toastContextValue";
import { Spinner } from "@/shared/ui/Spinner";
import { wsAPI } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro, supplierColor } from "@/utils/formatters";
import { buildCvData, buildMonthlyChart, buildMuData, buildRadarData, buildSupplierBarData, normalizeSeriesForCharts } from "./dashboardMetrics";
import { DashboardOverviewTab } from "./DashboardOverviewTab";
import { DashboardSuppliersTab } from "./DashboardSuppliersTab";
import { DashboardSeriesTab } from "./DashboardSeriesTab";
import { DashboardTestingTab } from "./DashboardTestingTab";
import { DashboardInsightsTab } from "./DashboardInsightsTab";
import { DashboardAnomaliesTab } from "./DashboardAnomaliesTab";
import styles from "./DashboardTabs.module.css";

export function WSFullDashboard({
  alerts: alertsProp,
  feedbackLog: feedbackLogProp,
  series: seriesProp,
  invoices: invoicesProp,
  monthly: monthlyProp,
  supplierCounts: supplierCountsProp,
  distribution: distributionProp,
  groupFields: groupFieldsProp,
  onReset,
  manageMode = false,
}) {
  const series = useMemo(() => Array.isArray(seriesProp) ? seriesProp : [], [seriesProp]);
  const groupFields = useMemo(() => Array.isArray(groupFieldsProp) ? groupFieldsProp : [], [groupFieldsProp]);
  const fallbackInvoices = useMemo(() => Array.isArray(invoicesProp) ? invoicesProp : [], [invoicesProp]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState(monthlyProp || { months: [], totals: [] });
  const [supplierCounts, setSupplierCounts] = useState(supplierCountsProp || {});
  const [distribution, setDistribution] = useState(Array.isArray(distributionProp) ? distributionProp : []);
  const [allAlerts, setAllAlerts] = useState(Array.isArray(alertsProp) ? alertsProp : []);
  const [allFeedback, setAllFeedback] = useState(Array.isArray(feedbackLogProp) ? feedbackLogProp : []);
  const [alertFilter, setAlertFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState(null);
  const [lastAdaptDash, setLastAdaptDash] = useState(null);
  const [err, setErr] = useState(null);

  // States for invoice simulator
  const toast = useToast();
  const [testSup, setTestSup] = useState("");
  const [testLabel, setTestLabel] = useState("");
  const [testAmt, setTestAmt] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0]);
  const [testResult, setTestResult] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  const supOptions = useMemo(
    () => [...new Set(series.map((s) => s.supplier))].filter(Boolean).sort(),
    [series]
  );
  
  const labelOptions = useMemo(() => {
    if (!testSup) return [];
    const labels = series
      .filter((s) => s.supplier === testSup && s.label)
      .map((s) => s.label);
    return [...new Set(labels)].sort();
  }, [testSup, series]);

  const runTest = () => {
    if (!testSup || !testAmt) return;
    setTestRunning(true);
    setTestResult(null);
    setTimeout(() => {
      const s = series.find(
        (x) => x.supplier === testSup && (!testLabel || x.label === testLabel)
      );
      if (!s) {
        setTestResult({
          error: `Série pour "${testSup}"${
            testLabel ? ` · "${testLabel}"` : ""
          } introuvable.`,
        });
        setTestRunning(false);
        return;
      }
      const amt = parseFloat(testAmt);
      const refMu = s.mu;
      const maxAcc = refMu * (1 + (s.tolerance_pct || 10) / 100);
      const tolAbs = refMu * ((s.tolerance_pct || 10) / 100) || 1;
      const excess = amt - maxAcc;
      const score =
        excess > 0
          ? Math.min(100, 60 + (excess / tolAbs) * 25)
          : Math.max(0, 60 - ((maxAcc - amt) / maxAcc) * 40);
      setTestResult({
        score: Math.round(Math.max(0, score)),
        severity: score > 85 ? "CRITIQUE" : score > 60 ? "ALERTE" : "OK",
        mu: s.mu,
        maxAcc,
        n: s.n,
        cv: s.cv,
        tolerance_pct: s.tolerance_pct,
        amt,
        note:
          excess > 0
            ? `Montant ${formatEuro(Math.round(amt))} dépasse le seuil ${formatEuro(
                Math.round(maxAcc)
              )} (+${((excess / refMu) * 100).toFixed(1)}%)`
            : `Montant ${formatEuro(
                Math.round(amt)
              )} dans la plage normale (ref ${formatEuro(Math.round(refMu))} ±${
                s.tolerance_pct
              }%)`,
      });
      setTestRunning(false);
    }, 600);
  };

  const addAndDetect = async () => {
    if (!testSup || !testAmt) return;
    setTestRunning(true);
    setErr(null);
    try {
      await wsAPI.addInvoice(
        testSup,
        parseFloat(testAmt),
        testDate,
        testLabel || undefined,
        "VA"
      );
      await wsAPI.runDetection();
      const newAlerts = await wsAPI.getAlerts("pending");
      setAllAlerts(Array.isArray(newAlerts) ? newAlerts : []);
      
      // Also update overall distribution to keep stats coherent in UI!
      const dist = await wsAPI.getDistribution();
      setDistribution(dist.amounts || []);
      const mt = await wsAPI.getMonthlyTotals();
      setMonthly(mt);

      toast("Facture ajoutée & détection relancée", "success");
    } catch (e) {
      setErr(e.message);
    }
    setTestRunning(false);
  };

  const doFeedback = async (alertId, decision) => {
    setActionLoading(alertId);
    try {
      const alert = allAlerts.find((a) => a.id === alertId);
      await wsAPI.submitFeedback(alertId, decision);
      setAllAlerts((p) => p.filter((a) => a.id !== alertId));
      const fb = await wsAPI.getFeedbackLog().catch(() => []);
      setAllFeedback(fb);
      const entry = [...fb].reverse().find((e) => e.alert_id === alertId) || {};
      setLastAdaptDash({
        alertId,
        decision,
        series_id: alert?.series_id,
        feedbackEntry: entry,
        alert,
      });
    } catch (e) {
      setErr(e.message);
    }
    setActionLoading(null);
  };

  useEffect(() => {
    if (monthlyProp || fallbackInvoices.length > 0) {
      if (monthlyProp) setMonthly({ months: Array.isArray(monthlyProp?.months) ? monthlyProp.months : [], totals: Array.isArray(monthlyProp?.totals) ? monthlyProp.totals : [] });
      if (supplierCountsProp) setSupplierCounts(supplierCountsProp);
      if (Array.isArray(distributionProp)) setDistribution(distributionProp);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const mt = await wsAPI.getMonthlyTotals();
        setMonthly({ months: Array.isArray(mt?.months) ? mt.months : [], totals: Array.isArray(mt?.totals) ? mt.totals : [] });
        const sc = await wsAPI.getSupplierCounts();
        setSupplierCounts(sc.supplier_counts || {});
        const dist = await wsAPI.getDistribution();
        setDistribution(dist.amounts || []);
        const a = await wsAPI.getAlerts("pending");
        setAllAlerts(Array.isArray(a) ? a : []);
        const fb = await wsAPI.getFeedbackLog().catch(() => []);
        setAllFeedback(Array.isArray(fb) ? fb : []);
      } catch (e) {
        const byMonth = {};
        const bySupplier = {};
        fallbackInvoices.forEach((inv) => {
          const date = inv.date || inv.invoice_date || inv.invoiceDate || "";
          const month = date.slice(0, 7);
          const amount = Number(inv.amount || inv.amountTtc || 0);
          const supplier = inv.supplier || inv.supplier_code || inv.supplierName || "N/A";
          if (month) byMonth[month] = (byMonth[month] || 0) + amount;
          bySupplier[supplier] = (bySupplier[supplier] || 0) + 1;
        });
        const months = Object.keys(byMonth).sort();
        setMonthly(monthlyProp || { months, totals: months.map((m) => byMonth[m]) });
        setSupplierCounts(supplierCountsProp || bySupplier);
        setDistribution(Array.isArray(distributionProp) ? distributionProp : fallbackInvoices.map((inv) => Number(inv.amount || inv.amountTtc || 0)).filter(Number.isFinite));
        setErr(e.message);
      }
      setLoading(false);
    })();
  }, [distributionProp, fallbackInvoices, monthlyProp, supplierCountsProp]);

  const monthlyChart = useMemo(() => buildMonthlyChart(monthly), [monthly]);
  const supBarData = useMemo(
    () => buildSupplierBarData(supplierCounts),
    [supplierCounts]
  );
  const top5 = supBarData.slice(0, 5).map((s) => s.id);
  const sc2 = (id) => supplierColor(id, top5);
  const total = (Array.isArray(monthly?.totals) ? monthly.totals : []).reduce((a, b) => a + b, 0);
  const totalInvoices = Array.isArray(distribution) ? distribution.length : 0;
  const critiques = (Array.isArray(allAlerts) ? allAlerts : []).filter(
    (a) => a.severity === "CRITIQUE" || a.score > 0.85
  ).length;

  const radarData = useMemo(
    () => buildRadarData({ supplierBarData: supBarData, topSuppliers: top5, series, alerts: allAlerts }),
    [allAlerts, series, supBarData, top5]
  );

  const sortedSeries = useMemo(
    () => normalizeSeriesForCharts(series),
    [series]
  );
  const cvData = useMemo(() => buildCvData(sortedSeries), [sortedSeries]);
  const muData = useMemo(() => buildMuData(sortedSeries), [sortedSeries]);

  if (loading)
    return (
      <div className={styles.loadingState}>
        <Spinner size={36} />
      </div>
    );
  return (
    <div className={styles.dashboardShell}>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.summaryText}>
          {totalInvoices.toLocaleString()} factures · {series.length} séries
        </div>
        <div className={styles.toolbarActions}>
          <button
            onClick={async () => {
              if (manageMode) return;
              await wsAPI.runDetection();
              const a = await wsAPI.getAlerts("pending");
              setAllAlerts(Array.isArray(a) ? a : []);
              setAlertFilter("pending");
            }}
            disabled={manageMode}
            className={`btn-ghost ${styles.toolbarButton}`}
            title={manageMode ? "Action bloquée en mode gestion pour éviter une ré-importation." : undefined}
          >
            Re-détecter
          </button>
          <button
            onClick={() => {
              if (manageMode) return;
              wsAPI.resetDatabase();
              onReset();
            }}
            disabled={manageMode}
            className={`btn-ghost ${styles.toolbarButton}`}
            title={manageMode ? "Action bloquée en mode gestion pour éviter une ré-importation." : undefined}
          >
            Nouveau CSV
          </button>
        </div>
      </div>
      <div className={styles.tabList}>
        {[
          ["overview", "Vue générale"],
          ["suppliers", "Fournisseurs"],
          ["anomalies", "Anomalies"],
          ["series", "Séries"],
          ["testing", "Tester une facture"],
          ["insights", "Insights"],
        ].map(([id, lbl]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`tab${tab === id ? " active" : ""}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <DashboardOverviewTab
          total={total}
          totalInvoices={totalInvoices}
          alertsCount={allAlerts.length}
          criticalCount={critiques}
          seriesCount={series.length}
          feedbackCount={allFeedback.length}
          monthlyChart={monthlyChart}
          supplierBarData={supBarData}
          supplierColor={sc2}
          onOpenInsights={() => setTab("insights")}
        />
      )}

      {tab === "suppliers" && (
        <DashboardSuppliersTab topSuppliers={top5} radarData={radarData} supplierBarData={supBarData} />
      )}

      {tab === "anomalies" && (
        <DashboardAnomaliesTab
          adaptation={lastAdaptDash}
          alerts={allAlerts}
          filter={alertFilter}
          actionLoading={actionLoading}
          series={series}
          onDismissAdaptation={() => setLastAdaptDash(null)}
          onFilterChange={setAlertFilter}
          onAlertsChange={setAllAlerts}
          onFeedback={doFeedback}
        />
      )}

      {tab === "series" && (
        <DashboardSeriesTab series={series} sortedSeries={sortedSeries} cvData={cvData} muData={muData} alerts={allAlerts} feedback={allFeedback} />
      )}

      {tab === "testing" && (
        <DashboardTestingTab
          supplierOptions={supOptions}
          labelOptions={labelOptions}
          supplier={testSup}
          label={testLabel}
          amount={testAmt}
          date={testDate}
          result={testResult}
          running={testRunning}
          onSupplierChange={(value) => {
            setTestSup(value);
            setTestLabel("");
            setTestResult(null);
          }}
          onLabelChange={(value) => {
            setTestLabel(value);
            setTestResult(null);
          }}
          onAmountChange={(value) => {
            setTestAmt(value);
            setTestResult(null);
          }}
          onDateChange={setTestDate}
          onRunTest={runTest}
          onAddAndDetect={addAndDetect}
        />
      )}

      {tab === "insights" && (
        <DashboardInsightsTab criticalCount={critiques} alertsCount={allAlerts.length} feedbackCount={allFeedback.length} series={series} groupFields={groupFields} />
      )}
      <div className={styles.footerNote}>
        AnomalyIQ · Invoice Analytics · API v2.0
      </div>
    </div>
  );
}
