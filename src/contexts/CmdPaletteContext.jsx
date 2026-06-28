import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectAlertsForTenant } from "@/features/alerts/model/alertSelectors";
import { selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { useAppSelector } from "@/store/hooks";
import { formatEuro } from "@/utils/formatters";
import { CmdPaletteContext } from "@/contexts/commandPaletteContextValue";
import styles from "./CmdPaletteContext.module.css";

export function CmdPaletteProvider({ children, onNavigate }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  return (
    <CmdPaletteContext.Provider value={{ open, openPalette, closePalette, onNavigate }}>
      {children}
      {open && <CommandPaletteModal onClose={closePalette} onNavigate={onNavigate} />}
    </CmdPaletteContext.Provider>
  );
}
export function CommandPaletteModal({ onClose, onNavigate }) {
  const { tenant, isEngineAdmin } = useSession();
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const alerts = useAppSelector((state) => selectAlertsForTenant(state, tenant?.id));
  const pipelines = useAppSelector((state) => selectPipelinesForTenant(state, tenant?.id));
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIdx(0); }, [q]);

  const invoices = [];

  const navItems = [
    { type: "nav", label: "Vue d'ensemble", icon: "dashboard", page: "dashboard" },
    { type: "nav", label: "Pipelines", icon: "pipelines", page: "pipelines" },
    { type: "nav", label: "Explorateur de factures", icon: "explorer", page: "explorer" },
    { type: "nav", label: "Anomalies", icon: "anomalies", page: "anomalies" },
    { type: "nav", label: "Alertes", icon: "bell", page: "alerts" },
    { type: "nav", label: "Intégrations", icon: "plug", page: "integrations" },
    ...(isEngineAdmin ? [{ type: "nav", label: "Tenants", icon: "tenants", page: "tenants" }] : []),
    { type: "nav", label: "Paramètres", icon: "gear", page: "settings" },
  ];

  const ql = q.toLowerCase().trim();
  const results = ql.length === 0 ? navItems.slice(0, 6) : [
    ...navItems.filter(n => n.label.toLowerCase().includes(ql)),
    ...pipelines.filter(p => p.name.toLowerCase().includes(ql) || p.connector.toLowerCase().includes(ql))
      .slice(0, 3).map(p => ({ type: "pipeline", label: p.name, sub: `Pipeline · ${p.connector}`, icon: "pipelines", pipelineId: p.id })),
    ...alerts.filter(a => a.message.toLowerCase().includes(ql))
      .slice(0, 3).map(a => ({ type: "alert", label: a.message, sub: `Alerte · ${a.severity}`, icon: "bell", page: "alerts" })),
    ...invoices.filter(i => i.reference.toLowerCase().includes(ql) || i.supplierName.toLowerCase().includes(ql))
      .slice(0, 4).map(i => ({ type: "invoice", label: i.reference, sub: `${i.supplierName} · ${formatEuro(i.amount)}`, icon: "fileText", page: "explorer", anomaly: i.status === "anomaly" })),
  ];

  const handleSelect = (r) => {
    if (r.page) onNavigate(r.page);
    onClose();
  };
  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[idx]) handleSelect(results[idx]);
    if (e.key === "Escape") onClose();
  };

  const typeColors = { nav: COLORS.info, pipeline: COLORS.purple, alert: COLORS.warning, invoice: COLORS.grey600 };
  const typeLabels = { nav: "Navigation", pipeline: "Pipeline", alert: "Alerte", invoice: "Facture" };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.backdrop} />
      <div className={`scale-in ${styles.modal}`}>
        {/* Input */}
        <div className={styles.inputRow}>
          <Search size={16} color={COLORS.grey400} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Rechercher — factures, pipelines, alertes, pages…"
            className={styles.input}
          />
          <kbd className={styles.escKey}>ESC</kbd>
        </div>
        {/* Results */}
        <div className={styles.results}>
          {results.length === 0 ? (
            <div className={styles.empty}>Aucun résultat pour « {q} »</div>
          ) : (
            <div className={styles.resultList}>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setIdx(i)}
                  className={`${styles.resultButton} ${i === idx ? styles.selected : ""}`}
                >
                  <div className={`${styles.typeIcon} ${styles[r.type]}`}>
                    <Icon name={r.icon} size={14} color={typeColors[r.type]} />
                  </div>
                  <div className={styles.resultText}>
                    <div className={`${styles.resultLabel} ${r.anomaly ? styles.anomaly : ""}`}>{r.label}</div>
                    {r.sub && <div className={styles.resultSub}>{r.sub}</div>}
                  </div>
                  <span className={`${styles.typeBadge} ${styles[r.type]}`}>{typeLabels[r.type]}</span>
                  {i === idx && <CornerDownLeft size={12} color={COLORS.grey400} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className={styles.footer}>
          <span><kbd className={styles.footerKey}>↑↓</kbd> naviguer</span>
          <span><kbd className={styles.footerKey}>↵</kbd> ouvrir</span>
          <span><kbd className={styles.footerKey}>⌘K</kbd> pour rouvrir</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
