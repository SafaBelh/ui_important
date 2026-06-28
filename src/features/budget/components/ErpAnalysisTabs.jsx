import { memo, useEffect, useState } from "react";
import { getBudgetAnalysis } from "@/features/budget/api/BudgetApi";
import { AlertTriangle, Calendar, ChevronRight, Database, Layers, RefreshCw, Scale, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./ErpAnalysisTabs.module.css";

/* ─────────────────────────────────────────────────────────────
   Budget intelligence — Engagé / Liquidé / Synthèse / Prévisions
   Backed by GET /budget/analysis (per-pointer engagement and
   liquidation engines + global no-double-count equation).
───────────────────────────────────────────────────────────── */

const BUDGET_COLORS = {
  red: "#D94F3D", success: "#22C55E", warning: "#F59E0B", info: "#3B82F6",
  purple: "#8B5CF6", teal: "#14B8A6",
  grey900: "#18191C", grey700: "#3D4149", grey600: "#525761", grey500: "#6E7480",
  grey400: "#9CA1AB", grey300: "#C5C9D1", grey200: "#E2E4E9", grey100: "#F1F2F5",
  glass: "rgba(255,255,255,.72)", glassBd: "rgba(255,255,255,.85)",
};
const MONO = "inherit";
const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const TARGETS = [
  { id: "TODAY", label: "Aujourd'hui" },
  { id: "END_OF_MONTH", label: "Fin du mois" },
  { id: "END_OF_YEAR", label: "Fin d'exercice" },
  { id: "CUSTOM", label: "Date…" },
];
const RISK_META = {
  ok: { label: "OK", color: "#22C55E" },
  warning: { label: "Attention", color: "#F59E0B" },
  exceeded: { label: "Dépassé", color: "#D94F3D" },
};
// Forecast column uses "Dépassement prévu" rather than "Dépassé" so a pointer
// whose current remaining is still positive isn't mislabelled as over budget.
const FORECAST_META = {
  ok: { label: "OK", color: "#22C55E" },
  warning: { label: "À surveiller", color: "#F59E0B" },
  exceeded: { label: "Dépassement prévu", color: "#D94F3D" },
};
const PACE_META = {
  normal: { label: "Conforme", color: "#22C55E" },
  anormal: { label: "Rythme anormal", color: "#D94F3D" },
  insuffisant: { label: "Hist. insuffisant", color: "#9CA1AB" },
};
const KIND_META = {
  engage: { title: "Engagé", color: "#3B82F6", Icon: Layers, docTitle: "Dernières commandes" },
  liquide: { title: "Liquidé", color: "#D94F3D", Icon: Database, docTitle: "Dernières factures" },
};

const fmt = v => (v == null || Number.isNaN(Number(v))) ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const formatEuroAmount = v => v == null ? "—" : `${fmt(v)} €`;
const fmtFrDate = s => (s && s.length >= 10) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthLabel = m => `${MONTHS_FR[(m.month || 1) - 1]} ${String(m.year || "").slice(2)}`;
const toneClass = color => {
  if (color === BUDGET_COLORS.red || color === "#D94F3D") return styles.toneRed;
  if (color === BUDGET_COLORS.success || color === "#22C55E") return styles.toneSuccess;
  if (color === BUDGET_COLORS.warning || color === "#F59E0B" || color === "#b45309") return styles.toneWarning;
  if (color === BUDGET_COLORS.info || color === "#3B82F6") return styles.toneInfo;
  if (color === BUDGET_COLORS.purple || color === "#8B5CF6") return styles.tonePurple;
  if (color === BUDGET_COLORS.teal || color === "#14B8A6") return styles.toneTeal;
  if (color === BUDGET_COLORS.grey400 || color === "#9CA1AB") return styles.toneGrey400;
  if (color === BUDGET_COLORS.grey600 || color === "#525761") return styles.toneGrey600;
  return styles.toneGrey;
};
const barWidthClass = pct => styles[`bar${Math.max(0, Math.min(100, Math.round((Number(pct) || 0) / 5) * 5))}`] || styles.bar0;

/* ── Data hook: one cached fetch per (tenant, connector, targetDate, mode) ── */
const _analysisCache = new Map();
function useBudgetAnalysis(tenantId, isEngineAdmin, targetDate, connectorId, mode, refresh) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!tenantId) { setState(null); return undefined; }
    const key = `${tenantId}|${connectorId || ""}|${mode || ""}|${targetDate}`;
    if (_analysisCache.has(key)) { setState({ result: _analysisCache.get(key) }); return undefined; }
    let live = true;
    setState({ loading: true });
    const params = isEngineAdmin ? { adminTenantId: tenantId } : {};
    if (targetDate) params.targetDate = targetDate;
    if (connectorId) params.connectorId = connectorId;
    if (mode) params.mode = mode;
    getBudgetAnalysis(params)
      .then(res => { if (!live) return; _analysisCache.set(key, res); setState({ result: res }); })
      .catch(err => { if (live) setState({ error: err.message || "Erreur analyse budget" }); });
    return () => { live = false; };
  }, [tenantId, targetDate, isEngineAdmin, connectorId, mode, refresh]);
  return state;
}

/* ── Primitives ── */
const Kpi = memo(function Kpi({ label, value, sub, accent }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <div className={`${styles.kpiValue} ${toneClass(accent)}`}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
});

const Panel = memo(function Panel({ children, className = "" }) {
  return <div className={`${styles.panel} ${className}`}>{children}</div>;
});

const Pill = memo(function Pill({ meta }) {
  const tone = toneClass(meta.color);
  return (
    <span className={`${styles.pill} ${tone}`}>
      <span className={styles.pillDot} />
      {meta.label}
    </span>
  );
});

const MiniBar = memo(function MiniBar({ pct, exceeded }) {
  const color = exceeded ? BUDGET_COLORS.red : pct > 95 ? BUDGET_COLORS.warning : BUDGET_COLORS.success;
  return (
    <div className={styles.miniBar}>
      <div className={`${styles.miniBarFill} ${barWidthClass(pct)} ${color === BUDGET_COLORS.red ? styles.barRed : color === BUDGET_COLORS.warning ? styles.barWarning : styles.barSuccess}`} />
    </div>
  );
});

function SectionTitle({ children }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

const TH = { textAlign: "right", padding: "8px 10px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", color: BUDGET_COLORS.grey500, whiteSpace: "nowrap" };
const TD = { padding: "8px 10px", textAlign: "right", fontFamily: MONO, fontSize: 11, color: BUDGET_COLORS.grey700, whiteSpace: "nowrap" };

/* ── Charts ── */
const ActualVsExpectedChart = memo(function ActualVsExpectedChart({ monthly, color }) {
  const data = (monthly || []).map(m => ({
    name: monthLabel(m), actual: m.actual ?? 0, expected: m.expected, status: m.status,
  }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.07)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} />
        <YAxis tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} tickFormatter={fmt} />
        <Tooltip contentClassName={styles.chartTooltip}
          formatter={(v, n) => [formatEuroAmount(v), n === "actual" ? "Réel" : "Attendu"]} />
        <Bar dataKey="actual" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i}
              fill={d.status === "CRITICAL" ? BUDGET_COLORS.red : d.status === "IN_PROGRESS" ? BUDGET_COLORS.warning : color}
              fillOpacity={d.status === "UPCOMING" ? 0.22 : 0.8} />
          ))}
        </Bar>
        <Line dataKey="expected" stroke={BUDGET_COLORS.grey600} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const HISTORY_PALETTE = ["#9CA1AB", "#8B5CF6", "#14B8A6", "#3B82F6"];
const SeasonalityHistoryChart = memo(function SeasonalityHistoryChart({ history, monthly }) {
  const labels = (monthly || []).map(m => MONTHS_FR[(m.month || 1) - 1]);
  if (!history || history.length === 0) {
    return <div className={styles.emptyChart}>Aucun historique disponible pour ce pointeur.</div>;
  }
  const data = labels.map((name, i) => {
    const row = { name };
    history.forEach(h => { row[h.label] = (h.values || [])[i] ?? 0; });
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.07)" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} />
        <YAxis tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} tickFormatter={fmt} />
        <Tooltip contentClassName={styles.chartTooltip} formatter={v => formatEuroAmount(v)} />
        <Legend className={styles.legend} />
        {history.map((h, idx) => (
          <Bar key={h.label} dataKey={h.label} radius={[3, 3, 0, 0]}
            fill={h.ignored ? BUDGET_COLORS.grey300 : HISTORY_PALETTE[idx % HISTORY_PALETTE.length]}
            fillOpacity={h.ignored ? 0.4 : 0.75} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

/* ── Drill-down drawer for one pointer × one kind ── */
function PointerDrawer({ pointer, kindKey }) {
  const k = pointer[kindKey] || {};
  const meta = KIND_META[kindKey];
  return (
    <div className={styles.drawer}>
      <div className={styles.metricGrid}>
        {[
          ["Réel à date", formatEuroAmount(k.totalInPeriod)],
          ["Attendu à date", formatEuroAmount(k.expectedToDate)],
          ["Projection cible", formatEuroAmount(k.projectedAtTarget)],
          ["Projection fin d'exercice", formatEuroAmount(k.projectedAtFiscalEnd)],
          ["Saisonnalité", k.seasonalitySource === "series" ? "Séries pipeline" : k.seasonalitySource === "history" ? "Historique" : "—"],
        ].map(([l, v]) => (
          <div key={l} className={styles.metricCard}>
            <div className={styles.metricLabel}>{l}</div>
            <div className={styles.metricValue}>{v}</div>
          </div>
        ))}
      </div>
      <div className={`${styles.paceMessage} ${k.paceStatus === "anormal" ? styles.paceMessageDanger : ""}`}>{k.paceMessage}</div>

      <SectionTitle>Rythme mensuel — réel vs attendu</SectionTitle>
      <ActualVsExpectedChart monthly={k.monthly} color={meta.color} />

      <SectionTitle>Saisonnalité historique (4 ans){(k.historicalYearsUsed || []).length > 0 ? ` · années utilisées : ${k.historicalYearsUsed.join(", ")}` : ""}</SectionTitle>
      <SeasonalityHistoryChart history={k.history} monthly={k.monthly} />

      {(pointer.topSuppliers || []).length > 0 && (
        <>
          <SectionTitle>Fournisseurs responsables</SectionTitle>
          <div className={styles.chipRow}>
            {pointer.topSuppliers.map((s, i) => (
              <span key={i} className={`${styles.dataChip} ${styles.supplierChip}`}>
                {s.supplier} · {Math.round(s.sharePct || 0)}% · E {fmt(s.engage)} · L {fmt(s.liquide)}
              </span>
            ))}
          </div>
        </>
      )}

      {(k.details || []).length > 0 && (
        <>
          <SectionTitle>{meta.docTitle}</SectionTitle>
          <div className={styles.chipRow}>
            {k.details.map((d, i) => (
              <span key={i} className={styles.dataChip}>
                {fmtFrDate(String(d.date))} · {formatEuroAmount(d.amount)}{d.supplier ? ` · ${d.supplier}` : ""}{d.id ? ` · ${d.id}` : ""}{d.status ? ` · ${d.status}` : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Engagé / Liquidé tab (same engine, different kind) ── */
function KindTab({ result, kindKey }) {
  const [expanded, setExpanded] = useState(null);
  const meta = KIND_META[kindKey];
  const pointers = result.pointers || [];
  const totals = result.totals || {};
  const total = kindKey === "engage" ? totals.openEngage : totals.liquide;
  const projected = kindKey === "engage" ? totals.projectedEngage : totals.projectedLiquide;
  const expectedToDate = pointers.reduce((s, p) => s + (Number(p[kindKey]?.expectedToDate) || 0), 0);
  const abnormal = pointers.filter(p => p[kindKey]?.paceStatus === "anormal");

  return (
    <>
      <div className={styles.kpiRow}>
        <Kpi label={`${meta.title} sur l'exercice`} value={formatEuroAmount(total)} sub={`Période ${fmtFrDate(result.periodStart)} → ${fmtFrDate(result.consumedUntil)}`} accent={meta.color} />
        <Kpi label="Attendu à date" value={formatEuroAmount(expectedToDate)} sub="Selon le rythme historique / saisonnalité" />
        <Kpi label="Projeté à la cible" value={formatEuroAmount(projected)} sub={`Cible : ${fmtFrDate(result.targetDate)}`} />
        <Kpi label="Rythme anormal" value={String(abnormal.length)} sub={abnormal.length > 0 ? "pointeur(s) au-dessus du rythme attendu" : "Aucun pointeur au-dessus du rythme"} accent={abnormal.length > 0 ? BUDGET_COLORS.red : BUDGET_COLORS.success} />
      </div>

      {abnormal.length > 0 && (
        <Panel className={styles.panelDanger}>
          <div className={styles.alertHeader}>
            <AlertTriangle size={14} color={BUDGET_COLORS.red} />
            <span className={styles.alertTitle}>Pointeurs en rythme anormal</span>
          </div>
          {abnormal.map((p, i) => (
            <div key={i} className={styles.alertRow}>
              <span className={styles.strongText}>{p.axisKey}</span>
              <span className={styles.mutedText}> — {p[kindKey]?.paceMessage}</span>
            </div>
          ))}
        </Panel>
      )}

      <Panel>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={`${styles.th} ${styles.left}`}>Pointeur</th>
                <th className={styles.th}>{meta.title} réel</th>
                <th className={styles.th}>Attendu à date</th>
                <th className={styles.th}>Écart</th>
                <th className={styles.th}>Rythme</th>
                <th className={styles.th}>Projection cible</th>
                <th className={styles.th}>Projection fin d'exercice</th>
              </tr>
            </thead>
            <tbody>
              {pointers.length === 0 && (
                <tr><td colSpan={7} className={`${styles.td} ${styles.center} ${styles.emptyCell}`}>Aucun pointeur budgétaire trouvé.</td></tr>
              )}
              {pointers.map((p, i) => {
                const k = p[kindKey] || {};
                const exp = Number(k.expectedToDate) || 0;
                const dev = exp > 0 ? ((Number(k.totalInPeriod) || 0) - exp) / exp * 100 : null;
                const isOpen = expanded === i;
                return (
                  <FragmentRow key={i}>
                    <tr onClick={() => setExpanded(isOpen ? null : i)}
                      className={`${styles.bodyRow} ${styles.clickableRow} ${isOpen ? styles.bodyRowOpen : ""}`}>
                      <td className={`${styles.td} ${styles.left}`}>
                        <div className={styles.pointerCell}>
                          <ChevronRight size={11} color={BUDGET_COLORS.grey400} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} />
                          <div>
                            <div className={styles.axisKey}>{p.axisKey}</div>
                            {p.label && <div className={styles.axisLabel}>{p.label}</div>}
                          </div>
                        </div>
                      </td>
                      <td className={`${styles.td} ${styles.tdStrong} ${toneClass(meta.color)}`}>{formatEuroAmount(k.totalInPeriod)}</td>
                      <td className={styles.td}>{formatEuroAmount(k.expectedToDate)}</td>
                      <td className={`${styles.td} ${dev != null && dev > 0 ? styles.toneRed : styles.toneGrey600}`}>{dev == null ? "—" : `${dev > 0 ? "+" : ""}${Math.round(dev)} %`}</td>
                      <td className={styles.td}><Pill meta={PACE_META[k.paceStatus] || PACE_META.insuffisant} /></td>
                      <td className={styles.td}>{formatEuroAmount(k.projectedAtTarget)}</td>
                      <td className={styles.td}>{formatEuroAmount(k.projectedAtFiscalEnd)}</td>
                    </tr>
                    {isOpen && (
                      <tr className={styles.detailRow}>
                        <td colSpan={7} className={styles.detailCell}><PointerDrawer pointer={p} kindKey={kindKey} /></td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.tableNote}>
          {kindKey === "engage"
            ? "Engagement ouvert : toutes les commandes (EN_COURS + LIVRE) comptent comme engagement, hors commandes liquidées par une facture comptabilisée (anti double comptage)."
            : "Liquidé : factures payées/comptabilisées (statuts COMPTABILISE et COMPTABILISE_CMD)."}
        </div>
      </Panel>
    </>
  );
}

/* ── Synthèse globale ── */
function SyntheseTab({ result }) {
  const eq = result.equation || {};
  const totals = result.totals || {};
  const pointers = result.pointers || [];
  return (
    <>
      <Panel className={styles.panelBordered}>
        <div className={styles.equationHeader}>
          <Scale size={15} color={BUDGET_COLORS.grey600} />
          <span className={styles.panelTitle}>Équation budgétaire — sans double comptage</span>
        </div>
        <div className={styles.equationRow}>
          {[
            { l: "Restant", v: eq.remaining, c: (eq.remaining ?? 0) < 0 ? BUDGET_COLORS.red : BUDGET_COLORS.success },
            { op: "=" },
            { l: "Alloué", v: eq.allocated, c: BUDGET_COLORS.grey900 },
            { op: "−" },
            { l: "Engagé ouvert", v: eq.openEngage, c: KIND_META.engage.color },
            { op: "−" },
            { l: "Liquidé", v: eq.liquide, c: KIND_META.liquide.color },
          ].map((t, i) => t.op ? (
            <span key={i} className={styles.equationOp}>{t.op}</span>
          ) : (
            <div key={i} className={`${styles.equationCard} ${toneClass(t.c)}`}>
              <div className={styles.equationLabel}>{t.l}</div>
              <div className={`${styles.equationValue} ${toneClass(t.c)}`}>{formatEuroAmount(t.v)}</div>
            </div>
          ))}
          <div className={styles.statusPills}>
            <Pill meta={RISK_META[totals.currentStatus || totals.status] || RISK_META.ok} />
            <Pill meta={FORECAST_META[totals.forecastStatus] || FORECAST_META.ok} />
          </div>
        </div>
        <div className={styles.tableNote}>
          Engagement ouvert = commandes non encore couvertes par une facture comptabilisée · Liquidé = factures payées/comptabilisées.
          Une commande liquidée par sa facture liée n'est comptée qu'une fois, côté liquidé.
        </div>
      </Panel>

      <Panel>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={`${styles.th} ${styles.left}`}>Pointeur</th>
                <th className={styles.th}>Alloué</th>
                <th className={styles.th}>Engagé ouvert</th>
                <th className={styles.th}>Liquidé</th>
                <th className={styles.th}>Restant</th>
                <th className={styles.th}>Taux</th>
                <th className={styles.th}>Statut actuel</th>
                <th className={styles.th}>Statut prévisionnel</th>
              </tr>
            </thead>
            <tbody>
              {pointers.length === 0 && (
                <tr><td colSpan={8} className={`${styles.td} ${styles.center} ${styles.emptyCell}`}>Aucun pointeur budgétaire trouvé.</td></tr>
              )}
              {pointers.map((p, i) => {
                const s = p.synthese || {};
                return (
                  <tr key={i} className={styles.bodyRow}>
                    <td className={`${styles.td} ${styles.left}`}>
                      <div className={styles.axisKey}>{p.axisKey}</div>
                      {p.label && <div className={styles.axisLabel}>{p.label}</div>}
                    </td>
                    <td className={`${styles.td} ${styles.tdStrong} ${styles.toneGrey}`}>{formatEuroAmount(p.allocated)}</td>
                    <td className={`${styles.td} ${styles.toneInfo}`}>{formatEuroAmount(s.openEngage)}</td>
                    <td className={`${styles.td} ${styles.toneRed}`}>{formatEuroAmount(s.liquide)}</td>
                    <td className={`${styles.td} ${styles.tdStrong} ${(s.remaining ?? 0) < 0 ? styles.toneRed : styles.toneSuccess}`}>{formatEuroAmount(s.remaining)}</td>
                    <td className={styles.td}>
                      <div className={styles.inlineRate}>
                        <MiniBar pct={s.consumptionRate || 0} exceeded={(s.currentStatus || s.status) === "exceeded"} />
                        <span className={styles.rateLabel}>{Math.round(s.consumptionRate || 0)}%</span>
                      </div>
                    </td>
                    <td className={styles.td}><Pill meta={RISK_META[s.currentStatus || s.status] || RISK_META.ok} /></td>
                    <td className={styles.td}><Pill meta={FORECAST_META[s.forecastStatus] || FORECAST_META.ok} /></td>
                  </tr>
                );
              })}
              {pointers.length > 0 && (
                <tr className={styles.totalRow}>
                  <td className={`${styles.td} ${styles.left} ${styles.tdTotal} ${styles.toneGrey}`}>Total</td>
                  <td className={`${styles.td} ${styles.tdTotal} ${styles.toneGrey}`}>{formatEuroAmount(totals.allocated)}</td>
                  <td className={`${styles.td} ${styles.tdTotal} ${styles.toneInfo}`}>{formatEuroAmount(totals.openEngage)}</td>
                  <td className={`${styles.td} ${styles.tdTotal} ${styles.toneRed}`}>{formatEuroAmount(totals.liquide)}</td>
                  <td className={`${styles.td} ${styles.tdTotal} ${(totals.remaining ?? 0) < 0 ? styles.toneRed : styles.toneSuccess}`}>{formatEuroAmount(totals.remaining)}</td>
                  <td className={styles.td}>
                    <div className={styles.inlineRate}>
                      <MiniBar pct={totals.consumptionRate || 0} exceeded={(totals.currentStatus || totals.status) === "exceeded"} />
                      <span className={styles.rateLabel}>{Math.round(totals.consumptionRate || 0)}%</span>
                    </div>
                  </td>
                  <td className={styles.td}><Pill meta={RISK_META[totals.currentStatus || totals.status] || RISK_META.ok} /></td>
                  <td className={styles.td}><Pill meta={FORECAST_META[totals.forecastStatus] || FORECAST_META.ok} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ── Prévisions ── */
function PrevisionsTab({ result }) {
  const totals = result.totals || {};
  const pointers = result.pointers || [];
  const forecast = result.monthlyForecast || [];
  const risky = pointers.filter(p => p.forecast?.riskStatus !== "ok");
  const data = forecast.map(m => ({
    name: monthLabel(m),
    actualEngage: m.actualEngage ?? 0,
    actualLiquide: m.actualLiquide ?? 0,
    forecastEngage: m.forecastEngage,
    forecastLiquide: m.forecastLiquide,
    cumulativeRemaining: m.cumulativeRemaining,
  }));
  const sortedRisk = [...pointers].sort((a, b) => {
    const ra = a.forecast?.estimatedThresholdReachDate || "9999";
    const rb = b.forecast?.estimatedThresholdReachDate || "9999";
    if (ra !== rb) return ra.localeCompare(rb);
    return (a.forecast?.projectedRemainingAtFiscalEnd ?? 0) - (b.forecast?.projectedRemainingAtFiscalEnd ?? 0);
  });

  return (
    <>
      <div className={styles.kpiRow}>
        <Kpi label="Restant projeté à la cible" value={formatEuroAmount(totals.projectedRemaining)} sub={`Cible : ${fmtFrDate(result.targetDate)}`}
          accent={(totals.projectedRemaining ?? 0) < 0 ? BUDGET_COLORS.red : BUDGET_COLORS.success} />
        <Kpi label="Engagé projeté" value={formatEuroAmount(totals.projectedEngage)} sub="Prévision propre aux commandes" accent={KIND_META.engage.color} />
        <Kpi label="Liquidé projeté" value={formatEuroAmount(totals.projectedLiquide)} sub="Prévision propre aux factures" accent={KIND_META.liquide.color} />
        <Kpi label="Date d'épuisement estimée" value={result.estimatedGlobalThresholdReachDate ? fmtFrDate(result.estimatedGlobalThresholdReachDate) : "—"}
          sub={result.estimatedGlobalThresholdReachDate ? "Premier pointeur atteignant son enveloppe" : "Aucun dépassement prévu sur l'exercice"}
          accent={result.estimatedGlobalThresholdReachDate ? BUDGET_COLORS.warning : BUDGET_COLORS.success} />
      </div>

      <Panel>
        <div className={styles.chartTitle}>
          Prévision engagé + liquidé — réel, projeté, restant cumulé
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.07)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} />
            <YAxis yAxisId="amount" tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} tickFormatter={fmt} />
            <YAxis yAxisId="remaining" orientation="right" tick={{ fontSize: 10, fill: BUDGET_COLORS.grey400 }} tickFormatter={fmt} />
            <Tooltip contentClassName={styles.chartTooltip} formatter={(v, n) => [formatEuroAmount(v), ({
              actualEngage: "Engagé réel", actualLiquide: "Liquidé réel",
              forecastEngage: "Engagé prévu", forecastLiquide: "Liquidé prévu",
              cumulativeRemaining: "Restant cumulé",
            })[n] || n]} />
            <Legend className={styles.legend} formatter={n => ({
              actualEngage: "Engagé réel", actualLiquide: "Liquidé réel",
              forecastEngage: "Engagé prévu", forecastLiquide: "Liquidé prévu",
              cumulativeRemaining: "Restant cumulé",
            })[n] || n} />
            <Bar yAxisId="amount" dataKey="actualEngage" stackId="a" fill={KIND_META.engage.color} fillOpacity={0.75} radius={[0, 0, 0, 0]} />
            <Bar yAxisId="amount" dataKey="actualLiquide" stackId="a" fill={KIND_META.liquide.color} fillOpacity={0.75} radius={[4, 4, 0, 0]} />
            <Line yAxisId="amount" dataKey="forecastEngage" stroke={KIND_META.engage.color} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="amount" dataKey="forecastLiquide" stroke={KIND_META.liquide.color} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="remaining" dataKey="cumulativeRemaining" stroke={BUDGET_COLORS.grey600} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={styles.chartNote}>
          Les prévisions engagé et liquidé sont calculées séparément, chacune sur son propre historique mensuel et sa saisonnalité.
        </div>
      </Panel>

      <Panel>
        <div className={styles.riskHeader}>
          <Calendar size={14} color={BUDGET_COLORS.grey600} />
          <span className={styles.panelTitle}>Risque par pointeur</span>
          <span className={styles.riskCount}>{risky.length} pointeur(s) à surveiller</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={`${styles.th} ${styles.left}`}>Pointeur</th>
                <th className={styles.th}>Engagé projeté (fin)</th>
                <th className={styles.th}>Liquidé projeté (fin)</th>
                <th className={styles.th}>Restant projeté (fin)</th>
                <th className={styles.th}>Seuil atteint le</th>
                <th className={styles.th}>Risque</th>
              </tr>
            </thead>
            <tbody>
              {sortedRisk.length === 0 && (
                <tr><td colSpan={6} className={`${styles.td} ${styles.center} ${styles.emptyCell}`}>Aucun pointeur budgétaire trouvé.</td></tr>
              )}
              {sortedRisk.map((p, i) => {
                const f = p.forecast || {};
                return (
                  <tr key={i} className={styles.bodyRow}>
                    <td className={`${styles.td} ${styles.left}`}>
                      <div className={styles.axisKey}>{p.axisKey}</div>
                      <div className={`${styles.riskMessage} ${f.riskStatus === "ok" ? styles.riskMessageOk : ""}`}>{f.riskMessage}</div>
                    </td>
                    <td className={`${styles.td} ${styles.toneInfo}`}>{formatEuroAmount(f.projectedEngageAtFiscalEnd)}</td>
                    <td className={`${styles.td} ${styles.toneRed}`}>{formatEuroAmount(f.projectedLiquideAtFiscalEnd)}</td>
                    <td className={`${styles.td} ${styles.tdStrong} ${(f.projectedRemainingAtFiscalEnd ?? 0) < 0 ? styles.toneRed : styles.toneSuccess}`}>{formatEuroAmount(f.projectedRemainingAtFiscalEnd)}</td>
                    <td className={`${styles.td} ${f.estimatedThresholdReachDate ? styles.toneWarning : styles.toneGrey400}`}>{f.estimatedThresholdReachDate ? fmtFrDate(f.estimatedThresholdReachDate) : "—"}</td>
                    <td className={styles.td}><Pill meta={RISK_META[f.riskStatus] || RISK_META.ok} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function FragmentRow({ children }) { return <>{children}</>; }

/* ── Main: header + target selector + active tab ── */
export default function ErpAnalysisTabs({ tab, tenantId, isEngineAdmin, connectorId, mode }) {
  const [targetMode, setTargetMode] = useState("END_OF_YEAR");
  const [customDate, setCustomDate] = useState("");
  const [refresh, setRefresh] = useState(0);

  // END_OF_YEAR is left empty: the backend resolves it as the end of the
  // FISCAL year configured per connector (e.g. April → March).
  const targetDate = (() => {
    const now = new Date();
    if (targetMode === "TODAY") return iso(now);
    if (targetMode === "END_OF_MONTH") return iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    if (targetMode === "CUSTOM" && customDate) return customDate;
    return "";
  })();

  const state = useBudgetAnalysis(tenantId, isEngineAdmin, targetDate, connectorId, mode, refresh);
  if (!tenantId) return null;

  const result = state?.result;
  // Budget is connector-scoped: when several budget connectors exist and none
  // is chosen, the backend asks the user to pick one (never silently merges).
  const needsSelection = result?.status === "needs_selection";
  const configured = result && result.configured !== false;
  const failedConnectors = (result?.connectors || []).filter(c => c.status !== "ok");
  const allWarnings = [
    ...(result?.warnings || []),
    ...(result?.connectors || []).flatMap(c => (c.warnings || []).map(w => `${c.connectorName} : ${w}`)),
  ];
  const TabIcon = tab === "synthese" ? Scale : tab === "previsions" ? TrendingUp : KIND_META[tab]?.Icon || Layers;

  return (
    <div className={styles.root}>
      <Panel>
        <div className={styles.headerRow}>
          <div className={styles.headerIcon}>
            <TabIcon size={15} color={BUDGET_COLORS.info} />
          </div>
          <div className={styles.headerText}>
            <div className={styles.headerTitle}>
              Budget intelligence · {tab === "engage" ? "Engagé (commandes)" : tab === "liquide" ? "Liquidé (factures)" : tab === "synthese" ? "Synthèse globale" : "Prévisions"}
            </div>
            <div className={styles.headerSubtitle}>
              Exercice {result?.connectors?.find(c => c.fiscalYear)?.fiscalYear || ""} · analyse par pointeur budgétaire (axes du connecteur)
            </div>
          </div>
          {TARGETS.map(m => (
            <button key={m.id} type="button" onClick={() => setTargetMode(m.id)}
              className={`${styles.targetButton} ${targetMode === m.id ? styles.targetButtonActive : ""}`}>
              {m.label}
            </button>
          ))}
          {targetMode === "CUSTOM" && (
            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
              className={styles.dateInput} />
          )}
          <button type="button" title="Actualiser" onClick={() => { _analysisCache.clear(); setRefresh(r => r + 1); }}
            className={styles.refreshButton}>
            <RefreshCw size={12} />
          </button>
        </div>

        {state?.loading && <div className={styles.statusMessage}>Chargement de l'analyse budgétaire…</div>}
        {state?.error && <div className={`${styles.statusMessage} ${styles.errorMessage}`}>{state.error}</div>}
        {!state?.loading && !state?.error && result && !configured && !needsSelection && (
          <div className={styles.statusMessage}>
            Aucune configuration budget ERP — configurez le « Détail Budget » du connecteur dans Intégrations pour activer ces analyses.
          </div>
        )}
        {needsSelection && (
          <div className={`${styles.statusMessage} ${styles.warningMessage}`}>
            {result.message || "Plusieurs connecteurs budget — choisissez-en un dans le sélecteur ci-dessus."}
          </div>
        )}
        {failedConnectors.length > 0 && (
          <div className={styles.connectorErrors}>
            {failedConnectors.map((c, i) => <div key={i}>{c.connectorName} : {c.message || "analyse impossible"}</div>)}
          </div>
        )}
        {allWarnings.length > 0 && (
          <div className={styles.warningList}>
            {allWarnings.slice(0, 6).map((w, i) => <div key={i}>⚠ {w}</div>)}
            {allWarnings.length > 6 && <div>… {allWarnings.length - 6} autre(s) avertissement(s)</div>}
          </div>
        )}
      </Panel>

      {configured && !needsSelection && !state?.loading && !state?.error && (
        <>
          {(tab === "engage" || tab === "liquide") && <KindTab result={result} kindKey={tab} />}
          {tab === "synthese" && <SyntheseTab result={result} />}
          {tab === "previsions" && <PrevisionsTab result={result} />}
        </>
      )}
    </div>
  );
}
