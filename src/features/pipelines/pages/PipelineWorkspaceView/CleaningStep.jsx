
import { useEffect, useState } from "react";
import { CheckCircle, Euro, Rows, ShieldCheck, ShieldX, Users } from "lucide-react";
import { Spinner } from "@/shared/ui/Spinner";
import { downloadCSV, wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { formatEuro, formatCompactEuro } from "@/utils/formatters";
import styles from "./CleaningStep.module.css";

export function WSCleaningStep({ onConfirm, onNavigate: _onNavigate, parsedRows, amountCol }) {
  const [stats, setStats] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showRejected, setShowRejected] = useState(false);
  const [showAccepted, setShowAccepted] = useState(false);
  const [rejectedRows, setRejectedRows] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const [sc, dist, allInv] = await Promise.all([
          wsAPI.getSupplierCounts(),
          wsAPI.getDistribution(),
          wsAPI.getAllInvoices(),
        ]);
        const invList = Array.isArray(allInv?.invoices)
          ? allInv.invoices
          : Array.isArray(allInv?.content)
          ? allInv.content
          : Array.isArray(allInv)
          ? allInv
          : Array.isArray(wsStore.invoices)
          ? wsStore.invoices
          : [];
        setInvoices(invList);
        const amounts = Array.isArray(dist?.amounts) && dist.amounts.length
          ? dist.amounts
          : invList.map((r) => Number(r.amount || 0)).filter(Number.isFinite);
        const acceptedCount = invList.length || amounts.length;
        const originalCount = parsedRows?.length || acceptedCount;
        setStats({
          supplierCount: Object.keys(sc?.supplier_counts || {}).length || new Set(invList.map((r) => r.supplier || r.supplier_code).filter(Boolean)).size,
          totalInvoices: acceptedCount,
          totalAmount: amounts.reduce((a, b) => a + b, 0),
          minAmt: amounts.length ? Math.min(...amounts) : 0,
          maxAmt: amounts.length ? Math.max(...amounts) : 0,
          originalCount,
        });
        if (parsedRows?.length) {
          const rejected = parsedRows
            .filter((r) => {
              if (amountCol && amountCol in r) {
                const v = String(r[amountCol] ?? "").trim();
                const n = parseFloat(v);
                return v === "" || isNaN(n) || n <= 0;
              }
              return Object.values(r).some((v) => v === "" || v === null);
            })
            .map((r) => {
              const reasons = [];
              if (amountCol && amountCol in r) {
                const v = String(r[amountCol] ?? "").trim();
                const n = parseFloat(v);
                if (v === "" || isNaN(n)) reasons.push("montant manquant");
                else if (n <= 0) reasons.push("montant ≤ 0");
              } else {
                if (Object.values(r).some((v) => v === "" || v === null))
                  reasons.push("champ vide");
              }
              return { ...r, _reasons: reasons };
            });
          setRejectedRows(rejected.slice(0, 100));
        }
      } catch (e) {
        const invList = Array.isArray(wsStore.invoices) ? wsStore.invoices : [];
        const amounts = invList.map((r) => Number(r.amount || 0)).filter(Number.isFinite);
        const suppliers = new Set(invList.map((r) => r.supplier || r.supplier_code).filter(Boolean));
        setInvoices(invList);
        setStats({
          supplierCount: suppliers.size,
          totalInvoices: invList.length,
          totalAmount: amounts.reduce((a, b) => a + b, 0),
          minAmt: amounts.length ? Math.min(...amounts) : 0,
          maxAmt: amounts.length ? Math.max(...amounts) : 0,
          originalCount: parsedRows?.length || invList.length,
        });
        setErr(e.message);
      }
      setLoading(false);
    })();
  }, [amountCol, parsedRows]);
  const exportRejected = () => {
    if (!rejectedRows.length) return;
    downloadCSV(
      rejectedRows.map((r) => {
        const { _reasons, ...rest } = r;
        return { ...rest, reject_reason: _reasons?.join(", ") || "" };
      }),
      "lignes_rejetees.csv"
    );
  };
  const rules = stats
    ? [
      { rule: "Montant > 0", pass: stats.totalInvoices, tone: "toneSuccess" },
      { rule: "Date valide", pass: stats.totalInvoices, tone: "toneInfo" },
      {
        rule: "Fournisseur renseigné",
        pass: stats.totalInvoices,
        tone: "tonePurple",
      },
      { rule: "Statut valide", pass: stats.totalInvoices, tone: "toneWarning" },
    ]
    : [];
  return (
    <div className={styles.shell}>
      <h2 className={styles.title}>
        Nettoyage des données
      </h2>
      <p className={styles.subtitle}>
        Règles appliquées côté serveur · montant {">"} 0 · date valide ·
        fournisseur non vide
      </p>
      {err && (
        <div className={styles.errorMessage}>
          {err}
        </div>
      )}
      {loading && (
        <div className={styles.loadingState}>
          <Spinner size={36} />
        </div>
      )}
      {stats && (
        <>
          <div className={styles.metricGrid}>
            {[
              {
                lbl: "Lignes avant",
                val: stats.originalCount.toLocaleString(),
                tone: "toneInfo",
                Icon: Rows,
              },
              {
                lbl: "Lignes conservées",
                val: stats.totalInvoices.toLocaleString(),
                tone: "toneSuccess",
                Icon: ShieldCheck,
              },
              {
                lbl: "Lignes rejetées",
                val: (stats.originalCount - stats.totalInvoices).toLocaleString(),
                tone: "toneRed",
                Icon: ShieldX,
              },
              {
                lbl: "Montant conservé",
                val: formatCompactEuro(Math.round(stats.totalAmount)),
                tone: "toneWarning",
                Icon: Euro,
              },
              {
                lbl: "Fournisseurs uniques",
                val: stats.supplierCount,
                tone: "tonePurple",
                Icon: Users,
              },
            ].map((k) => (
              <div
                key={k.lbl}
                className={`glass-card-sm ${styles.metricCard} ${styles[k.tone]}`}
              >
                <div className={styles.metricIcon}>
                  <k.Icon size={14} strokeWidth={2} />
                </div>
                <div className={styles.metricValue}>
                  {k.val}
                </div>
                <div className={styles.metricLabel}>
                  {k.lbl}
                </div>
              </div>
            ))}
          </div>
          {/* Cleaning rule bars */}
          <div className={`glass-card ${styles.card}`}>
            <div className={styles.sectionTitle}>
              Règles de nettoyage
            </div>
            <div className={styles.rulesGrid}>
              {rules.map((r) => (
                <div
                  key={r.rule}
                  className={`${styles.ruleCard} ${styles[r.tone]}`}
                >
                  <div className={styles.ruleValue}>
                    {r.pass}/{stats.originalCount}
                  </div>
                  <div className={styles.ruleLabel}>
                    {r.rule}
                  </div>
                  <progress className={styles.ruleProgress} value={Math.min(100, (r.pass / stats.originalCount) * 100).toFixed(1)} max="100" aria-label={r.rule} />
                </div>
              ))}
            </div>
          </div>
          {/* Rejected rows */}
          {rejectedRows.length > 0 && (
            <div className={styles.sectionBlock}>
              <div className={styles.sectionTitleCompact}>
                Lignes invalidess rejetées ({rejectedRows.length})
              </div>
              {showRejected && (
                <div
                  className={`glass-card ${styles.scrollCard}`}
                >
                  <table
                    className={styles.dataTable}
                  >
                    <thead>
                      <tr className={styles.tableRow}>
                        {rejectedRows.length > 0 &&
                          Object.keys(rejectedRows[0])
                            .filter((k) => k !== "_reasons")
                            .slice(0, 4)
                            .map((h) => (
                              <th
                                key={h}
                                className={styles.tableHead}
                              >
                                {h}
                              </th>
                            ))}
                        <th
                          className={styles.tableHead}
                        >
                          Raison
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedRows.slice(0, 50).map((r, i) => {
                        const fk = Object.keys(r)
                          .filter((k) => k !== "_reasons")
                          .slice(0, 4);
                        return (
                          <tr
                            key={i}
                            className={styles.tableRow}
                          >
                            {fk.map((k) => (
                              <td
                                key={k}
                                className={styles.tableCell}
                              >
                                {String(r[k] ?? "—")}
                              </td>
                            ))}
                            <td
                              className={styles.warningCell}
                            >
                              {r._reasons?.join(", ")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className={styles.buttonRow}>
                <button
                  className={`btn-ghost ${styles.smallButton}`}
                  onClick={() => setShowRejected((v) => !v)}
                >
                  {showRejected ? "▲ Masquer" : "▼ Voir les lignes rejetées"}
                </button>
                <button
                  className={`btn-ghost ${styles.smallButton}`}
                  onClick={exportRejected}
                >
                  ⬇ Exporter (.csv)
                </button>
              </div>
            </div>
          )}
          {/* Accepted rows preview */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionTitleCompact}>
              Aperçu des données conservées ({Math.min(20, invoices.length)}{" "}
              premières lignes)
            </div>
            {showAccepted && (
              <div
                className={`glass-card ${styles.acceptedScrollCard}`}
              >
                <table
                  className={styles.acceptedTable}
                >
                  <thead>
                    <tr className={styles.tableRow}>
                      {[
                        "Fournisseur",
                        "Date",
                        "Montant",
                        "Libellé",
                        "Statut",
                      ].map((h) => (
                        <th
                          key={h}
                          className={styles.acceptedHead}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 20).map((r, i) => (
                      <tr
                        key={i}
                        className={styles.tableRow}
                      >
                        <td
                          className={styles.supplierCell}
                        >
                          {r.supplier || r.supplier_code || "—"}
                        </td>
                        <td className={styles.mutedCell}>
                          {r.date || r.invoice_date || "—"}
                        </td>
                        <td
                          className={styles.amountCell}
                        >
                          {formatEuro(Math.round(r.amount))}
                        </td>
                        <td className={styles.mutedCell}>
                          {r.label || "—"}
                        </td>
                        <td className={styles.mutedCell}>
                          {r.status || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              className={`btn-ghost ${styles.smallButton}`}
              onClick={() => setShowAccepted((v) => !v)}
            >
              {showAccepted
                ? "▲ Masquer"
                : "▼ Voir l'aperçu des données conservées"}
            </button>
          </div>
          <div className={styles.successBanner}>
            <CheckCircle size={13} />
            <span>
              Nettoyage complet — {stats.totalInvoices.toLocaleString()} factures
              prêtes pour l'analyse.
            </span>
          </div>
        </>
      )}
      <button
        onClick={() => onConfirm(stats)}
        className={`btn-primary ${styles.confirmButton}`}
        disabled={loading || !stats}
      >
        Passer à l'EDA →
      </button>
    </div>
  );
}
