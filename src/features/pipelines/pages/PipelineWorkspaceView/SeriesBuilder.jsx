
import { useEffect, useState } from "react";
import { BarChart2, Check, CheckCircle2, FileText, LineChart, TriangleAlert, TrendingDown } from "lucide-react";
import { Spinner } from "@/shared/ui/Spinner";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro } from "@/utils/formatters";
import styles from "./SeriesBuilder.module.css";

export function WSSeriesBuilder({
  cols,
  extraCols = [],
  onConfirm,
  onNavigate: _onNavigate,
}) {
  const [selected, setSelected] = useState(
    ["supplier", cols.label ? "label" : null].filter(Boolean)
  );
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState(null);

  const buildLocalSeries = (fields) => {
    const invoices = Array.isArray(wsStore.invoices) ? wsStore.invoices : [];
    const groups = new Map();
    invoices.forEach((inv) => {
      const parts = fields.map((f) => {
        if (f === "supplier") return inv.supplier || inv.supplier_code || "N/A";
        if (f === "label") return inv.label || "";
        return inv[f] || "";
      });
      const key = parts.join("::");
      if (!groups.has(key)) groups.set(key, { parts, values: [] });
      groups.get(key).values.push(Number(inv.amount || 0));
    });
    const series = Array.from(groups.values()).map((g, i) => {
      const values = g.values.filter(Number.isFinite);
      const n = values.length;
      const mu = n ? values.reduce((a, b) => a + b, 0) / n : 0;
      const sigma = n ? Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / n) : 0;
      const cv = mu ? sigma / mu : 0;
      return {
        id: `local-series-${i + 1}`,
        supplier: g.parts[0] || "N/A",
        label: fields.includes("label") ? g.parts[fields.indexOf("label")] : null,
        n,
        mu,
        sigma,
        cv,
        flagged: cv > 0.25 || n < 3,
        high_cv: cv > 0.25,
        low_volume: n < 3,
        tolerance_pct: wsStore.config?.tolerance_pct ?? 10,
        tolerance_days: wsStore.config?.tolerance_days ?? 10,
        active: true,
      };
    }).sort((a, b) => b.n - a.n);
    wsStore.series = series;
    return { series };
  };

  const previewSeries = async (fields) => {
    try {
      return await wsAPI.buildSeries(fields);
    } catch (e) {
      setErr(e.message);
      return buildLocalSeries(fields);
    }
  };

  // Auto-preview on mount so the user sees grouping result immediately
  useEffect(() => {
    if (selected.length === 0) return;
    setLoading(true);
    setErr(null);
    previewSeries(selected)
      .then((r) => {
        setPreview(r);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const standardCandidates = [
    { key: "supplier", label: "Fournisseur" },
    cols.label ? { key: "label", label: "Service / Libellé" } : null,
    cols.tenant ? { key: "tenant", label: "Entité (tenant)" } : null,
  ].filter(Boolean);
  const extraCandidates = [...new Set(extraCols)];
  const scenarioOptions = [
    { label: "Facture standard", fields: ["supplier", cols.label ? "label" : null].filter(Boolean) },
    ...extraCandidates.map((field) => ({ label: `+ ${field}`, fields: ["supplier", cols.label ? "label" : null, field].filter(Boolean) })),
    extraCandidates.length > 1 ? { label: "Extras seuls", fields: extraCandidates } : null,
  ].filter(Boolean);
  const applyScenario = (fields) => {
    setSelected(fields);
    if (fields.length === 0) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setPreview(null);
    previewSeries(fields)
      .then((r) => setPreview(r))
      .finally(() => setLoading(false));
  };
  const toggle = (f) => {
    const next = selected.includes(f)
      ? selected.filter((x) => x !== f)
      : [...selected, f];
    setSelected(next);
    if (next.length === 0) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setPreview(null);
    previewSeries(next)
      .then((r) => setPreview(r))
      .finally(() => setLoading(false));
  };
  const runPreview = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await previewSeries(selected);
      setPreview(r);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };
  const confirm = async () => {
    setConfirming(true);
    setErr(null);
    try {
      let slist;
      try {
        await wsAPI.confirmSeries(selected);
        slist = await wsAPI.listSeries();
      } catch (e) {
        setErr(e.message);
        slist = buildLocalSeries(selected).series;
      }
      onConfirm({ series: slist, groupFields: selected });
    } catch (e) {
      setErr(e.message);
      setConfirming(false);
    }
  };
  return (
    <div className={styles.shell}>
      <h2 className={styles.title}>
        Construction des séries
      </h2>
      <p className={styles.subtitle}>
        Définissez le regroupement puis confirmez pour persister les séries en
        base
      </p>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      <div className={`card-solid ${styles.sectionCard}`}>
        <div className={styles.sectionTitle}>
          Champs de regroupement
        </div>
        <div className={styles.subLabel}>
          Champs standards
        </div>
        {scenarioOptions.length > 1 && (
          <div className={styles.chipRow}>
            {scenarioOptions.map((scenario) => {
              const active = scenario.fields.length === selected.length && scenario.fields.every((f) => selected.includes(f));
              return (
                <button
                  key={scenario.label}
                  type="button"
                  onClick={() => applyScenario(scenario.fields)}
                  className={`btn-toggle${active ? " active" : ""} ${styles.scenarioButton}`}
                >
                  {scenario.label}
                </button>
              );
            })}
          </div>
        )}
        <div className={styles.chipRow}>
          {standardCandidates.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`btn-toggle${selected.includes(key) ? " active" : ""} ${styles.fieldButton}`}
            >
              {selected.includes(key) && (
                <Check size={10} className={styles.checkIcon} />
              )}
              {label}
            </button>
          ))}
        </div>
        {extraCandidates.length > 0 && (
          <>
            <div className={styles.subLabel}>
              Champs supplémentaires (extra_data)
            </div>
            <div className={styles.chipRow}>
              {extraCandidates.map((f) => (
                <button
                  key={f}
                  onClick={() => toggle(f)}
                  className={`btn-toggle${selected.includes(f) ? " active" : ""} ${styles.fieldButton}`}
                >
                  {selected.includes(f) && <Check size={10} />}{" "}
                  {f}
                </button>
              ))}
            </div>
          </>
        )}
        <div className={styles.currentGrouping}>
          Groupement actuel : <strong>{selected.join(" + ") || "—"}</strong>
          {!selected.includes("supplier") && (
            <span className={`${styles.inlineIconText} ${styles.supplierWarning}`}>
              <TriangleAlert size={11} /> Sans fournisseur —
              résultats non conventionnels
            </span>
          )}
        </div>
        <button
          className={`btn-ghost ${styles.previewButton}`}
          onClick={runPreview}
          disabled={loading || !selected.length}
        >
          {loading ? (
            <>
              <Spinner size={14} />
              Calcul…
            </>
          ) : (
            "🔍 Prévisualiser les séries"
          )}
        </button>
      </div>
      {preview && (
        <div className={`card-solid ${styles.sectionCard}`}>
          <div className={styles.previewHeader}>
            <div>
              <div className={styles.previewTitle}>
                {preview.series.length} série
                {preview.series.length > 1 ? "s" : ""} détectée
                {preview.series.length > 1 ? "s" : ""}
              </div>
              <div className={styles.previewSubtitle}>
                Vérifiez la qualité avant de confirmer
              </div>
            </div>
            <div className={styles.statusRow}>
              {(() => {
                const flagged = (preview.series || []).filter(
                  (s) => s.flagged
                ).length;
                const ok = preview.series.length - flagged;
                return (
                  <>
                    <span className={`${styles.statusPill} ${styles.statusOk}`}><Check size={9} strokeWidth={3} />{ok} prête{ok > 1 ? "s" : ""}</span>
                    {flagged > 0 && (
                      <span className={`${styles.statusPill} ${styles.statusWarning}`}><TriangleAlert size={9} strokeWidth={2.5} />{flagged} à surveiller</span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div className={styles.seriesList}>
            {(preview.series || [])
              .sort((a, b) => b.n - a.n)
              .map((s, i) => {
                const cvPct = (s.cv * 100).toFixed(1);
                const isFlagged = s.flagged;
                const issues = [];
                if (s.high_cv)
                  issues.push({
                    Icon: BarChart2,
                    title: "Montants très variables",
                    detail: `CV de ${cvPct}% — les factures varient beaucoup en montant. Il n'y a pas de montant "normal" stable, la détection d'anomalies sera moins précise. Les alertes devront être validées avec plus d'attention.`,
                    tone: "issueWarning",
                  });
                if (s.gap_detected)
                  issues.push({
                    Icon: LineChart,
                    title: "Fréquence irrégulière",
                    detail:
                      'De grands écarts entre certaines factures ont été détectés. Le système aura du mal à prédire la date suivante — les alertes "facture manquante" seront moins fiables.',
                    tone: "issueWarning",
                  });
                if (s.low_volume)
                  issues.push({
                    Icon: TrendingDown,
                    title: "Historique insuffisant",
                    detail: `Seulement ${s.n} facture${
                      s.n > 1 ? "s" : ""
                    } disponible${
                      s.n > 1 ? "s" : ""
                    }. En dessous du seuil recommandé de 10 — résultats à interpréter avec prudence.`,
                    tone: "issueDanger",
                  });
                return (
                  <div key={i} className={`${styles.seriesCard} ${isFlagged ? styles.seriesFlagged : styles.seriesReady} ${styles[`chartColor${i % 9}`]}`}>
                    <div className={`${styles.seriesHeader} ${issues.length ? styles.seriesHeaderWithIssues : ""}`}>
                      <div className={styles.seriesIdentity}>
                        <div className={styles.seriesDot} />
                        <div>
                          <div className={styles.seriesName}>
                            {[s.supplier, s.label].filter(Boolean).join(" · ")}
                          </div>
                          <div className={styles.seriesStats}>
                            <span className={styles.seriesStat}>
                              <FileText size={11} /> {s.n} facture{s.n > 1 ? "s" : ""}
                            </span>
                            <span className={styles.seriesStatPlain}>Moy. {formatEuro(Math.round(s.mu))}</span>
                            <span className={`${styles.seriesStat} ${s.cv > 0.4 ? styles.statWarn : ""}`}>
                              <LineChart size={11} /> Variabilité {cvPct}%
                            </span>
                          </div>
                        </div>
                      </div>
                      {isFlagged ? (
                        <span className={`${styles.seriesStatusPill} ${styles.seriesStatusFlagged}`}><TriangleAlert size={10} strokeWidth={2.5} />À surveiller</span>
                      ) : (
                        <span className={`${styles.seriesStatusPill} ${styles.seriesStatusReady}`}><Check size={10} strokeWidth={3} />Prête</span>
                      )}
                    </div>
                    {issues.length > 0 && (
                      <div className={styles.issuesList}>
                        {issues.map((iss, j) => (
                          <div key={j} className={`${styles.issueCard} ${styles[iss.tone]}`}>
                            <span className={styles.issueIcon}>
                              <iss.Icon size={15} strokeWidth={2} />
                            </span>
                            <div>
                              <div className={styles.issueTitle}>
                                {iss.title}
                              </div>
                              <div className={styles.issueDetail}>
                                {iss.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className={styles.issueNote}>
                          Ces avertissements n'empêchent pas la création —
                          confirmez, mais soyez vigilant lors de la revue des
                          alertes.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
      <button
        onClick={confirm}
        className={`btn-primary ${styles.confirmButton}`}
        disabled={confirming || !selected.length}
      >
        {confirming ? (
          <>
            <Spinner size={16} color="#fff" />
            Confirmation…
          </>
        ) : (
          "Confirmer les séries & configurer →"
        )}
      </button>
    </div>
  );
}
