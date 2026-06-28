import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Spinner } from "@/shared/ui/Spinner";
import { useToast } from "@/contexts/toastContextValue";
import { useSession } from "@/features/auth/model/useSession";
import { selectPipelinesByTenantId, selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { loadPipelinesForTenant, loadTenants } from "@/shared/model/dataLoaders";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { CalendarDays, ChevronDown, ChevronRight, Clock, X, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { T, isCommandePipeline } from "@/features/series/utils/seriesHelpers";
import { Toggle, Badge, StatPill, SeriesCard, SectionTitle } from "@/features/series/components/seriesComponents";
import { SeriesDetailModal } from "@/features/series/components/SeriesDetailModal";
import { logError } from "@/shared/utils/logError";
import styles from "./SeriesView.module.css";

export function SeriesView() {
  useToast();
  const { tenant, partner, isEngineAdmin } = useSession();
  const [seriesMap, setSeriesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [adminTenantFilter, setAdminTenantFilter] = useState("");
  const [expandedPipelines, setExpandedPipelines] = useState(new Set());
  const tenants = useAppSelector(selectTenants);
  const pipelinesByTenantId = useAppSelector(selectPipelinesByTenantId);
  const tenantPipelines = useAppSelector((state) => selectPipelinesForTenant(state, tenant?.id));

  const allTenants = useMemo(() => {
    if (!isEngineAdmin) return [];
    return tenants;
  }, [isEngineAdmin, tenants]);
  const allTenantsKey = allTenants.map(t => t.id).join(",");

  const pipelines = useMemo(() => {
    if (tenant) return tenantPipelines;
    if (isEngineAdmin && adminTenantFilter) return pipelinesByTenantId[adminTenantFilter] || [];
    if (isEngineAdmin) return allTenants.flatMap(t => pipelinesByTenantId[t.id] || []);
    return [];
  }, [tenant, tenantPipelines, isEngineAdmin, adminTenantFilter, allTenants, pipelinesByTenantId]);

  useEffect(() => {
    if (isEngineAdmin && !tenant?.id) loadTenants().catch((error) => logError("series.loadTenants", error));
  }, [isEngineAdmin, tenant?.id]);

  useEffect(() => {
    if (tenant?.id) {
      loadPipelinesForTenant(tenant.id).catch((error) => logError("series.loadTenantPipelines", error));
      return;
    }
    if (isEngineAdmin && adminTenantFilter) {
      loadPipelinesForTenant(adminTenantFilter).catch((error) => logError("series.loadAdminTenantPipelines", error));
      return;
    }
    if (isEngineAdmin && allTenantsKey) {
      Promise.all(allTenantsKey.split(",").map(id => loadPipelinesForTenant(id))).catch((error) => logError("series.loadAllTenantPipelines", error));
    }
  }, [tenant?.id, isEngineAdmin, adminTenantFilter, allTenantsKey]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const map = {};
      // Sequential on purpose: wsAPI reads pipeline/tenant from the shared
      // wsStore, so parallel fetches would race and mix pipelines up.
      for (const p of pipelines) {
        if (!p.workspaceStarted) { map[p.id] = []; continue; }
        try {
          wsStore.activePipelineId = p.id;
          // Engine admins must impersonate the pipeline's tenant, otherwise
          // the backend resolves the admin tenant and returns no series.
          wsStore.activeTenantId = p.tenantId;
          const data = await wsAPI.listSeries();
          if (isCommandePipeline(p)) {
            map[p.id] = Array.isArray(data) ? data.map(s => ({ ...s, isCommandSeries: true, budgetCode: s.budgetCode || s.supplier, budgetLabel: s.budgetLabel || s.label })) : [];
            continue;
          }
          map[p.id] = Array.isArray(data) ? data : [];
        } catch { map[p.id] = []; }
      }
      if (mounted) { setSeriesMap(map); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [pipelines]);

  useEffect(() => {
    setExpandedPipelines(new Set());
  }, [pipelines]);

  if (!tenant && !isEngineAdmin) return null;

  const allSeries = Object.values(seriesMap).flat();
  const totalSeries = allSeries.length;
  const flaggedSeries = allSeries.filter(s => s.flagged || s.high_cv || s.low_volume).length;
  const startedPipelines = pipelines.filter(p => p.workspaceStarted).length;

  return (
    <div className={`fade-up ${styles.page}`}>
      <PageHeader
        eyebrow="Monitoring"
        title="Séries opérationnelles"
        subtitle={`${totalSeries} série${totalSeries !== 1 ? "s" : ""} · ${pipelines.length} pipeline${pipelines.length !== 1 ? "s" : ""}`}
        actions={!tenant && isEngineAdmin && allTenants.length > 0 && (
          <select
            value={adminTenantFilter}
            onChange={e => setAdminTenantFilter(e.target.value)}
            className={styles.adminTenantSelect}
          >
            <option value="">Tous les tenants</option>
            {allTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      />

      {/* ── Summary stats ── */}
      <div className={styles.summaryGrid}>
        {[
          { label: "Pipelines", value: pipelines.length, tone: "neutral", icon: <Activity size={14} /> },
          { label: "Pipelines démarrés", value: startedPipelines, tone: "success", icon: <Activity size={14} /> },
          { label: "Séries configurées", value: totalSeries, tone: "info", icon: <TrendingUp size={14} /> },
          { label: "Séries flaggées", value: flaggedSeries, tone: "red", icon: <AlertTriangle size={14} /> },
        ].map(({ label, value, tone, icon }) => (
          <div key={label} className={`${styles.statCard} ${styles[`stat${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>
                {label}
              </span>
              <span className={styles.statIcon}>{icon}</span>
            </div>
            <div className={styles.statValue}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Pipeline list ── */}
      <div className={styles.pipelineList}>
        {loading && (
          <div className={styles.loadingState}>
            <Spinner size={15} />
            <span className={styles.loadingText}>Chargement des séries…</span>
          </div>
        )}

        {!loading && pipelines.length === 0 && (
          <div className={styles.emptyState}>
            Aucun pipeline configuré pour ce tenant.
          </div>
        )}

        {!loading && pipelines.map(p => {
          const series = seriesMap[p.id] || [];
          const partnerColor = partner?.color || T.ink500;
          const isExpanded = expandedPipelines.has(p.id);
          const flaggedCount = series.filter(s => s.flagged || s.high_cv || s.low_volume).length;

          const toggle = () => setExpandedPipelines(prev => {
            const next = new Set(prev);
            if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
            return next;
          });

          return (
            <div key={p.id} className={`${styles.pipelineCard} ${isExpanded ? styles.pipelineCardExpanded : ""}`}>
              {/* Pipeline header row */}
              <div
                onClick={toggle}
                className={`${styles.pipelineHeader} ${isExpanded ? styles.pipelineHeaderExpanded : ""}`}
              >
                {/* Chevron */}
                <div className={`${styles.chevronBox} ${isExpanded ? styles.chevronBoxExpanded : ""}`}>
                  {isExpanded
                    ? <ChevronDown size={13} color={T.red} />
                    : <ChevronRight size={13} color={T.ink400} />}
                </div>

                {/* Status dot */}
                <div className={`${styles.statusDot} ${p.status === "actif" ? styles.statusDotActive : styles.statusDotInactive}`} />

                {/* Pipeline info */}
                <div className={styles.pipelineInfo}>
                  <div className={styles.pipelineName}>{p.name}</div>
                  <div
                    className={styles.pipelineMeta}
                    ref={node => { if (node) node.style.setProperty("--partner-color", partnerColor); }}
                  >
                    <span>{p.connector}</span>
                    <span className={styles.metaSeparator}>·</span>
                    <span className={styles.partnerName}>{partner?.name || (!tenant ? p.tenantId : "—")}</span>
                    <span className={styles.metaSeparator}>·</span>
                    <span>{series.length} série{series.length !== 1 ? "s" : ""}</span>
                    {!p.workspaceStarted && (
                      <span className={styles.notStarted}>· Non démarré</span>
                    )}
                  </div>
                </div>

                {/* Right-side chips */}
                <div className={styles.pipelineChips}>
                  {flaggedCount > 0 && (
                    <span className={styles.flaggedChip}>
                      {flaggedCount} flag{flaggedCount > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className={`${styles.seriesChip} ${series.length > 0 ? styles.seriesChipActive : styles.seriesChipEmpty}`}>
                    {series.length} série{series.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className={`fade-in ${styles.expandedBody}`}>
                  {!p.workspaceStarted && (
                    <div className={styles.expandedMessage}>
                      Lancez le workspace de ce pipeline pour configurer ses séries.
                    </div>
                  )}
                  {p.workspaceStarted && series.length === 0 && (
                    <div className={styles.expandedMessage}>
                      Aucune série détectée — importez des données dans le workspace.
                    </div>
                  )}
                  {p.workspaceStarted && series.length > 0 && (
                    <div className={styles.seriesList}>
                      {series.map((s, i) => (
                        <div
                          key={s.id || i}
                          onClick={() => setSelectedDetail({ series: s, pipeline: p })}
                          className={styles.seriesCardButton}
                        >
                          <SeriesCard series={s} pipeline={p} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDetail && (
        <SeriesDetailModal
          series={selectedDetail.series}
          pipeline={selectedDetail.pipeline}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}
