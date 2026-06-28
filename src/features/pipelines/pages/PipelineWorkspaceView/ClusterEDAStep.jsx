
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, X, TriangleAlert } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Spinner } from "@/shared/ui/Spinner";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { assignCluster, detectGapDetails, recursiveGapSplit } from "@/utils/math";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import styles from "./ClusterEDAStep.module.css";

export function WSClusterEDAStep({ pipeline, onConfirm, onBack, onNavigate: _onNavigate }) {
  const k = Math.round(pipeline?.kFactor || 3);
  const [smallThreshold, setSmallThreshold] = useState(k);
  const [removedRows, setRemovedRows] = useState(new Set());
  const [expandedSup, setExpandedSup] = useState(null);
  const [viewMode, setViewMode] = useState("scatter");
  const [loading, setLoading] = useState(true);
  const [df, setDf] = useState([]);
  const [err, setErr] = useState(null);
  const [ignoring, setIgnoring] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const invoices = await wsAPI.getAllInvoices();
        const fromBackend = Array.isArray(invoices?.invoices)
          ? invoices.invoices
          : Array.isArray(invoices?.content)
          ? invoices.content
          : Array.isArray(invoices)
          ? invoices
          : [];
        // CSV/custom pipelines may not have persisted their parsed rows to the
        // backend yet when the clustering step runs. An EMPTY backend result must
        // fall back to the locally parsed rows, otherwise the 18 valid CSV rows
        // disappear between mapping/cleaning and clustering ("0 lignes"). (#17, #20)
        const invList =
          fromBackend.length > 0
            ? fromBackend
            : Array.isArray(wsStore.invoices)
            ? wsStore.invoices
            : [];
        const data = invList.map((inv) => ({
          id: inv.id || inv.invoice_ref,
          _supplier: inv.supplier || inv.supplier_code,
          _label: inv.label,
          _amount: inv.amount,
          _date: new Date(inv.date || inv.invoice_date),
        }));
        
        // Auto-detect clusters under k and mark their rows for automatic removal
        const autoRemoved = new Set();
        const supMap = {};
        data.forEach((r) => {
          if (r._amount > 0) {
            if (!supMap[r._supplier]) supMap[r._supplier] = [];
            supMap[r._supplier].push(r);
          }
        });
        
        Object.entries(supMap).forEach(([, rows]) => {
          if (rows.length >= 2) {
            const amounts = rows.map((r) => r._amount);
            const clusters = recursiveGapSplit(amounts, 2.5, 30, 2);
            const clusterMeans = [...clusters].sort((a, b) => a - b);
            
            clusterMeans.forEach((mean, ci) => {
              const clusterInvoices = rows.filter(
                (r) => assignCluster(r._amount, clusterMeans) === ci
              );
              if (clusterInvoices.length < k) {
                clusterInvoices.forEach(r => autoRemoved.add(r));
              }
            });
          }
        });
        
        setRemovedRows(autoRemoved);
        setDf(data);
      } catch (e) {
        const data = (Array.isArray(wsStore.invoices) ? wsStore.invoices : []).map((inv, i) => ({
          id: inv.id || inv.invoice_ref || `INV-${i + 1}`,
          _supplier: inv.supplier || inv.supplier_code,
          _label: inv.label,
          _amount: Number(inv.amount || 0),
          _date: new Date(inv.date || inv.invoice_date),
        }));
        setDf(data);
        setErr(e.message);
      }
      setLoading(false);
    })();
  }, [pipeline, k]);
  const supplierClusters = useMemo(() => {
    const supMap = {};
    df.forEach((r) => {
      if (!supMap[r._supplier]) supMap[r._supplier] = [];
      if (r._amount > 0 && !removedRows.has(r)) supMap[r._supplier].push(r);
    });
    return Object.entries(supMap)
      .filter(([, rows]) => rows.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([sup, rows]) => {
        const amounts = rows.map((r) => r._amount);
        const clusters = recursiveGapSplit(amounts, 2.5, 30, 2);
        const gapDetails = detectGapDetails(amounts);
        const clusterMeans = [...clusters].sort((a, b) => a - b);
        const clusterRows = clusterMeans.map((mean, ci) => ({
          mean: Math.round(mean),
          rows: rows.filter(
            (r) => assignCluster(r._amount, clusterMeans) === ci
          ),
          index: ci,
        }));
        const mn = Math.min(...amounts),
          mx = Math.max(...amounts);
        const bucketCount = Math.min(
          30,
          Math.max(10, Math.floor(amounts.length / 8))
        );
        const bs = (mx - mn) / bucketCount || 1;
        const buckets = Array.from({ length: bucketCount }, (_, i) => ({
          x: Math.round(mn + i * bs),
          count: 0,
        }));
        amounts.forEach((a) => {
          const bi = Math.min(bucketCount - 1, Math.floor((a - mn) / bs));
          buckets[bi].count++;
        });
        const scatterData = rows.map((r, ri) => ({
          x: ri,
          y: r._amount,
          cluster: assignCluster(r._amount, clusterMeans),
          date: r._date?.toISOString().split("T")[0],
        }));
        const sorted = [...amounts].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const med = sorted[Math.floor(sorted.length * 0.5)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        return {
          sup,
          rows,
          amounts,
          clusterMeans,
          clusterRows,
          gapDetails,
          buckets,
          scatterData,
          sorted,
          q1,
          med,
          q3,
          mn,
          mx,
          hasGap: clusters.length > 1,
        };
      });
  }, [df, removedRows]);
  const toggleRemove = (sup, ci) => {
    const rows =
      supplierClusters.find((s) => s.sup === sup)?.clusterRows[ci]?.rows || [];
    const newSet = new Set(removedRows);
    const allRemoved = rows.every((r) => newSet.has(r));
    rows.forEach((r) => (allRemoved ? newSet.delete(r) : newSet.add(r)));
    setRemovedRows(newSet);
  };
  const isRemoved = (sup, ci) => {
    const r =
      supplierClusters.find((s) => s.sup === sup)?.clusterRows[ci]?.rows || [];
    return r.length > 0 && r.every((r2) => removedRows.has(r2));
  };
  const confirm = async () => {
    setIgnoring(true);
    try {
      const ids = [...removedRows].map((r) => r.id).filter(Boolean);
      if (ids.length > 0) await wsAPI.ignoreInvoices(ids);
      onConfirm();
    } catch (e) {
      setErr(e.message);
    }
    setIgnoring(false);
  };
  if (loading)
    return (
      <div className={styles.shell}>
        <div className={styles.loadingState}>
          <Spinner size={40} />
        </div>
      </div>
    );
  return (
    <div className={styles.shell}>
      <h2 className={styles.title}>
        Analyse des clusters (EDA)
      </h2>
      <p className={styles.subtitle}>
        Recursive Gap Split · K-means · Visualisez et nettoyez les
        sous-catégories par fournisseur
      </p>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      <div className={styles.metricsGrid}>
        {[
          { lbl: "Lignes", val: df.length.toLocaleString(), tone: "toneInfo" },
          {
            lbl: "Avec gap détecté",
            val: supplierClusters.filter((s) => s.hasGap).length,
            tone: "toneWarning",
          },
          { lbl: "À retirer", val: removedRows.size, tone: "toneRed" },
        ].map((k) => (
          <div
            key={k.lbl}
            className={`glass-card-sm ${styles.metricCard} ${styles[k.tone]}`}
          >
            <div className={styles.metricValue}>
              {k.val}
            </div>
            <div className={styles.metricLabel}>
              {k.lbl}
            </div>
          </div>
        ))}
      </div>
      <div
        className={`glass-card ${styles.toolbar}`}
      >
        <div className={styles.thresholdControl}>
          <span className={styles.thresholdLabel}>
            Seuil petit cluster ≤ {smallThreshold}
          </span>
          <input
            type="range"
            min={1}
            max={20}
            value={smallThreshold}
            onChange={(e) => setSmallThreshold(Number(e.target.value))}
            className={`slider ${styles.rangeInput}`}
          />
        </div>
        <div className={styles.viewToggleRow}>
          {[
            ["scatter", "K-means"],
            ["histogram", "Histo"],
            ["violin", "Box"],
          ].map(([id, lbl]) => (
            <button
              key={id}
              className={`btn-toggle${viewMode === id ? " active" : ""} ${styles.smallButton}`}
              onClick={() => setViewMode(id)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {supplierClusters.map(
        ({
          sup,
          amounts,
          clusterMeans,
          clusterRows,
          gapDetails,
          buckets,
          scatterData,
          q1,
          med,
          q3,
          mn,
          mx,
          hasGap,
        }) => {
          const isExpanded = expandedSup === sup;
          const totalAmt = amounts.reduce((a, b) => a + b, 0);
          return (
            <div
              key={sup}
              className={`glass-card ${styles.supplierCard}`}
            >
              <div
                className={`${styles.supplierHeader} ${isExpanded ? styles.supplierHeaderExpanded : ""}`}
                onClick={() => setExpandedSup(isExpanded ? null : sup)}
              >
                <div className={`${styles.supplierIdentity} ${hasGap ? styles.statusGap : styles.statusHomogeneous}`}>
                  <div className={styles.supplierName}>
                    {sup}
                  </div>
                  <span className={`badge badge-${hasGap ? "warn" : "ok"}`}>
                    {hasGap ? `${clusterMeans.length} clusters` : "Homogène"}
                  </span>
                  {hasGap && gapDetails && (
                    <span className={styles.gapText}>
                      Gap:{" "}
                      <strong className={styles.gapStrong}>
                        {formatEuro(gapDetails.gapEuros)}
                      </strong>{" "}
                      · C1~{formatEuro(gapDetails.leftMean)} → C2~
                      {formatEuro(gapDetails.rightMean)}
                    </span>
                  )}
                </div>
                <div className={styles.supplierSummary}>
                  <span className={styles.summaryText}>
                    {amounts.length} fact. · {formatEuro(Math.round(totalAmt))}
                  </span>
                  <span className={styles.chevron}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className={styles.expandedBody}>
                  {viewMode === "scatter" && (
                    <div className={styles.chartBlock}>
                      <div className={styles.chartCaption}>
                        Scatter K-means — chaque point = une facture, couleur =
                        cluster
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <ScatterChart
                          margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={COLORS.grey100}
                          />
                          <XAxis
                            dataKey="x"
                            name="Index"
                            tick={{ fill: COLORS.grey500, fontSize: 8 }}
                            tickLine={false}
                          />
                          <YAxis
                            dataKey="y"
                            name="Montant"
                            tickFormatter={formatCompactEuro}
                            tick={{ fill: COLORS.grey500, fontSize: 8 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload;
                              return (
                                <div className={`${styles.tooltip} ${styles[`chartColor${(d?.cluster || 0) % 9}`]}`}>
                                  <div className={styles.tooltipCluster}>
                                    C{(d?.cluster || 0) + 1}
                                  </div>
                                  <div>{formatEuro(Math.round(d?.y || 0))}</div>
                                  <div className={styles.tooltipDate}>
                                    {d?.date}
                                  </div>
                                </div>
                              );
                            }}
                          />
                          {clusterMeans.map((mean, ci) => (
                            <Scatter
                              key={ci}
                              name={`C${ci + 1} (~${formatEuro(Math.round(mean))})`}
                              data={scatterData.filter((d) => d.cluster === ci)}
                              fill={CHART_COLORS[ci % CHART_COLORS.length]}
                              fillOpacity={0.72}
                            />
                          ))}
                          {clusterMeans.map((mean, ci) => (
                            <ReferenceLine
                              key={`r${ci}`}
                              y={mean}
                              stroke={CHART_COLORS[ci % CHART_COLORS.length]}
                              strokeWidth={2}
                              strokeDasharray="6 3"
                              label={{
                                value: `μ${ci + 1}`,
                                fill: CHART_COLORS[ci % CHART_COLORS.length],
                                fontSize: 8,
                                position: "right",
                              }}
                            />
                          ))}
                          <Legend />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {viewMode === "histogram" && (
                    <div className={styles.chartBlock}>
                      <div className={styles.chartCaption}>
                        Distribution — barres colorées par cluster assigné
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart
                          data={buckets}
                          margin={{ top: 10, right: 10, bottom: 5, left: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={COLORS.grey100}
                          />
                          <XAxis
                            dataKey="x"
                            tickFormatter={(v) => `€${Math.round(v / 1000)}K`}
                            tick={{ fill: COLORS.grey500, fontSize: 8 }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: COLORS.grey500, fontSize: 8 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            content={({ active, payload }) =>
                              active && payload?.length ? (
                                <div className={styles.tooltip}>
                                  <div>~{formatEuro(payload[0].payload.x)}</div>
                                  <div>
                                    <strong>{payload[0].value}</strong> fact.
                                  </div>
                                </div>
                              ) : null
                            }
                          />
                          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                            {buckets.map((b, bi) => {
                              const ci =
                                clusterMeans.length > 1
                                  ? assignCluster(b.x, clusterMeans)
                                  : 0;
                              return (
                                <Cell
                                  key={bi}
                                  fill={`${CHART_COLORS[ci % CHART_COLORS.length]}90`}
                                  stroke={CHART_COLORS[ci % CHART_COLORS.length]}
                                  strokeWidth={0.5}
                                />
                              );
                            })}
                          </Bar>
                          {clusterMeans.map((mean, ci) => (
                            <ReferenceLine
                              key={ci}
                              x={Math.round(mean)}
                              stroke={CHART_COLORS[ci % CHART_COLORS.length]}
                              strokeWidth={2}
                              strokeDasharray="5 3"
                              label={{
                                value: `C${ci + 1}`,
                                fill: CHART_COLORS[ci % CHART_COLORS.length],
                                fontSize: 8,
                                position: "top",
                              }}
                            />
                          ))}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {viewMode === "violin" &&
                    (() => {
                      const range = mx - mn || 1;
                      const pct = (v) =>
                        Number((((v - mn) / range) * 88 + 6).toFixed(1));
                      const iqr = q3 - q1;
                      const wL = Math.max(mn, q1 - 1.5 * iqr),
                        wH = Math.min(mx, q3 + 1.5 * iqr);
                      const outliers = amounts
                        .sort((a, b) => a - b)
                        .filter((v) => v < wL || v > wH);
                      return (
                        <div className={styles.chartBlock}>
                          <div className={styles.chartCaption}>
                            Box plot + distribution
                          </div>
                          <svg className={styles.boxPlot} viewBox="0 0 100 48" preserveAspectRatio="none" aria-label="Box plot distribution">
                            <line className={styles.boxWhisker} x1={pct(wL)} y1="10" x2={pct(wL)} y2="38" />
                            <rect className={styles.boxIqr} x={pct(q1)} y="6" width={Math.max(1, pct(q3) - pct(q1))} height="36" />
                            <line className={styles.boxMedian} x1={pct(med)} y1="4" x2={pct(med)} y2="44" />
                            <line className={styles.boxWhisker} x1={pct(wH)} y1="10" x2={pct(wH)} y2="38" />
                            {outliers.slice(0, 6).map((v, oi) => (
                              <circle
                                key={oi}
                                className={styles.boxOutlier}
                                cx={pct(v)}
                                cy="24"
                                r="3.5"
                              >
                                <title>{formatEuro(Math.round(v))}</title>
                              </circle>
                            ))}
                          </svg>
                          <div className={styles.boxLabels}>
                            <span>{formatEuro(Math.round(mn))}</span>
                            <span>Q1:{formatEuro(Math.round(q1))}</span>
                            <span className={styles.boxMedianLabel}>
                              Méd:{formatEuro(Math.round(med))}
                            </span>
                            <span>Q3:{formatEuro(Math.round(q3))}</span>
                            <span>{formatEuro(Math.round(mx))}</span>
                          </div>
                          {outliers.length > 0 && (
                            <div className={`${styles.outlierText} ${styles.inlineIconText}`}>
                              <TriangleAlert size={9} />{" "}
                              {outliers.length} valeur(s) aberrante(s)
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  <div className={styles.clusterGrid}>
                    {clusterRows.map((cl, ci) => {
                      const removed = isRemoved(sup, ci);
                      const isUnderK = cl.rows.length < k;
                      const isSmall = cl.rows.length <= smallThreshold;
                      const vals = cl.rows.map((r) => r._amount);
                      const clMu = vals.length
                        ? vals.reduce((a, b) => a + b, 0) / vals.length
                        : 0;
                      const clStd =
                        vals.length > 1
                          ? Math.sqrt(
                              vals
                                .map((v) => (v - clMu) ** 2)
                                .reduce((a, b) => a + b, 0) / vals.length
                            )
                          : 0;
                      return (
                        <div key={ci} className={`${styles.clusterCard} ${styles[`chartColor${ci % 9}`]} ${(removed || isUnderK) ? styles.clusterCardRemoved : isSmall ? styles.clusterCardSmall : ""}`}>
                          <div className={styles.clusterHeader}>
                            <div className={styles.clusterDot} />
                            <span className={styles.clusterTitle}>
                              Cluster {ci + 1}
                            </span>
                            {isUnderK ? (
                              <span className={`badge badge-red ${styles.badgeInline}`}>Sous K <X size={9} /></span>
                            ) : isSmall && !removed ? (
                              <span className={`badge badge-warn ${styles.badgeInline}`}>Petit<TriangleAlert size={9} strokeWidth={2.5} className={styles.badgeIconOffset}/></span>
                            ) : null}
                          </div>
                          <div className={styles.clusterMean}>
                            {formatEuro(Math.round(clMu))}
                          </div>
                          <div className={styles.clusterStats}>
                            σ {formatEuro(Math.round(clStd))} · {cl.rows.length} fact.
                          </div>
                          <button
                            className={`${removed ? "btn-ghost" : "btn-danger"} ${styles.clusterButton}`}
                            onClick={() => toggleRemove(sup, ci)}
                          >
                            {removed ? (
                              <><RotateCcw size={11} color={COLORS.success} /> Conserver</>
                            ) : (
                              <><X size={11} color={COLORS.red} /> Retirer {cl.rows.length}</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        }
      )}
      {supplierClusters.length === 0 && (
        <div
          className={`glass-card ${styles.emptyState}`}
        >
          Pas assez de données par fournisseur (min 2 factures).
        </div>
      )}
      <div className={styles.footerActions}>
        {onBack && (
          <button
            className={`btn-ghost ${styles.backButton}`}
            onClick={onBack}
          >
            ← Retour
          </button>
        )}
        <button
          onClick={confirm}
          className={`btn-primary ${styles.confirmButton}`}
          disabled={ignoring}
        >
          {ignoring ? (
            <>
              <Spinner size={16} color="#fff" />
              Ignoring…
            </>
          ) : (
            `Confirmer & construire les séries · ${
              df.length - removedRows.size
            } lignes${
              removedRows.size > 0 ? ` · ${removedRows.size} retirées` : ""
            }`
          )}
        </button>
      </div>
    </div>
  );
}
