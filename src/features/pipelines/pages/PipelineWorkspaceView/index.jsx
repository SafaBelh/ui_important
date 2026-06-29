import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Maximize2,
  RotateCcw,
  ScrollText,
  X,
} from "lucide-react";
import { COLORS } from "@/constants/colors";
import {
  normalizePipelineEnabledChecks,
  normalizePipelineRecordType,
} from "@/constants/integrationWizard";
import {
  selectCommandesForTenant,
  selectInvoicesForTenant,
} from "@/features/documents/model/documentSelectors";
import { selectPipelineById } from "@/features/pipelines/model/pipelineSelectors";
import { selectEnrichedTenantById } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import {
  addPipelineDetectionAlerts,
  updatePipelineStore,
} from "@/features/pipelines/model/pipelineActions";
import { loadInvoicesForTenant, loadCommandesForTenant } from "@/shared/model/dataLoaders";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { updatePipelineMapping } from "@/features/pipelines/api/pipelinesApi";
import { WSFullDashboard } from "@/features/pipelines/pages/PipelineWorkspaceView/DashboardTab";
import { WSMappingStep } from "./MappingStep";
import { WSCleaningStep } from "./CleaningStep";
import { WSClusterEDAStep } from "./ClusterEDAStep";
import { WSSeriesBuilder } from "./SeriesBuilder";
import { WSSeriesConfig } from "./SeriesConfigStep";
import { SideStepBar } from "./StepBar";
import { PIPELINE_STEPS } from "./PipelineSteps";
import { PipelineRunReportDrawer } from "@/features/pipelines/components/PipelineRunReportDrawer";
import { useToast } from "@/contexts/toastContextValue";
import { logError } from "@/shared/utils/logError";
import styles from "./PipelineWorkspaceView.module.css";

/* ─────────────────────────────────────────────────────────────────────────
   Step page ↔ index mapping
───────────────────────────────────────────────────────────────────────── */
const STEP_PAGES = [
  "mapping",
  "cleaning",
  "clusterEDA",
  "seriesBuilder",
  "seriesConfig",
  "dashboard",
];
const MANAGE_PAGES = new Set(["mapping", "seriesConfig", "dashboard"]);

/* ─────────────────────────────────────────────────────────────────────────
   Step header chip — small breadcrumb shown above each step's content
───────────────────────────────────────────────────────────────────────── */
function StepHeader({ stepIdx, total }) {
  const step = PIPELINE_STEPS[stepIdx];
  if (!step) return null;
  const { Icon, label, desc } = step;
  return (
    <div className={styles.stepHeader}>
      <div className={styles.stepHeaderIcon}>
        <Icon size={18} color={COLORS.red} strokeWidth={1.8} />
      </div>
      <div>
        <div className={styles.stepHeaderTitle}>{label}</div>
        <div className={styles.stepHeaderSubtitle}>
          {desc}
          <span className={styles.stepHeaderBadge}>
            {stepIdx + 1} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Bottom nav bar — Prev / Next buttons shown at the bottom of content
───────────────────────────────────────────────────────────────────────── */
function BottomNav({ stepIdx, total, onPrev, onNext, nextLabel, nextDisabled }) {
  return (
    <div className={styles.bottomNav}>
      <button
        onClick={onPrev}
        disabled={stepIdx === 0}
        className={`btn-ghost ${styles.navButton} ${stepIdx === 0 ? styles.navButtonHidden : ""}`}
      >
        <ArrowLeft size={14} /> Précédent
      </button>
      <div className={styles.navDots}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`${styles.navDot} ${i < stepIdx ? styles.navDotDone : ""} ${i === stepIdx ? styles.navDotActive : ""}`}
          />
        ))}
      </div>
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className={`btn-primary ${styles.nextButton}`}
        >
          {nextLabel || "Suivant"} <ArrowRight size={14} color="#fff" />
        </button>
      )}
      {!onNext && <div className={styles.navSpacer} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Loading screen
───────────────────────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingCard}>
        <div className={styles.loadingIcon}>
          <Loader2 size={26} color="#fff" className="spinner" />
        </div>
        <h3 className={styles.loadingTitle}>Analyse en cours…</h3>
        <p className={styles.loadingText}>
          Modélisation des séries temporelles et détection d'anomalies via AnomalyIQ AI Engine…
        </p>
        <div className={styles.loadingTrack}>
          <div className={styles.loadingFill} />
        </div>
      </div>
    </div>
  );
}

function readConfig(pipeline) {
  const raw = pipeline?.configJson ?? pipeline?.config ?? {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

function isCommandePipeline(pipeline, config = {}) {
  const explicitRecordType = config?.recordType || pipeline?.recordType;
  if (explicitRecordType) {
    return normalizePipelineRecordType(explicitRecordType, null, "INVOICE") === "COMMANDE";
  }
  const key = String(pipeline?.templateKey || config?.template || "").toLowerCase();
  const name = String(pipeline?.name || "").toLowerCase();
  return key === "commande" || key === "commandes" || name.includes("commande");
}

function normalizeGroupField(field) {
  if (!field) return "";
  const short = String(field).includes(".") ? String(field).split(".").at(-1) : String(field);
  if (["supplier", "supplier_code", "supplierName", "vendor", "vendor_code"].includes(short))
    return "supplier";
  if (["label", "category", "categoryName"].includes(short)) return "label";
  if (["budgetCode", "ligne_budgetaire", "budget_code"].includes(short)) return "budgetCode";
  if (["commandeDate", "date_cmd", "date"].includes(short)) return "date";
  return short;
}

function groupFieldsFromConfig(config, fallback = ["supplier_code", "label"]) {
  const configuredGroupBy =
    Array.isArray(config?.groupByCols) && config.groupByCols.length > 0
      ? config.groupByCols
      : Array.isArray(config?.groupBy) && config.groupBy.length > 0
        ? config.groupBy
        : fallback;
  return configuredGroupBy.map(normalizeGroupField).filter(Boolean);
}

function invoiceRowsForPipeline(
  pipeline,
  config = readConfig(pipeline),
  cachedInvoices = [],
  cachedCommandes = [],
) {
  if (isCommandePipeline(pipeline, config)) {
    // Bug D: commande pipelines must analyse COMMANDE rows (not return empty,
    // which left the ML modal showing facture-shaped zeros). Map commandes onto
    // the same row shape the analysis expects (amount = ordered amount, group by
    // budget line), tagged sourceKind so the engine uses the commande logic.
    const cmds = cachedCommandes || [];
    return cmds.map((c, i) => ({
      invoice_ref: c.commandeRef || c.reference || c.id || `CMD-${i + 1}`,
      invoice_date: c.commandeDate || c.date || c.commande_date || "",
      date: c.commandeDate || c.date || c.commande_date || "",
      amount: Number(c.orderedAmount ?? c.amount ?? c.montant ?? 0),
      supplier_code: c.supplier || c.supplierName || c.supplier_code || "N/A",
      supplier: c.supplier || c.supplier_code || c.supplierName || "N/A",
      label: c.label || c.budgetCode || "",
      budgetCode: c.budgetCode || c.ligne_budgetaire || c.budget_code || "",
      status: c.status || "VALIDATED",
      sourceKind: "commande",
    }));
  }
  const rows =
    Array.isArray(wsStore.invoices) && wsStore.invoices.length > 0
      ? wsStore.invoices
      : cachedInvoices;
  return rows.map((inv, i) => ({
    invoice_ref: inv.invoice_ref || inv.ref || inv.id || `INV-${i + 1}`,
    invoice_date: inv.invoice_date || inv.date || inv.invoiceDate || "",
    date: inv.invoice_date || inv.date || inv.invoiceDate || "",
    amount: Number(inv.amount || inv.amountTtc || 0),
    supplier_code: inv.supplier_code || inv.supplier || inv.supplierName || "N/A",
    supplier: inv.supplier || inv.supplier_code || inv.supplierName || "N/A",
    label: inv.label || inv.category || "",
    status: inv.status || "VALIDATED",
  }));
}

function buildLocalSeries(invoices, config) {
  const groupFields = groupFieldsFromConfig(config);
  const isCommande = invoices.some((inv) => inv.sourceKind === "commande");
  const groups = new Map();
  invoices.forEach((inv) => {
    const supplier = inv.supplier || inv.supplier_code || "N/A";
    const label = inv.label || "";
    const parts = groupFields.map((field) => {
      if (field === "supplier") return supplier;
      if (field === "label") return label;
      return inv[field] || "";
    });
    const key = parts.join("::");
    if (!groups.has(key))
      groups.set(key, {
        supplier: parts[0] || supplier,
        label: parts.slice(1).filter(Boolean).join(" · ") || label,
        values: [],
      });
    groups
      .get(key)
      .values.push({ amount: Number(inv.amount || 0), date: inv.date || inv.invoice_date || "" });
  });
  return Array.from(groups.values())
    .map((g, i) => {
      const rows = g.values;
      const currentRows = isCommande
        ? rows.filter((r) => String(r.date).startsWith("2026-"))
        : rows;
      const values = currentRows.map((r) => r.amount);
      const n = values.length;
      const mu = n ? values.reduce((a, b) => a + b, 0) / n : 0;
      const variance = n ? values.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / n : 0;
      const sigma = Math.sqrt(variance);
      const cv = mu ? sigma / mu : 0;
      return {
        id: `local-series-${i + 1}`,
        name: [g.supplier, g.label].filter(Boolean).join(" · "),
        supplier: g.supplier,
        label: g.label,
        n,
        mu,
        sigma,
        cv,
        flagged: cv > 0.25 || n < 3,
        high_cv: cv > 0.25,
        low_volume: n < 3,
        tolerance_pct: config?.detection?.tolerancePct ?? 10,
        tolerance_days: config?.detection?.toleranceDays ?? 10,
        active: true,
        kind: isCommande ? "commande" : "facture",
        orderCount: n,
        totalAmount: values.reduce((a, b) => a + b, 0),
      };
    })
    .sort((a, b) => b.n - a.n);
}

function buildCommandePatternAlerts(invoices, series, config = {}) {
  const groupFields = groupFieldsFromConfig(config, ["budgetCode"]);
  const maxCurrentMonth = Math.max(
    ...invoices
      .filter((inv) => String(inv.date).startsWith("2026-"))
      .map((inv) => Number(String(inv.date).slice(5, 7)) || 0),
    5,
  );
  const groups = new Map();
  invoices.forEach((inv) => {
    const supplier = inv.supplier || inv.supplier_code || "N/A";
    const parts = groupFields.map((field) => {
      if (field === "supplier") return supplier;
      if (field === "label") return inv.label || "";
      return inv[field] || "";
    });
    const key = parts.join("::");
    if (!groups.has(key))
      groups.set(key, { key, label: parts.filter(Boolean).join(" · ") || supplier, rows: [] });
    groups.get(key).rows.push(inv);
  });
  return Array.from(groups.values()).flatMap((group, i) => {
    const current = group.rows.filter(
      (r) =>
        String(r.date).startsWith("2026-") && Number(String(r.date).slice(5, 7)) <= maxCurrentMonth,
    );
    const historicalYears = [2024, 2025].map((year) =>
      group.rows.filter(
        (r) =>
          String(r.date).startsWith(`${year}-`) &&
          Number(String(r.date).slice(5, 7)) <= maxCurrentMonth,
      ),
    );
    const avgHistCount =
      historicalYears.reduce((sum, rows) => sum + rows.length, 0) /
      Math.max(1, historicalYears.length);
    const avgHistAmount =
      historicalYears.reduce(
        (sum, rows) => sum + rows.reduce((s, r) => s + Number(r.amount || 0), 0),
        0,
      ) / Math.max(1, historicalYears.length);
    const currentAmount = current.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const countRatio = avgHistCount ? current.length / avgHistCount : 0;
    const amountRatio = avgHistAmount ? currentAmount / avgHistAmount : 0;
    const alerts = [];
    if (avgHistCount > 0 && countRatio >= 1.5) {
      alerts.push({
        type: "ORDER_VOLUME_SPIKE",
        ratio: countRatio,
        message: `${group.label}: ${current.length} commandes vs ${avgHistCount.toFixed(1)} habituel`,
      });
    }
    if (avgHistAmount > 0 && amountRatio >= 1.25) {
      alerts.push({
        type: "ORDER_AMOUNT_SPIKE",
        ratio: amountRatio,
        message: `${group.label}: montant commandes ${Math.round(currentAmount).toLocaleString("fr-FR")} EUR vs ${Math.round(avgHistAmount).toLocaleString("fr-FR")} EUR habituel`,
      });
    }
    return alerts.map((alert, idx) => ({
      id: `local-cmd-alert-${i + 1}-${idx + 1}`,
      invoice_id: group.key,
      series_id: series.find(
        (s) =>
          s.name === group.label ||
          `${s.supplier}${s.label ? ` · ${s.label}` : ""}` === group.label,
      )?.id,
      supplier: group.label,
      amount: currentAmount,
      score: Math.min(0.99, 0.65 + Math.max(alert.ratio - 1, 0) * 0.25),
      severity: alert.ratio >= 1.75 ? "CRITIQUE" : "ALERTE",
      status: "pending",
      type: alert.type,
      message: alert.message,
      explanation:
        "Commande: detection basee sur le nombre de commandes et le montant YTD compares aux annees precedentes pour la meme serie.",
    }));
  });
}

function buildLocalDashboardData(invoices, series, config = {}) {
  const byMonth = {};
  const bySupplier = {};
  const alerts = [];
  const isCommande = invoices.some((inv) => inv.sourceKind === "commande");
  invoices.forEach((inv, i) => {
    const date = inv.date || inv.invoice_date || "";
    const month = date.slice(0, 7);
    const amount = Number(inv.amount || 0);
    const supplier = inv.supplier || inv.supplier_code || "N/A";
    if (month) byMonth[month] = (byMonth[month] || 0) + amount;
    bySupplier[supplier] = (bySupplier[supplier] || 0) + 1;
    if (isCommande) return;
    const s = series.find((x) => x.supplier === supplier && (x.label || "") === (inv.label || ""));
    const max = (s?.mu || 0) * (1 + (s?.tolerance_pct || 10) / 100);
    if (s && amount > max) {
      alerts.push({
        id: `local-alert-${i + 1}`,
        invoice_id: inv.invoice_ref || `INV-${i + 1}`,
        series_id: s.id,
        supplier,
        amount,
        score: Math.min(0.99, 0.75 + (amount - max) / Math.max(max, 1) / 2),
        severity: amount > max * 1.3 ? "CRITIQUE" : "ALERTE",
        status: "pending",
      });
    }
  });
  if (isCommande) alerts.push(...buildCommandePatternAlerts(invoices, series, config));
  const months = Object.keys(byMonth).sort();
  return {
    alerts,
    feedbackLog: [],
    series,
    invoices,
    monthly: { months, totals: months.map((m) => byMonth[m]) },
    supplierCounts: bySupplier,
    distribution: invoices.map((inv) => Number(inv.amount || 0)).filter(Number.isFinite),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */
export function PipelineWorkspaceView({
  pipelineId,
  workspaceMode = "setup",
  onBack,
  inModal = false,
  onOpenFullPage = null,
  wsPage,
  setWsPage,
  wsUploadData,
  setWsUploadData,
  wsMappingResult,
  setWsMappingResult,
  wsSeriesResult,
  setWsSeriesResult,
  wsFinalResult,
  setWsFinalResult,
  resetWsState,
}) {
  const toast = useToast();
  const pipeline = useAppSelector((state) => selectPipelineById(state, pipelineId));
  const pipelineTenant = useAppSelector((state) =>
    selectEnrichedTenantById(state, pipeline?.tenantId),
  );
  const cachedInvoices = useAppSelector((state) =>
    selectInvoicesForTenant(state, pipeline?.tenantId),
  );
  const cachedCommandes = useAppSelector((state) =>
    selectCommandesForTenant(state, pipeline?.tenantId),
  );
  const manageMode = workspaceMode === "manage";
  const autoRunStarted = useRef(false);
  const noopSetter = useCallback(() => {}, []);
  const page = wsPage ?? "mapping";
  const setPage = setWsPage ?? noopSetter;
  const uploadData = wsUploadData ?? null;
  const setUploadData = setWsUploadData ?? noopSetter;
  const mappingResult = wsMappingResult ?? null;
  const setMappingResult = setWsMappingResult ?? noopSetter;
  const seriesResult = wsSeriesResult ?? null;
  const setSeriesResult = setWsSeriesResult ?? noopSetter;
  const finalResult = wsFinalResult ?? null;
  const setFinalResult = setWsFinalResult ?? noopSetter;
  const [reportOpen, setReportOpen] = useState(false);

  const stepIdx = STEP_PAGES.indexOf(page) >= 0 ? STEP_PAGES.indexOf(page) : 0;

  const pipelineConfig = useMemo(() => readConfig(pipeline), [pipeline]);
  const pipelineRecordType = useMemo(
    () =>
      normalizePipelineRecordType(
        mappingResult?.recordType || pipelineConfig?.recordType || pipeline?.recordType,
        pipeline?.kind || pipeline?.templateKey || pipelineConfig?.template,
        "INVOICE",
      ),
    [
      mappingResult?.recordType,
      pipeline?.kind,
      pipeline?.recordType,
      pipeline?.templateKey,
      pipelineConfig?.recordType,
      pipelineConfig?.template,
    ],
  );
  const pipelineEnabledChecks = useMemo(
    () =>
      normalizePipelineEnabledChecks(
        mappingResult?.enabledChecks ?? pipelineConfig?.enabledChecks ?? pipeline?.enabledChecks,
      ),
    [mappingResult?.enabledChecks, pipeline?.enabledChecks, pipelineConfig?.enabledChecks],
  );
  const isAutomated =
    pipelineConfig?.automation?.autoRun === true ||
    pipelineConfig?.automation?.mode === "automated" ||
    pipelineConfig?.executionMode === "automated";
  // Bug D: load the dataset matching the pipeline kind (commandes for commande
  // pipelines, invoices otherwise) into the store cache, then bump a key so the
  // memoised rows/series/dashboard recompute once the data arrives.
  useEffect(() => {
    if (!pipeline?.tenantId) return;
    const loader = isCommandePipeline(pipeline, pipelineConfig)
      ? loadCommandesForTenant
      : loadInvoicesForTenant;
    loader(pipeline.tenantId).catch((error) =>
      logError("pipelineWorkspace.reloadDocuments", error),
    );
  }, [pipeline, pipelineConfig]);
  const existingInvoices = useMemo(
    () =>
      pipeline
        ? invoiceRowsForPipeline(pipeline, pipelineConfig, cachedInvoices, cachedCommandes)
        : [],
    [pipeline, pipelineConfig, cachedInvoices, cachedCommandes],
  );
  const existingSeries = useMemo(
    () => (pipeline ? buildLocalSeries(existingInvoices, pipelineConfig) : []),
    [pipeline, existingInvoices, pipelineConfig],
  );
  const currentKind = isCommandePipeline(pipeline, pipelineConfig) ? "commande" : "facture";
  const cachedSeriesMatchesPipeline =
    Array.isArray(seriesResult?.series) &&
    seriesResult.series.length > 0 &&
    seriesResult.series.every((s) => (s.kind || "facture") === currentKind);
  const activeSeries = cachedSeriesMatchesPipeline ? seriesResult.series : existingSeries;
  const activeGroupFields = cachedSeriesMatchesPipeline
    ? seriesResult?.groupFields || []
    : groupFieldsFromConfig(
        pipelineConfig,
        currentKind === "commande" ? ["budgetCode"] : ["supplier_code", "label"],
      );
  const existingDashboard = useMemo(
    () => buildLocalDashboardData(existingInvoices, activeSeries, pipelineConfig),
    [existingInvoices, activeSeries, pipelineConfig],
  );

  useEffect(() => {
    if (seriesResult?.series?.length && !cachedSeriesMatchesPipeline) {
      setSeriesResult(null);
    }
  }, [cachedSeriesMatchesPipeline, seriesResult?.series?.length, setSeriesResult]);

  useEffect(() => {
    wsStore.activePipelineId = pipelineId;
  }, [pipelineId]);

  const savePipelineDtoOptions = useCallback(
    async (patch = {}, { throwOnError = false } = {}) => {
      if (!pipeline?.id) return;
      const nextRecordType = normalizePipelineRecordType(
        patch.recordType || pipelineRecordType,
        pipeline?.kind || pipeline?.templateKey || pipelineConfig?.template,
        "INVOICE",
      );
      const nextEnabledChecks = normalizePipelineEnabledChecks(
        patch.enabledChecks ?? pipelineEnabledChecks,
      );
      const nextConfig = {
        ...(pipelineConfig || {}),
        recordType: nextRecordType,
        enabledChecks: nextEnabledChecks,
      };
      setMappingResult((prev) => ({
        ...(prev || {}),
        recordType: nextRecordType,
        enabledChecks: nextEnabledChecks,
      }));
      updatePipelineStore(pipeline.id, {
        recordType: nextRecordType,
        enabledChecks: nextEnabledChecks,
        config: nextConfig,
        configJson: JSON.stringify(nextConfig),
      });
      try {
        await updatePipelineMapping(pipeline.id, {
          recordType: nextRecordType,
          enabledChecks: nextEnabledChecks,
          adminTenantId: pipeline.tenantId,
        });
      } catch (error) {
        toast(error.message || "Impossible d'enregistrer le type de document", "error");
        if (throwOnError) throw error;
      }
    },
    [pipeline, pipelineConfig, pipelineEnabledChecks, pipelineRecordType, setMappingResult, toast],
  );

  useEffect(() => {
    if (manageMode || !pipeline || !isAutomated || finalResult || autoRunStarted.current) return;
    autoRunStarted.current = true;
    setPage("dashboard-loading");
    const timer = setTimeout(() => {
      const invoices = invoiceRowsForPipeline(
        pipeline,
        pipelineConfig,
        cachedInvoices,
        cachedCommandes,
      );
      wsStore.invoices = invoices;
      const fields = Object.keys(invoices[0] || {});
      const groupFields = groupFieldsFromConfig(
        pipelineConfig,
        currentKind === "commande" ? ["budgetCode"] : ["supplier_code", "label"],
      );
      const mapping = {
        recordType: pipelineRecordType,
        enabledChecks: pipelineEnabledChecks,
        cols: {
          id: "invoice_ref",
          date: "invoice_date",
          amount: "amount",
          supplier: "supplier_code",
          label: "label",
          status: "status",
        },
        extraCols: fields.filter(
          (f) =>
            !["invoice_ref", "invoice_date", "amount", "supplier_code", "label", "status"].includes(
              f,
            ),
        ),
        statusConfig: pipelineConfig.statusWorkflow || null,
      };
      const series = buildLocalSeries(invoices, pipelineConfig);
      const dashboard = buildLocalDashboardData(invoices, series, pipelineConfig);
      setMappingResult(mapping);
      setSeriesResult({ series, groupFields });
      setFinalResult(dashboard);
      setPage("dashboard");
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    cachedCommandes,
    cachedInvoices,
    currentKind,
    manageMode,
    pipeline,
    isAutomated,
    finalResult,
    setMappingResult,
    setSeriesResult,
    setFinalResult,
    setPage,
    pipelineConfig,
    pipelineEnabledChecks,
    pipelineRecordType,
  ]);

  useEffect(() => {
    if (!pipeline || page !== "dashboard-loading" || finalResult) return;
    const timer = setTimeout(() => {
      const invoices = invoiceRowsForPipeline(
        pipeline,
        pipelineConfig,
        cachedInvoices,
        cachedCommandes,
      );
      wsStore.invoices = invoices;
      const fields = Object.keys(invoices[0] || {});
      const groupFields = groupFieldsFromConfig(
        pipelineConfig,
        currentKind === "commande" ? ["budgetCode"] : ["supplier_code", "label"],
      );
      const mapping = {
        recordType: pipelineRecordType,
        enabledChecks: pipelineEnabledChecks,
        cols: {
          id: "invoice_ref",
          date: "invoice_date",
          amount: "amount",
          supplier: "supplier_code",
          label: "label",
          status: "status",
        },
        extraCols: fields.filter(
          (f) =>
            !["invoice_ref", "invoice_date", "amount", "supplier_code", "label", "status"].includes(
              f,
            ),
        ),
        statusConfig: pipelineConfig.statusWorkflow || null,
      };
      const series = buildLocalSeries(invoices, pipelineConfig);
      const dashboard = buildLocalDashboardData(invoices, series, pipelineConfig);
      setMappingResult(mapping);
      setSeriesResult({ series, groupFields });
      setFinalResult(dashboard);
      setPage("dashboard");
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    cachedCommandes,
    cachedInvoices,
    currentKind,
    pipeline,
    page,
    finalResult,
    pipelineConfig,
    setMappingResult,
    setSeriesResult,
    setFinalResult,
    setPage,
    pipelineEnabledChecks,
    pipelineRecordType,
  ]);

  const handleNavigate = useCallback(
    (idx) => {
      const target = STEP_PAGES[idx];
      if (manageMode && target && !MANAGE_PAGES.has(target)) return;
      if (target) setPage(target);
    },
    [manageMode, setPage],
  );

  /* keyboard navigation */
  useEffect(() => {
    const h = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && stepIdx < STEP_PAGES.length - 1) {
        e.preventDefault();
        handleNavigate(stepIdx + 1);
      }
      if (e.key === "ArrowLeft" && stepIdx > 0) {
        e.preventDefault();
        handleNavigate(stepIdx - 1);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [handleNavigate, stepIdx]);

  const reset = async () => {
    if (resetWsState) {
      await resetWsState();
    } else {
      await wsAPI.resetDatabase();
      setUploadData(null);
      setMappingResult(null);
      setSeriesResult(null);
      setFinalResult(null);
      setPage("mapping");
    }
  };

  if (!pipeline)
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundTitle}>Pipeline introuvable</div>
        <button onClick={onBack} className="btn-primary">
          ← Retour
        </button>
      </div>
    );

  /* ── Step content ──────────────────────────────────────────────────── */
  const renderStep = () => {
    if (page === "dashboard-loading") return <LoadingScreen />;

    if (manageMode && !MANAGE_PAGES.has(page)) {
      return (
        <div className={`glass-card ${styles.blockedCard}`}>
          <div className={styles.blockedTitle}>
            <AlertCircle size={16} /> Étape de ré-import bloquée
          </div>
          <div className={styles.blockedText}>
            Ce pipeline existe déjà. Pour éviter d'importer les mêmes données deux fois, seules les
            actions de gestion sont disponibles ici : mapping, configuration des séries et
            dashboard.
          </div>
          <div className={styles.blockedActions}>
            <button
              className={`btn-primary ${styles.blockedButton}`}
              onClick={() => setPage("seriesConfig")}
            >
              Gérer les séries
            </button>
            <button
              className={`btn-ghost ${styles.blockedButton}`}
              onClick={() => setPage("mapping")}
            >
              Modifier le mapping
            </button>
          </div>
        </div>
      );
    }

    if (page === "mapping")
      return (
        <WSMappingStep
          uploadData={uploadData}
          manageMode={manageMode}
          pipeline={pipeline}
          pipelineConfig={{
            ...(pipelineConfig || {}),
            recordType: pipelineRecordType,
            enabledChecks: pipelineEnabledChecks,
          }}
          onConfirm={async (d) => {
            const nextMappingResult = {
              ...d,
              recordType: normalizePipelineRecordType(d.recordType, null, "INVOICE"),
              enabledChecks: normalizePipelineEnabledChecks(d.enabledChecks),
            };
            setMappingResult(nextMappingResult);
            await savePipelineDtoOptions(nextMappingResult, { throwOnError: true });
            if (manageMode) {
              updatePipelineStore(pipeline.id, {
                configJson: {
                  ...(pipelineConfig || {}),
                  recordType: nextMappingResult.recordType,
                  enabledChecks: nextMappingResult.enabledChecks,
                  mapping: {
                    cols: nextMappingResult.cols || {},
                    extraCols: nextMappingResult.extraCols || [],
                  },
                },
              });
            }
            if (nextMappingResult.statusConfig) {
              updatePipelineStore(pipeline.id, {
                configJson: {
                  ...(pipeline.configJson || {}),
                  ...nextMappingResult.statusConfig,
                },
              });
            }
            if (nextMappingResult.extraCols && nextMappingResult.extraCols.length > 0) {
              updatePipelineStore(pipeline.id, {
                extraData: JSON.stringify(nextMappingResult.extraCols),
              });
            }
            if (manageMode) toast("Mapping enregistré", "success");
            setPage(manageMode ? "seriesConfig" : "cleaning");
          }}
          onNavigate={handleNavigate}
        />
      );

    if (page === "cleaning")
      return <WSCleaningStep onConfirm={() => setPage("clusterEDA")} onNavigate={handleNavigate} />;

    if (page === "clusterEDA")
      return (
        <WSClusterEDAStep
          pipeline={pipeline}
          onConfirm={() => setPage("seriesBuilder")}
          onBack={() => setPage("cleaning")}
          onNavigate={handleNavigate}
        />
      );

    if (page === "seriesBuilder")
      return (
        <WSSeriesBuilder
          cols={mappingResult?.cols || {}}
          extraCols={mappingResult?.extraCols || []}
          onConfirm={(r) => {
            setSeriesResult(r);
            setPage("seriesConfig");
          }}
          onNavigate={handleNavigate}
        />
      );

    if (page === "seriesConfig")
      return (
        <WSSeriesConfig
          series={activeSeries}
          recordType={pipelineRecordType}
          enabledChecks={pipelineEnabledChecks}
          onPipelineConfigChange={savePipelineDtoOptions}
          onConfirm={async (updatedSeries) => {
            if (manageMode) {
              setSeriesResult({
                ...(seriesResult || {}),
                series: updatedSeries || existingSeries,
                groupFields: activeGroupFields,
              });
              updatePipelineStore(pipeline.id, {
                configJson: {
                  ...(pipelineConfig || {}),
                  recordType: pipelineRecordType,
                  enabledChecks: pipelineEnabledChecks,
                  seriesOverrides: (updatedSeries || activeSeries).map((item) => ({
                    id: item.id,
                    tolerance_pct: item.tolerance_pct,
                    tolerance_days: item.tolerance_days,
                    use_seasonality: item.use_seasonality,
                    forecast_start_today: item.forecast_start_today,
                    active: item.active !== false,
                  })),
                },
              });
              toast("Changements enregistrés", "success");
              return;
            }
            setPage("dashboard-loading");
            try {
              await wsAPI.runDetection();
              const s = await wsAPI.listSeries();
              const a = await wsAPI.getAlerts("pending");

              const dbAlerts = a.map((wa) => ({
                id: `ALT-${pipeline.tenantId}-${pipeline.erpPartnerId || "ANY"}-${wa.id}`,
                tenantId: pipeline.tenantId,
                erpPartnerId: pipeline.erpPartnerId,
                type: "anomaly",
                severity: wa.score > 0.85 ? "critical" : "warning",
                message: `Facture anormale détectée — ${wa.supplier} (${wa.amount} €)`,
                timestamp: new Date().toISOString(),
                read: false,
                invoiceRef: wa.invoice_id,
                anomalyScore: wa.score,
              }));

              addPipelineDetectionAlerts(dbAlerts);

              setSeriesResult({ ...seriesResult, series: s });
              setFinalResult({ alerts: a, feedbackLog: [], series: s });
              setPage("dashboard");
            } catch (e) {
              console.error(e);
              const localRows = invoiceRowsForPipeline(
                pipeline,
                pipelineConfig,
                cachedInvoices,
                cachedCommandes,
              );
              const s = activeSeries || buildLocalSeries(localRows, pipelineConfig);
              const dashboard = buildLocalDashboardData(localRows, s, pipelineConfig);
              setSeriesResult({ ...seriesResult, series: s });
              setFinalResult(dashboard);
              setPage("dashboard");
            }
          }}
          confirmLabel={manageMode ? "Enregistrer les changements" : "Sauvegarder la configuration"}
          saveLocalOnly={manageMode}
          onNavigate={handleNavigate}
        />
      );

    if (page === "dashboard")
      return (
        <>
          <div className={styles.dashboardToolbar}>
            <button
              className={`btn-ghost ${styles.reportButton}`}
              onClick={() => setReportOpen(true)}
            >
              <ScrollText size={14} /> Rapport d'exécution
            </button>
          </div>
          <WSFullDashboard
            {...(finalResult || existingDashboard)}
            series={activeSeries}
            groupFields={activeGroupFields}
            onReset={reset}
            manageMode={manageMode}
          />
        </>
      );

    return null;
  };

  const isDashboard = page === "dashboard" || page === "dashboard-loading";
  const isLoading = page === "dashboard-loading";

  /* ── Workspace shell ──────────────────────────────────────────────── */
  const workspaceShell = (
    <div className={styles.shell}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        {/* Left: back + title */}
        <div className={styles.topLeft}>
          <button onClick={onBack} title="Retour" className={`btn-icon ${styles.topBackButton}`}>
            <ArrowLeft size={15} color={COLORS.grey600} />
          </button>
          <div className={styles.topDivider} />
          <div>
            <div className={styles.pipelineTitle}>{pipeline.name}</div>
            <div className={styles.pipelineMeta}>
              <span
                className={`${styles.statusDot} ${pipeline.status === "paused" ? styles.statusDotPaused : ""}`}
              />
              <span>Pipeline {pipeline.status === "paused" ? "en pause" : "actif"}</span>
              <span className={styles.demoStatus}>
                <CheckCircle2 size={10} /> Données demo
              </span>
              {manageMode && (
                <span className={styles.manageStatus}>
                  <AlertCircle size={10} /> Mode gestion
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className={styles.topActions}>
          {!manageMode && (
            <button onClick={reset} className={`btn-ghost ${styles.topActionButton}`}>
              <RotateCcw size={12} color={COLORS.grey500} />
              Nouveau CSV
            </button>
          )}

          {onOpenFullPage && (
            <button onClick={onOpenFullPage} className={`btn-ghost ${styles.topActionButton}`}>
              <Maximize2 size={12} color={COLORS.grey500} />
              Plein écran
            </button>
          )}

          {inModal && (
            <button onClick={onBack} className="btn-icon">
              <X size={15} color={COLORS.grey500} />
            </button>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className={styles.body}>
        {/* Sidebar — hidden on dashboard to give full width */}
        {!isDashboard && (
          <SideStepBar
            step={stepIdx}
            onNavigate={handleNavigate}
            pipelineName={pipeline.name}
            connector={pipeline.connector}
            disabledPages={manageMode ? ["cleaning", "clusterEDA", "seriesBuilder"] : []}
          />
        )}

        {/* Main content area */}
        <div className={`${styles.mainArea} ${isDashboard ? styles.mainAreaDashboard : ""}`}>
          {isLoading ? (
            <LoadingScreen />
          ) : isDashboard ? (
            /* Dashboard gets full width, no padding wrapper */
            <div className={styles.dashboardContent}>{renderStep()}</div>
          ) : (
            /* Regular steps: white content card */
            <div className={styles.stepContentWrap}>
              {manageMode && (
                <div className={styles.manageNotice}>
                  <AlertCircle
                    size={15}
                    color={COLORS.warning}
                    className={styles.manageNoticeIcon}
                  />
                  <div>
                    <div className={styles.manageNoticeTitle}>Gestion du pipeline existant</div>
                    <div className={styles.manageNoticeText}>
                      Les actions de ré-import, nettoyage, clustering et redétection sont bloquées
                      pour éviter de charger les mêmes données deux fois. Vous pouvez modifier le
                      mapping ou les séries, puis enregistrer.
                    </div>
                  </div>
                </div>
              )}

              {/* Step header chip */}
              <StepHeader stepIdx={stepIdx} total={PIPELINE_STEPS.length} />

              {/* Step content — each step renders its own UI */}
              <div className="fade-in">{renderStep()}</div>
            </div>
          )}
        </div>
      </div>
      <PipelineRunReportDrawer
        open={reportOpen}
        pipeline={pipeline}
        tenantName={pipelineTenant?.name || pipeline.tenantId}
        finalResult={finalResult}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );

  /* ── Modal mode ──────────────────────────────────────────────────── */
  if (inModal) {
    return createPortal(
      <div className={`modal-overlay ${styles.modalOverlay}`}>
        <div className="modal-bg" onClick={onBack} />
        <div className={`modal-box scale-in ${styles.modalBox}`}>{workspaceShell}</div>
      </div>,
      document.body,
    );
  }

  /* ── Standalone page mode ──────────────────────────────────────────── */
  return <div className={styles.standalonePage}>{workspaceShell}</div>;
}
