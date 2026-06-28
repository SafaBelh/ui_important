
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CustomTip } from "@/shared/ui/CustomTip";
import { Icon } from "@/shared/ui/Icon";
import { Spinner } from "@/shared/ui/Spinner";
import { COLORS, CHART_COLORS } from "@/constants/colors";
import { wsAPI } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import { logError } from "@/shared/utils/logError";
import styles from "./SeriesConfigStep.module.css";

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function rhythmLabel(days) {
  if (!days || days <= 0) return "—";
  if (days >= 320) return "Annuel";
  if (days >= 150) return "Semestriel";
  if (days >= 75) return "Trimestriel";
  // Every ~2 months (e.g. a bimonthly water invoice ~61j): previously this fell
  // into "Mensuel" because there was no two-monthly bucket. (#21, #22)
  if (days >= 46) return "Bimestriel";
  if (days >= 25) return "Mensuel";
  if (days >= 12) return "Bimensuel";
  if (days >= 5) return "Hebdomadaire";
  return "Quotidien";
}

export function WSSeriesConfig({
  series: initSeries,
  groupFields: _groupFields,
  onConfirm,
  onBack,
  onNavigate: _onNavigate,
  showActiveToggle: _showActiveToggle = false,
  onSeriesChange = null,
  confirmLabel = "Sauvegarder la configuration",
  saveLocalOnly = false,
}) {
  const [series, setSeries] = useState(
    (Array.isArray(initSeries) ? initSeries : []).map((s) => ({ ...s, _dirty: false, active: s.active !== false }))
  );
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [seasonality, setSeasonality] = useState(null);
  const [seriesInvoices, setSeriesInvoices] = useState([]);
  const [seasonTab, setSeasonTab] = useState("monthly");
  const s = series[selected];
  const selectedSeriesId = s?.id;
  const selectedSeriesLabel = s?.label;
  const selectedSeriesSupplier = s?.supplier;
  const selectedTolerancePct = s?.tolerance_pct;
  const selectedToleranceDays = s?.tolerance_days;
  const initSeriesKey = JSON.stringify((Array.isArray(initSeries) ? initSeries : []).map((item) => [item.id, item.name, item.kind, item.n, item.mu, item.label]));
  useEffect(() => {
    const next = (Array.isArray(initSeries) ? initSeries : []).map((item) => ({ ...item, _dirty: false, active: item.active !== false }));
    setSeries(next);
    setSelected((idx) => Math.min(idx, Math.max(0, next.length - 1)));
  }, [initSeries, initSeriesKey]);
  const update = (idx, patch) => {
    setSeries((arr) => {
      const next = arr.map((x, i) =>
        i === idx ? { ...x, ...patch, _dirty: true } : x
      );
      if (onSeriesChange) onSeriesChange(next);
      return next;
    });
  };
  const toggleActive = (idx, e) => {
    e.stopPropagation();
    update(idx, { active: !series[idx].active });
  };
  useEffect(() => {
    if (!selectedSeriesId) return;
    setSeasonality(null);
    setSeriesInvoices([]);
    (async () => {
      try {
        const seaPromise = wsAPI.getSeriesSeasonality(selectedSeriesId).catch(() => null);
        const invPromise = wsAPI.getAllInvoices().catch(() => []);
        const [sea, allInv] = await Promise.all([seaPromise, invPromise]);

        if (sea?.monthly_mu) setSeasonality(sea.monthly_mu);
        const inv = Array.isArray(allInv) ? allInv : allInv?.invoices || [];
        setSeriesInvoices(
          inv.filter(
            (r) =>
              (r.supplier || r.supplier_code) === selectedSeriesSupplier &&
              (selectedSeriesLabel ? r.label === selectedSeriesLabel : !r.label || r.label === null)
          )
        );
      } catch (error) {
        logError("seriesConfig.loadSeasonality", error);
      }
    })();
  }, [selected, selectedSeriesId, selectedSeriesLabel, selectedSeriesSupplier]);
  useEffect(() => {
    if (!selectedSeriesId) return;
    setForecast(null);
    (async () => {
      try {
        const fc = await wsAPI.getForecast(selectedSeriesId, {
          tolerance_pct: selectedTolerancePct,
          tolerance_days: selectedToleranceDays,
        });
        setForecast(fc);
      } catch (error) {
        logError("seriesConfig.loadForecast", error);
      }
    })();
  }, [selected, selectedSeriesId, selectedTolerancePct, selectedToleranceDays]);
  const timeSeriesData = useMemo(
    () =>
      seriesInvoices
        .sort(
          (a, b) =>
            new Date(a.date || a.invoice_date) -
            new Date(b.date || b.invoice_date)
        )
        .map((r) => ({ date: r.date || r.invoice_date, amt: r.amount })),
    [seriesInvoices]
  );
  const rhythmData = useMemo(() => {
    const sorted = timeSeriesData
      .map(x => x.date)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = Math.max(1, Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000));
      if (Number.isFinite(diff)) gaps.push(diff);
    }
    const median = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : (s?.median_gap_days || s?.rhythm_days || 30);
    const count = Math.max(24, Math.min(72, Math.max(gaps.length, s?.n || 24)));
    return Array.from({ length: count }, (_, i) => ({
      idx: i + 1,
      gap: gaps[i] || Math.max(1, Math.round(median + ((i % 7) - 3) * 0.9)),
      median,
    }));
  }, [timeSeriesData, s]);
  const monthlyStatsData = useMemo(
    () =>
      !seasonality
        ? null
        : Array.from({ length: 12 }, (_, i) => ({
            month: [
              "Jan",
              "Fév",
              "Mar",
              "Avr",
              "Mai",
              "Jun",
              "Jul",
              "Aoû",
              "Sep",
              "Oct",
              "Nov",
              "Déc",
            ][i],
            mu: Math.round(seasonality[i + 1] || s?.mu) || 0,
          })),
    [seasonality, s]
  );
  const color = CHART_COLORS[selected % CHART_COLORS.length];
  const saveAll = async () => {
    setSaving(true);
    setErr(null);
    try {
      if (!saveLocalOnly) {
        await Promise.all(
          series
            .filter((x) => x._dirty)
            .map((x) =>
              wsAPI.updateSeriesConfig(x.id, {
                use_seasonality: x.use_seasonality,
                tolerance_pct: x.tolerance_pct,
                tolerance_days: x.tolerance_days,
                forecast_start_today: x.forecast_start_today,
              })
            )
        );
      }
      const savedSeries = series.map((u) => ({ ...u, _dirty: false }));
      onConfirm(savedSeries);
      setSeries(savedSeries);
      setSaving(false);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };
  if (!s) return null;
  return (
    <div className={`${styles.shell} ${styles[`chartColor${selected % 9}`]}`}>
      <h2 className={styles.title}>
        Configuration des séries
      </h2>
      <p className={styles.subtitle}>
        Tolérances · Analyse automatique des saisons et prévisions
      </p>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      <div className={styles.layout}>
        <div
          className={`glass-card ${styles.sidebar}`}
        >
          <div className={styles.sidebarTitle}>
            Séries ({series.length})
          </div>
          <div className={styles.seriesList}>
            {series.map((s2, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                className={`${styles.seriesItem} ${styles[`chartColor${i % 9}`]} ${selected === i ? styles.seriesItemSelected : ""} ${s2.active === false ? styles.seriesItemInactive : ""}`}
              >
                <div className={styles.seriesRow}>
                  <div className={`${styles.seriesItemTitle} ${s2.active === false ? styles.seriesItemTitleInactive : ""}`}>
                    {[s2.supplier, s2.label].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className={styles.seriesMeta}>
                  {s2.n} fact. · CV {(s2.cv * 100).toFixed(0)}%
                </div>
                {s2._dirty && (
                  <div className={styles.dirtyText}>
                    ● non sauvegardé
                  </div>
                )}
                {s2.active === false && (
                  <div className={styles.inactiveText}>
                    <Icon name="powerOff" size={9} color={COLORS.grey400} />
                    Désactivée
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div
            className={`glass-card ${styles.mainCard} ${s.active === false ? styles.mainCardInactive : ""}`}
          >
            <div className={styles.headerRow}>
              <div className={styles.selectedTitle}>
                {[s.supplier, s.label].filter(Boolean).join(" · ")}
              </div>
              <label
                className={`${styles.toggleLabel} ${s.active !== false ? styles.toggleActive : styles.toggleInactive}`}
              >
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    toggleActive(selected, { stopPropagation: () => {}, ...e });
                  }}
                  className={styles.toggleTrack}
                >
                  <div className={styles.toggleKnob} />
                </div>
                <span className={styles.toggleText}>
                  {s.active !== false ? <>Active</> : <>Désactivée</>}
                </span>
              </label>
            </div>
            <div className={styles.summary}>
              {s.n} fact. · μ {formatEuro(Math.round(s.mu))} · CV{" "}
              {(s.cv * 100).toFixed(1)}%
            </div>
            <div className={styles.panel}>
              <div className={styles.panelTitle}>
                Tolérances
              </div>
              <div className={styles.rangeRow}>
                <span className={styles.rangeLabel}>
                  Tolérance montant (%)
                </span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={s.tolerance_pct}
                  onChange={(e) =>
                    update(selected, { tolerance_pct: Number(e.target.value) })
                  }
                  className={`slider ${styles.rangeInput}`}
                />
                <span className={styles.rangeValue}>
                  ±{s.tolerance_pct}%
                </span>
              </div>
              <div className={styles.rangeRow}>
                <span className={styles.rangeLabel}>
                  Tolérance date (jours)
                </span>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={s.tolerance_days || 10}
                  onChange={(e) =>
                    update(selected, { tolerance_days: Number(e.target.value) })
                  }
                  className={`slider ${styles.rangeInput}`}
                />
                <span className={styles.rangeValue}>
                  ±{s.tolerance_days || 10}j
                </span>
              </div>
              <div className={styles.thresholdGrid}>
                <div className={styles.thresholdBox}>
                  Seuil max:{" "}
                  <strong className={styles.dangerText}>
                    {formatEuro(Math.round(s.mu * (1 + s.tolerance_pct / 100)))}
                  </strong>
                </div>
                <div className={styles.thresholdBox}>
                  Seuil min:{" "}
                  <strong className={styles.successText}>
                    {formatEuro(Math.round(s.mu * (1 - s.tolerance_pct / 100)))}
                  </strong>
                </div>
              </div>
            </div>
            <div className={styles.panel}>
              <div className={styles.panelTitleCompact}>
                Saisonnalité & prévision automatiques
              </div>
              <div className={styles.panelText}>
                Le moteur détecte automatiquement la saisonnalité, le rythme de facturation et la fenêtre de prévision. Seules les tolérances restent configurables ici.
              </div>
            </div>
          </div>
          {timeSeriesData.length > 1 && (
            <div
              className={`glass-card ${styles.chartCard}`}
            >
              <div className={styles.chartTitle}>
                Montantsnts dans le temps
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart
                  data={timeSeriesData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: COLORS.grey500, fontSize: 8 }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={formatCompactEuro}
                    tick={{ fill: COLORS.grey500, fontSize: 8 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTip />} />
                  <ReferenceLine
                    y={s.mu}
                    stroke={COLORS.warning}
                    strokeDasharray="4 2"
                    label={{ value: "μ", fill: COLORS.warning, fontSize: 9 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amt"
                    name="Montant"
                    stroke={color}
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {monthlyStatsData && (
            <div
              className={`glass-card ${styles.chartCard}`}
            >
              <div className={styles.chartTitle}>
                Analyse de saisonnalité
              </div>
              <div className={styles.seasonTabs}>
                {[
                  ["monthly", "Par mois"],
                  ["quarterly", "Par trimestre"],
                ].map(([id, lbl]) => (
                  <button
                    key={id}
                    onClick={() => setSeasonTab(id)}
                    className={`tab${seasonTab === id ? " active" : ""} ${styles.smallTab}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {seasonTab === "monthly" && (
                <>
                  <div className={styles.caption}>
                    Montant moyen par mois (historique)
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={monthlyStatsData}
                      margin={{ top: 5, right: 8, bottom: 5, left: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: COLORS.grey500, fontSize: 9 }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactEuro}
                        tick={{ fill: COLORS.grey500, fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTip />} />
                      <Bar
                        dataKey="mu"
                        name="Moy €"
                        fill={color}
                        fillOpacity={0.75}
                        radius={[4, 4, 0, 0]}
                      />
                      <ReferenceLine
                        y={s.mu}
                        stroke={COLORS.warning}
                        strokeDasharray="4 2"
                        label={{
                          value: "μ global",
                          fill: COLORS.warning,
                          fontSize: 9,
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className={styles.monthlyGrid}>
                    {monthlyStatsData.map((m) => (
                      <div
                        key={m.month}
                        className={`${styles.monthCell} ${m.mu > 0 ? styles.monthCellActive : ""}`}
                      >
                        <div className={styles.monthName}>
                          {m.month}
                        </div>
                        <div className={`${styles.monthValue} ${m.mu > 0 ? styles.monthValueActive : ""}`}>
                          {m.mu > 0 ? formatCompactEuro(m.mu) : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {seasonTab === "quarterly" &&
                (() => {
                  const qd = [0, 3, 6, 9].map((mo, qi) => ({
                    quarter: `Q${qi + 1}`,
                    mu: Math.round(
                      (monthlyStatsData[mo].mu +
                        monthlyStatsData[mo + 1].mu +
                        monthlyStatsData[mo + 2].mu) /
                        3
                    ),
                  }));
                  return (
                    <>
                      <div className={styles.caption}>
                        Montant moyen par trimestre
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart
                          data={qd}
                          margin={{ top: 5, right: 8, bottom: 5, left: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={COLORS.grey100}
                          />
                          <XAxis
                            dataKey="quarter"
                            tick={{ fill: COLORS.grey500, fontSize: 10 }}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={formatCompactEuro}
                            tick={{ fill: COLORS.grey500, fontSize: 9 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<CustomTip />} />
                          <Bar
                            dataKey="mu"
                            name="Moy trim €"
                            radius={[6, 6, 0, 0]}
                          >
                            {qd.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                            ))}
                            <LabelList
                              dataKey="mu"
                              formatter={formatCompactEuro}
                              position="top"
                              fill={COLORS.grey500}
                              fontSize={10}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  );
                })()}
            </div>
          )}
          {rhythmData.length > 0 && (
            <div
              className={`glass-card ${styles.chartCardRound}`}
            >
              <div className={styles.chartTitleStrong}>
                Écarts entre factures (jours)
              </div>
              <div className={styles.statPills}>
                <div className={styles.statPill}>
                  <span className={styles.statLabel}>Écart médian </span>
                  <span className={styles.statValueInfo}>{rhythmData[0]?.median || 30}j</span>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statLabel}>Rythme détecté </span>
                  <span className={styles.statValueSuccess}>{s.rhythm || s.frequencyLabel || rhythmLabel(rhythmData[0]?.median || 30)}</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={rhythmData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
                  <XAxis dataKey="idx" tick={{ fill: COLORS.grey500, fontSize: 9 }} interval={2} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.grey500, fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, Math.max(36, Math.ceil((rhythmData[0]?.median || 30) * 1.25))]} />
                  <Tooltip formatter={(v) => [`${v} jours`, "Écart"]} />
                  <ReferenceLine y={rhythmData[0]?.median || 30} stroke="#D8A444" strokeDasharray="5 5" label={{ value: `Médiane ${rhythmData[0]?.median || 30}j`, position: "insideTop", fontSize: 10, fill: "#D8A444" }} />
                  <Bar dataKey="gap" fill="#D1D5DB" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {forecast?.forecast?.length > 0 && (
            <div
              className={`glass-card ${styles.chartCardRound}`}
            >
              <div className={styles.chartTitleStrong}>
                Prévision 12 mois
              </div>
              <div className={styles.forecastSubtitle}>
                Tolérances appliquées · ±{s.tolerance_pct}% · ±{s.tolerance_days}j
              </div>
              <div className={styles.forecastGrid}>
                {forecast.forecast.map((f, i) => {
                  const predicted = Number.isFinite(Number(f.predicted)) ? Number(f.predicted) : Number(s.mu || 0);
                  const lower = Number.isFinite(Number(f.lower)) ? Number(f.lower) : predicted * (1 - (s.tolerance_pct || 10) / 100);
                  const upper = Number.isFinite(Number(f.upper)) ? Number(f.upper) : predicted * (1 + (s.tolerance_pct || 10) / 100);
                  const expectedDate = f.date || addDays(new Date(), (i + 1) * (rhythmData[0]?.median || 30));
                  const toleranceDays = Number(s.tolerance_days || 10);
                  return (
                    <div
                      key={`${f.date || "forecast"}-${i}`}
                      className={styles.forecastCell}
                    >
                    <div className={styles.forecastIndex}>
                      #{i + 1}
                    </div>
                    <div className={styles.forecastDate}>
                      {expectedDate}
                    </div>
                    <div className={styles.forecastWindow}>
                      {addDays(expectedDate, -toleranceDays)} → {addDays(expectedDate, toleranceDays)}
                    </div>
                    <div className={styles.forecastAmount}>
                      {formatEuro(Math.round(predicted))}
                    </div>
                    <div className={styles.forecastRange}>
                      <span className={styles.successText}>
                        {formatEuro(Math.round(lower))}
                      </span>{" "}
                      –{" "}
                      <span className={styles.dangerText}>
                        {formatEuro(Math.round(upper))}
                      </span>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {onBack && (
          <button
            className={`btn-ghost ${styles.backButton}`}
            onClick={onBack}
          >
            ← Retour
          </button>
        )}
        <button
          onClick={saveAll}
          className={`btn-primary ${styles.saveButton}`}
          disabled={saving}
        >
          {saving ? (
            <>
              <Spinner size={16} color="#fff" />
              Sauvegarde…
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </div>
  );
}
