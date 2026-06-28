/**
 * Small presentational building blocks for the IntegrationsView connector wizard.
 * Stateless (or trivially stateful) and styled via the wizard's global CSS classes;
 * extracted so the view file holds flow logic, not low-level markup.
 */
import { useState, useEffect } from "react";
import { ChevronDown, CheckCircle2, Database } from "lucide-react";
import { INTEGRATION_JOIN_TYPES, VISUAL_JOIN_PALETTE } from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { suggestJoinOn } from "@/features/integrations/utils/wizardHelpers";
import styles from "./WizardUiPrimitives.module.css";

export function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  );
}

export function InfoBox({ color = INTEGRATION_COLORS.info, children }) {
  const variant = color === INTEGRATION_COLORS.red ? styles.infoBoxError : color === INTEGRATION_COLORS.success ? styles.infoBoxSuccess : styles.infoBoxInfo;
  return (
    <div className={`${styles.infoBox} ${variant}`}>
      <p className={styles.infoBoxText}>{children}</p>
    </div>
  );
}

export function SectionAccordion({ icon, title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-hdr" onClick={() => setOpen(p => !p)}>
        {icon && <div className={styles.sectionIcon}>{icon}</div>}
        <div className={styles.sectionTitleWrap}>
          <div className={styles.sectionTitle}>{title}</div>
          {subtitle && <div className={styles.sectionSubtitle}>{subtitle}</div>}
        </div>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : styles.chevronClosed}`}>
          <ChevronDown size={14} />
        </span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}
export function VisualJoinBuilder({ tables, joins, onChange, rels = [] }) {
  // Auto-fill empty ON conditions from detected foreign keys. This also repairs
  // configs whose join conditions were lost by an earlier serialization bug:
  // re-opening the wizard re-suggests them so the user need not retype.
  useEffect(() => {
    if (!tables || tables.length < 2) return;
    const base = tables[0];
    const existing = joins || [];
    // Wrong arity (added/removed a table) → the array must be rewritten.
    let changed = existing.length !== tables.length - 1;
    const next = tables.slice(1).map((tname, i) => {
      const cur = existing[i] || { type: "INNER", table: tname, on: "" };
      // ALWAYS carry the join's target table positionally so a row can never be
      // persisted with an empty `table` — that made the backend reject the join
      // with "Jointure incomplète". Suggest the ON from detected FKs when present.
      const join = { ...cur, type: cur.type || "INNER", table: cur.table || tname };
      if (join.table !== cur.table) changed = true;
      if ((!join.on || !join.on.trim()) && rels && rels.length) {
        const suggestion = suggestJoinOn(base, tname, rels);
        if (suggestion) { join.on = suggestion; changed = true; }
      }
      return join;
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), rels]);

  if (tables.length < 2) return null;
  const palette = VISUAL_JOIN_PALETTE;

  const getJoin = idx => (joins || [])[idx] || { type: "INNER", table: tables[idx + 1], on: "" };
  const updateJoin = (idx, field, val) => {
    const next = [...(joins || [])];
    // Pad with the positionally-correct target table so a join edited before its
    // row exists never ends up with an empty `table` (backend "Jointure incomplète").
    while (next.length <= idx) next.push({ type: "INNER", table: tables[next.length + 1] || "", on: "" });
    next[idx] = { ...next[idx], table: next[idx].table || tables[idx + 1], [field]: val };
    onChange(next);
  };
  const JOIN_TYPES = INTEGRATION_JOIN_TYPES;

  return (
    <div className={styles.visualJoinBuilder}>
      <div className={styles.joinDiagram}>
        {tables.map((tname, i) => {
          const col = palette[i % palette.length];
          const tableTone = col === palette[0] ? styles.tableTonePrimary : styles.tableToneSecondary;
          return (
            <div key={tname} className={styles.tableNodeWrap}>
              {i > 0 && (
                <div className={styles.joinConnector}>
                  <div className={styles.joinTypeGroup}>
                    {JOIN_TYPES.map(jt => (
                      <button
                        key={jt}
                        onClick={() => updateJoin(i - 1, "type", jt)}
                        className={`${styles.joinTypeButton} ${getJoin(i - 1).type === jt ? styles.joinTypeButtonActive : ""}`}
                      >
                        {jt}
                      </button>
                    ))}
                  </div>
                  <div className={styles.arrowWrap}>
                    <div className={styles.arrowLine} />
                    <div className={styles.arrowHead} />
                  </div>
                </div>
              )}
              <div className={styles.tableNodeColumn}>
                <div className={`${styles.tableNode} ${tableTone}`}>
                  <Database size={11} />
                  {tname}
                  {i === 0 && <span className={styles.baseBadge}>BASE</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ON conditions */}
      <div className={styles.joinConditions}>
        {tables.slice(1).map((tname, i) => {
          const join = getJoin(i);
          const leftCol = palette[0];
          const rightCol = palette[(i + 1) % palette.length];
          const isComplete = join.on && join.on.trim().length > 0;
          const leftTone = leftCol === palette[0] ? styles.tableTonePrimary : styles.tableToneSecondary;
          const rightTone = rightCol === palette[0] ? styles.tableTonePrimary : styles.tableToneSecondary;
          return (
            <div key={tname} className={`${styles.joinConditionRow} ${isComplete ? styles.joinConditionComplete : ""}`}>
              {/* From-table selector enables chained joins (A→B→C): each join can
                  start from the base OR any table joined BEFORE it (earlier tables
                  only, so the chain order stays valid in the generated SQL). */}
              <select value={join.from || tables[0]} onChange={e => updateJoin(i, "from", e.target.value)}
                title="Table de départ de la jointure (chaînage A→B→C)"
                className={`${styles.tablePill} ${styles.tableSelect} ${leftTone}`}>
                {tables.slice(0, i + 1).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className={styles.joinTypePill}>{join.type}</span>
              <span className={`${styles.tablePill} ${rightTone}`}>{tname}</span>
              <span className={styles.onLabel}>ON</span>
              <input
                value={join.on}
                onChange={e => updateJoin(i, "on", e.target.value)}
                placeholder={`${join.from || tables[0]}.id = ${tname}.${(join.from || tables[0]).toLowerCase()}_id`}
                className={`${styles.joinInput} ${isComplete ? styles.joinInputComplete : ""}`}
              />
              {isComplete && <CheckCircle2 size={15} className={styles.completeIcon} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
