// Series detail drawer: rhythm/amount analytics, distribution charts and per-document
// breakdown for one series. Extracted from SeriesView.
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, CalendarDays, Clock, TrendingUp, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { T, addDays, isCommandePipeline, rhythmLabel } from "@/features/series/utils/seriesHelpers";
import { SectionTitle, StatPill } from "@/features/series/components/seriesComponents";
import { logError } from "@/shared/utils/logError";
import styles from "./SeriesDetailModal.module.css";

const cx = (...names) => names.filter(Boolean).join(" ");

export function SeriesDetailModal({ series, pipeline, onClose }) {
  const mu = series.mu || 0;
  const sigma = series.sigma || 0;
  const cv = series.cv || 0;
  const n = series.n || 0;
  const isCommand = series.isCommandSeries || isCommandePipeline(pipeline);
  const tolerancePct = series.tolerance_pct ?? pipeline?.tolerancePct ?? 10;
  const toleranceDays = series.tolerance_days ?? pipeline?.toleranceDays ?? 10;
  const minBound = mu * (1 - tolerancePct / 100);
  const maxBound = mu * (1 + tolerancePct / 100);
  const monthlyMuMap = useMemo(() => series.monthlyMuMap || {}, [series.monthlyMuMap]);
  // Seasonal envelope is computed by the backend (series DTO seasonalLow/High); the
  // UI only renders it. No client-side min/max/threshold recompute. (backend-only rule)
  const isSeasonal = series.use_seasonality === true || series.useSeasonality === true;
  const seasonalMinBound = series.seasonal_low ?? series.seasonalLow ?? minBound;
  const seasonalMaxBound = series.seasonal_high ?? series.seasonalHigh ?? maxBound;
  const [seasonTab, setSeasonTab] = useState("monthly");
  const [closeHovered, setCloseHovered] = useState(false);
  const [forecastHoverIndex, setForecastHoverIndex] = useState(null);

  // Chart-ready 12-month profile comes from the backend (series.monthly_profile,
  // missing months already interpolated). Fall back to raw monthlyMu only if absent.
  const monthlyProfile = series.monthly_profile ?? series.monthlyProfile ?? null;
  const monthlyData = useMemo(() => {
    const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    return months.map((name, i) => ({
      name,
      mu: monthlyProfile ? (monthlyProfile[i] ?? mu) : (monthlyMuMap[String(i + 1)] ?? mu),
    }));
  }, [monthlyProfile, monthlyMuMap, mu]);

  // Real engine forecast (no fabricated history): the chart and the rhythm
  // gaps both come from /pipelines/{pid}/series/{sid}/forecast.
  const [forecastItems, setForecastItems] = useState(null);
  useEffect(() => {
    if (isCommand || !pipeline?.id || !series?.id) { setForecastItems([]); return; }
    let live = true;
    setForecastItems(null);
    wsStore.activePipelineId = pipeline.id;
    // Admin impersonation: forecast must be fetched in the pipeline's tenant.
    if (pipeline.tenantId) wsStore.activeTenantId = pipeline.tenantId;
    wsAPI.getForecast(series.id)
      .then(res => {
        if (!live) return;
        const items = res?.forecast || res?.items || res?.content || (Array.isArray(res) ? res : []);
        setForecastItems(items);
      })
      .catch((error) => { logError("seriesDetail.loadForecast", error); if (live) setForecastItems([]); });
    return () => { live = false; };
  }, [isCommand, pipeline?.id, pipeline?.tenantId, series?.id]);

  const timeSeriesData = useMemo(() => {
    const fromForecast = (forecastItems || []).map(f => ({
      date: String(f.date || "").slice(0, 10),
      amt: Math.max(0, Math.round(((f.expectedAmount ?? f.expected ?? f.amount ?? f.mu ?? 0)) * 100) / 100),
    }));
    // Forecast endpoint can be empty for a freshly-built series → the chart
    // would be flat at 0. Fall back to the real monthly profile (μ par mois)
    // so "Montants dans le temps" reflects actual amounts.
    if (fromForecast.some(d => d.amt > 0)) return fromForecast;
    // Fall back to the backend-computed monthly profile (already interpolated).
    const names = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    if (!monthlyProfile) return fromForecast;
    return names.map((nm, i) => ({ date: nm, amt: Math.max(0, monthlyProfile[i] ?? 0) }));
  }, [forecastItems, monthlyProfile]);

  const rhythmData = useMemo(() => {
    const median = series.median_gap_days || series.medianGapDays || series.rhythm_days || 30;
    const dates = (forecastItems || [])
      .map(f => new Date(f.date))
      .filter(d => !Number.isNaN(+d))
      .sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round((dates[i] - dates[i - 1]) / 86400000);
      if (Number.isFinite(diff) && diff > 0) gaps.push(diff);
    }
    return gaps.map((gap, i) => ({ idx: i + 1, gap, median }));
  }, [forecastItems, series]);

  const medianGap = rhythmData[0]?.median || series.median_gap_days || series.rhythm_days || 30;
  const detectedRhythm = series.rhythm || series.frequencyLabel || rhythmLabel(medianGap);

  const expectedInvoiceDays = useMemo(() => {
    const baseDay = series.expected_day || series.expectedInvoiceDay || series.dayOfMonth || 15;
    return Array.from({ length: 12 }, () => Math.min(28, Math.max(1, Number(baseDay) || 15)));
  }, [series]);

  // Commande monthly behavior is not included in the series list payload; fetch it
  // so the drawer charts are populated instead of empty. (#2)
  const [cmdBehavior, setCmdBehavior] = useState(null);
  useEffect(() => {
    if (!isCommand || !pipeline?.id || !series?.id) { setCmdBehavior(null); return; }
    let live = true;
    wsStore.activePipelineId = pipeline.id;
    if (pipeline.tenantId) wsStore.activeTenantId = pipeline.tenantId;
    wsAPI.getMonthlyBehavior(series.id)
      .then(rows => { if (live) setCmdBehavior(Array.isArray(rows) ? rows : []); })
      .catch((error) => { logError("seriesDetail.loadMonthlyBehavior", error); if (live) setCmdBehavior([]); });
    return () => { live = false; };
  }, [isCommand, pipeline?.id, pipeline?.tenantId, series?.id]);

  const commandMonthlyData = useMemo(() => {
    const source = (cmdBehavior && cmdBehavior.length > 0) ? cmdBehavior : series.monthlyBehavior;
    if (Array.isArray(source) && source.length > 0) {
      const names = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
      return source.map((m) => ({
        month: typeof m.month === "number" ? names[m.month - 1] : m.month,
        histCount: m.histCount ?? m.historicalCount ?? 0,
        currentCount: m.currentCount ?? 0,
        histAmount: m.histAmount ?? m.historicalAmount ?? 0,
        currentAmount: m.currentAmount ?? 0,
        countRatio: m.countRatio ?? 0,
        amountRatio: m.amountRatio ?? 0,
        countAlert: !!(m.countAlert ?? m.volumeAlert),
        amountAlert: !!m.amountAlert,
      }));
    }
    if (Array.isArray(series.monthlyStats) && series.monthlyStats.length > 0) return series.monthlyStats;
    return [];
  }, [series, cmdBehavior]);
  const commandAlerts = useMemo(() => commandMonthlyData.filter(m => m.countAlert || m.amountAlert), [commandMonthlyData]);

  if (isCommand) {
    const drawer = (
      <div
        className={styles.overlay}
        onClick={onClose}
      >
        <div
          className={styles.drawer}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.header}>
            <div className={styles.headerMain}>
              <div className={cx(styles.statusDot, commandAlerts.length ? styles.statusAlert : styles.statusSuccess)} />
              <div>
                <div className={styles.title}>{series.name || series.id}</div>
                <div className={styles.subtitle}>
                  <span className={styles.subtitleStrong}>{pipeline?.name}</span>
                  <span className={styles.dotSeparator}>·</span>
                  <span>Analyse commandes par ligne budgétaire</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fermer" className={styles.closeButton}>
              <X size={14} color={T.ink500} />
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.pillStrip}>
              <StatPill label="Commandes YTD" value={n} color={T.ink700} />
              {/* Use the same source as the card (μ × n) instead of a fake €0, and
                  show N/A for budget/projection that the commande series doesn't carry. */}
              <StatPill label="Montant YTD" value={`€${(series.totalCommandes ?? mu * n).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`} color={T.info} />
              <StatPill label="Moyenne" value={`€${mu.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`} color={T.warning} />
              <StatPill label="Budget" value={series.budgetAlloue != null ? `€${series.budgetAlloue.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}` : "N/A"} color={T.ink700} />
              <StatPill label="Projection" value={series.projection != null ? `€${series.projection.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}` : "N/A"} color={T.warning} />
              <StatPill label="Alertes" value={commandAlerts.length} color={commandAlerts.length ? T.red : T.success} />
            </div>

            <div className={styles.card}>
              <SectionTitle icon={<Activity size={13} />}>Comportement mensuel des commandes</SectionTitle>
              <div className={styles.commandChartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commandMonthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: T.ink400 }} />
                    <YAxis tick={{ fontSize: 10, fill: T.ink400 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="histCount" name="Cmd hist. moyenne" fill={T.ink300} radius={[4, 4, 0, 0]} minPointSize={3} />
                    <Bar dataKey="currentCount" name="Cmd 2026" fill={T.info} radius={[4, 4, 0, 0]} minPointSize={3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.card}>
              <SectionTitle icon={<TrendingUp size={13} />}>Montants mensuels</SectionTitle>
              <div className={styles.commandChartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commandMonthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: T.ink400 }} />
                    <YAxis tick={{ fontSize: 10, fill: T.ink400 }} tickFormatter={v => `€${v.toLocaleString("fr-FR")}`} />
                    <Tooltip formatter={v => [`€${Number(v).toFixed(2)}`, "Montant"]} />
                    <Bar dataKey="histAmount" name="Montant hist. moyen" fill={T.ink300} radius={[4, 4, 0, 0]} minPointSize={3} />
                    <Bar dataKey="currentAmount" name="Montant 2026" fill={T.warning} radius={[4, 4, 0, 0]} minPointSize={3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.card}>
              <SectionTitle icon={<AlertTriangle size={13} />}>Règles d'alerte</SectionTitle>
              {commandAlerts.length === 0 ? (
                <div className={styles.alertEmpty}>Aucun mois ne dépasse les seuils de volume ou de montant pour cette série.</div>
              ) : (
                <div className={styles.alertList}>
                  {commandAlerts.map(m => (
                    <div key={m.month} className={styles.alertItem}>
                      <strong className={styles.alertMonth}>{m.month}</strong> · {m.countAlert ? `volume x${m.countRatio.toFixed(1)} ` : ""}{m.amountAlert ? `montant x${m.amountRatio.toFixed(1)}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );

    return createPortal(drawer, document.body);
  }

  const drawer = (
    <div
      className={styles.overlay}
      onClick={onClose}
    >
      <div
        className={cx(styles.drawer, styles.drawerAnimated)}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Drawer header ── */}
        <div className={cx(styles.header, styles.headerFixed)}>
          <div className={styles.headerMain}>
            {/* Active indicator */}
            <div className={cx(styles.statusDot, series.active !== false ? styles.statusSuccess : styles.statusInactive)} />
            <div>
              <div className={styles.title}>
                {series.name || series.id}
              </div>
              <div className={styles.subtitle}>
                <span className={styles.subtitleStrong}>{pipeline?.name}</span>
                <span className={styles.dotSeparator}>·</span>
                <span>{pipeline?.connector}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className={cx(styles.closeButton, closeHovered && styles.closeButtonHovered)}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
          >
            <X size={14} color={T.ink500} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className={styles.body}>

          {/* KPI strip */}
          <div className={styles.pillStrip}>
            <StatPill label={isCommand ? "Commandes" : "Factures"} value={n} color={T.ink700} />
            <StatPill
              label={isCommand ? "Total YTD" : (isSeasonal ? "Réf. saisonnière" : "Moyenne μ")}
              value={isCommand
                ? `€${(series.totalCommandes ?? mu * n).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`
                : (isSeasonal
                    ? `€${Math.round(seasonalMinBound).toLocaleString("fr-FR")}–€${Math.round(seasonalMaxBound).toLocaleString("fr-FR")}`
                    : `€${mu.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`)}
              color={T.info} />
            <StatPill label={isCommand ? "Budget" : "Écart-type σ"} value={isCommand ? (series.budgetAlloue != null ? `€${series.budgetAlloue.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}` : "N/A") : `€${sigma.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`} color={T.ink700} />
            <StatPill label={isCommand ? "Projection" : "CV"} value={isCommand ? (series.projection != null ? `€${series.projection.toLocaleString("fr-FR", { minimumFractionDigits: 0 })}` : "N/A") : `${(cv * 100).toFixed(1)}%`} color={cv > 0.25 ? T.red : T.ink700} />
            <StatPill label={isCommand ? "Dépassement" : "Tolérance"} value={isCommand ? `€${(series.overrunAmount ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}` : `${tolerancePct}%`} color={isCommand && series.overrunAmount > 0 ? T.red : T.warning} />
            {!isCommand && <StatPill label={isSeasonal ? "Seuil min (saison)" : "Seuil min"} value={`€${Math.round(isSeasonal ? seasonalMinBound : minBound).toLocaleString("fr-FR")}`} color={T.success} />}
            {!isCommand && <StatPill label={isSeasonal ? "Seuil max (saison)" : "Seuil max"} value={`€${Math.round(isSeasonal ? seasonalMaxBound : maxBound).toLocaleString("fr-FR")}`} color={T.red} />}
            {!isCommand && isSeasonal && <StatPill label="Mode" value="Saisonnier" color={T.warning} />}
          </div>

          {/* Config card */}
          <div className={styles.configCard}>
            {/* Card header bar */}
            <div className={styles.configHeader}>
              <div>
                <div className={styles.configTitle}>
                  {series.name || series.id}
                </div>
                <div className={styles.configMeta}>
                  {isCommand
                    ? `${n} cmd. · total €${(series.totalCommandes ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} · projection €${(series.projection ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })}`
                    : `${n} fact. · μ €${mu.toLocaleString("fr-FR", { minimumFractionDigits: 0 })} · CV ${(cv * 100).toFixed(1)}%`}
                </div>
              </div>
              <span className={cx(styles.activeBadge, series.active === false ? styles.badgeInactive : styles.badgeActive)}>
                {series.active === false ? "Désactivée" : "Active"}
              </span>
            </div>

            <div className={styles.configBody}>
              {/* Tolerance sliders */}
              <div className={styles.toleranceBox}>
                <div className={styles.blockTitle}>
                  Tolérances
                </div>
                {[
                  ["Montant (%)", tolerancePct, `±${tolerancePct}%`, false],
                  ["Date (jours)", toleranceDays, `±${toleranceDays}j`, true],
                ].map(([label, value, display, isDate]) => (
                  <div key={label} className={styles.toleranceRow}>
                    <span className={styles.toleranceLabel}>{label}</span>
                    <input type="range" min={isDate ? 1 : 0} max={isDate ? 60 : 50}
                      value={value} disabled
                      className={styles.toleranceRange} />
                    <span className={styles.toleranceValue}>
                      {display}
                    </span>
                  </div>
                ))}
                <div className={styles.thresholdGrid}>
                  {[
                    { label: "Seuil max", val: `€${Math.round(maxBound).toLocaleString("fr-FR")}`, tone: "red" },
                    { label: "Seuil min", val: `€${Math.round(minBound).toLocaleString("fr-FR")}`, tone: "success" },
                  ].map(d => (
                    <div key={d.label} className={cx(styles.thresholdCard, d.tone === "red" ? styles.thresholdRed : styles.thresholdSuccess)}>
                      {d.label}: <strong className={cx(styles.thresholdValue, d.tone === "red" ? styles.textRed : styles.textSuccess)}>{d.val}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto note */}
              <div className={styles.noteBox}>
                <div className={styles.noteTitle}>
                  Saisonnalité & prévision automatiques
                </div>
                <div className={styles.noteText}>
                  Le moteur détecte automatiquement la saisonnalité, le rythme de facturation et la fenêtre de prévision. Seules les tolérances restent configurables.
                </div>
              </div>
            </div>
          </div>

          {/* Amounts over time */}
          <div className={styles.card}>
            <SectionTitle icon={<TrendingUp size={13} />}>Montants dans le temps</SectionTitle>
            <ResponsiveContainer width="100%" height={185}>
              <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.ink400, fontFamily: T.mono }} />
                <YAxis tick={{ fontSize: 10, fill: T.ink400 }} tickFormatter={v => `€${v.toLocaleString("fr-FR")}`} />
                <Tooltip
                  formatter={v => [`€${Number(v).toFixed(2)}`, "Montant"]}
                />
                <ReferenceLine y={mu} stroke={T.red} strokeDasharray="5 5" strokeWidth={1.5}
                  label={{ value: "μ", position: "right", fontSize: 10, fill: T.red }} />
                <Line type="monotone" dataKey="amt" stroke={T.info} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Seasonality */}
          <div className={styles.card}>
            <SectionTitle>Analyse de saisonnalité</SectionTitle>
            <div className={styles.seasonTabs}>
              {[["monthly", "Par mois"], ["quarterly", "Par trimestre"]].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSeasonTab(id)}
                  className={cx(styles.seasonTab, seasonTab === id && styles.seasonTabActive)}
                >
                  {label}
                </button>
              ))}
            </div>

            {seasonTab === "monthly" ? (
              <>
                <ResponsiveContainer width="100%" height={165}>
                  <BarChart data={monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.ink400 }} />
                    <YAxis tick={{ fontSize: 10, fill: T.ink400 }} tickFormatter={v => `€${v.toLocaleString("fr-FR")}`} />
                    <Tooltip
                      formatter={v => [`€${Number(v).toFixed(2)}`, "Moyenne"]}
                    />
                    <ReferenceLine y={mu} stroke={T.red} strokeDasharray="5 5" strokeWidth={1.5}
                      label={{ value: "μ", position: "right", fontSize: 10, fill: T.red }} />
                    <Bar dataKey="mu" fill={T.red} fillOpacity={0.65} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className={styles.monthlyGrid}>
                  {monthlyData.map(m => (
                    <div key={m.name} className={styles.monthlyCell}>
                      <div className={styles.monthlyName}>{m.name}</div>
                      <div className={styles.monthlyValue}>
                        €{Math.round(m.mu).toLocaleString("fr-FR")}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <ResponsiveContainer width="100%" height={165}>
                <BarChart data={[0, 3, 6, 9].map((start, i) => ({
                  name: `Q${i + 1}`,
                  mu: Math.round((monthlyData[start].mu + monthlyData[start + 1].mu + monthlyData[start + 2].mu) / 3),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.ink400 }} />
                  <YAxis tick={{ fontSize: 10, fill: T.ink400 }} tickFormatter={v => `€${v.toLocaleString("fr-FR")}`} />
                  <Tooltip
                    formatter={v => [`€${Number(v).toFixed(2)}`, "Moyenne"]}
                  />
                  <Bar dataKey="mu" fill={T.red} fillOpacity={0.65} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Inter-invoice gaps */}
          <div className={styles.card}>
            <SectionTitle icon={<Clock size={13} />}>Écarts entre factures</SectionTitle>
            {/* Rhythm summary */}
            <div className={styles.rhythmSummary}>
              <div>
                <div className={styles.rhythmNumber}>
                  {medianGap}<span className={styles.rhythmUnit}>j</span>
                </div>
                <div className={styles.rhythmLabel}>
                  Écart médian
                </div>
              </div>
              <div className={styles.rhythmDivider} />
              <div>
                <div className={styles.rhythmName}>
                  {detectedRhythm}
                </div>
                <div className={styles.rhythmLabel}>
                  Rythme détecté
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={rhythmData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" vertical={false} />
                <XAxis dataKey="idx" tick={{ fontSize: 9, fill: T.ink400, fontFamily: T.mono }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: T.ink400 }} domain={[0, Math.max(36, Math.ceil(medianGap * 1.25))]} />
                <Tooltip
                  formatter={v => [`${v} jours`, "Écart"]}
                />
                <ReferenceLine y={medianGap} stroke={T.warning} strokeDasharray="4 4" strokeWidth={1.5} />
                <Bar dataKey="gap" fill={T.ink300} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Forecast 12 months */}
          <div className={styles.card}>
            <SectionTitle icon={<CalendarDays size={13} />}>
              Prévision 12 mois · ±{tolerancePct}% · ±{toleranceDays}j
            </SectionTitle>

            <div className={styles.forecastGrid}>
              {Array.from({ length: 12 }, (_, i) => {
                const base = new Date();
                base.setMonth(base.getMonth() + i + 1);
                const expectedDate = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(expectedInvoiceDays[i]).padStart(2, "0")}`;
                // Use the CALENDAR month of this forecast card, not the sequence
                // offset i — otherwise a November card showed April's μ.
                const calMonth = base.getMonth() + 1; // 1..12
                const predicted = monthlyMuMap[String(calMonth)] ?? monthlyMuMap[calMonth] ?? mu;
                const lower = predicted * (1 - tolerancePct / 100);
                const upper = predicted * (1 + tolerancePct / 100);

                return (
                  <div key={i} className={cx(styles.forecastCard, forecastHoverIndex === i && styles.forecastCardHovered)}
                    onMouseEnter={() => setForecastHoverIndex(i)}
                    onMouseLeave={() => setForecastHoverIndex(null)}
                  >
                    {/* Index chip */}
                    <span className={styles.indexChip}>
                      #{i + 1}
                    </span>

                    {/* Date */}
                    <div className={styles.forecastDate}>
                      {expectedDate}
                    </div>

                    {/* Window */}
                    <div className={styles.forecastWindow}>
                      {addDays(expectedDate, -toleranceDays)} → {addDays(expectedDate, toleranceDays)}
                    </div>

                    <div className={styles.forecastDivider} />

                    {/* Predicted amount */}
                    <div className={styles.predictedAmount}>
                      €{Math.round(predicted).toLocaleString("fr-FR")}
                    </div>

                    {/* Range */}
                    <div className={styles.rangeRow}>
                      <span className={styles.rangeLower}>€{Math.round(lower).toLocaleString("fr-FR")}</span>
                      <span className={styles.rangeDash}>–</span>
                      <span className={styles.rangeUpper}>€{Math.round(upper).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

/* ─── SeriesView ─────────────────────────────────────────────────────── */
