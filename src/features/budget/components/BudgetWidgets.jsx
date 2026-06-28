import { memo } from "react";
import { AlertTriangle, Brain } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { STATUS_META, formatCompactCurrency, formatCurrency } from "@/features/budget/utils/budgetHelpers";
import styles from "./BudgetWidgets.module.css";

const dynamicRules = new Map();

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function dynamicClass(prefix, declarations) {
  const body = Object.entries(declarations)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
  const className = `budgetWidgetDyn_${prefix}_${hashText(body)}`;

  if (!dynamicRules.has(className)) {
    dynamicRules.set(className, body);

    if (typeof document !== "undefined") {
      let element = document.getElementById("budget-widget-dynamic-css");
      if (!element) {
        element = document.createElement("style");
        element.id = "budget-widget-dynamic-css";
        document.head.appendChild(element);
      }
      element.textContent += `.${className}{${body}}`;
    }
  }

  return className;
}

export const Card = memo(function Card({ children, className }) {
  return (
    <div className={cx("card", styles.card, className)}>
      {children}
    </div>
  );
});

export function SectionNum({ n, color }) {
  return (
    <span className={cx(styles.sectionNum, dynamicClass("sectionNum", { background: color || COLORS.red }))}>
      {n}
    </span>
  );
}

export function SectionLabel({ n, children }) {
  return (
    <div className={styles.sectionLabel}>
      {n && <SectionNum n={n} />}
      <h3 className={styles.sectionTitle}>{children}</h3>
    </div>
  );
}

export function StatusPill({ status, children }) {
  const meta = STATUS_META[status] || STATUS_META.normal;
  return (
    <span className={cx(styles.statusPill, dynamicClass("statusPill", { color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }))}>
      {children || meta.label}
    </span>
  );
}

export function KpiTile({ label, value, sub, accent = COLORS.red, delay = 0 }) {
  return (
    <Card className={cx(styles.kpiTile, dynamicClass("kpiDelay", { "animation-delay": `${delay}ms` }))}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={cx(styles.kpiValue, dynamicClass("kpiAccent", { color: accent }))}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </Card>
  );
}

export const MonthlyBarsChart = memo(function MonthlyBarsChart({ data = [], valueKey = "value", color = COLORS.red, height = 150 }) {
  const max = Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1);
  return (
    <div className={cx(styles.monthlyBarsChart, dynamicClass("monthlyHeight", { height: `${height}px` }))}>
      {data.map((d, idx) => {
        const value = Number(d[valueKey] || 0);
        return (
          <div className={styles.monthlyBarItem} key={d.name || d.month || idx} title={`${d.name || d.month || idx}: ${formatCompactCurrency(value)}`}>
            <div className={cx(styles.monthlyBar, dynamicClass("monthlyBar", { height: `${Math.max(3, (value / max) * (height - 35))}px`, background: color }))} />
            <span className={styles.monthLabel}>{d.name || d.month || idx + 1}</span>
          </div>
        );
      })}
    </div>
  );
});

export const TrendAreaChart = memo(function TrendAreaChart({ trendData = [] }) {
  const max = Math.max(...trendData.map((d) => Math.max(Number(d.real || d.value || 0), Number(d.budget || 0))), 1);
  return (
    <div className={styles.trendAreaChart}>
      {trendData.map((d, idx) => {
        const real = Number(d.real || d.value || 0);
        const budget = Number(d.budget || 0);
        return (
          <div className={styles.trendItem} key={d.month || d.name || idx} title={`${d.month || d.name}: ${formatCurrency(real)} / ${formatCurrency(budget)}`}>
            <div className={styles.trendBars}>
              <div className={cx(styles.trendBar, styles.trendBarReal, dynamicClass("trendReal", { height: `${Math.max(3, (real / max) * 170)}px` }))} />
              <div className={cx(styles.trendBar, styles.trendBarBudget, dynamicClass("trendBudget", { height: `${Math.max(3, (budget / max) * 170)}px` }))} />
            </div>
            <span className={styles.monthLabel}>{d.month || d.name || idx + 1}</span>
          </div>
        );
      })}
    </div>
  );
});

export function BudgetAlertsBanner({ risks = [] }) {
  if (!risks.length) return null;
  return (
    <Card className={styles.alertCard}>
      <div className={styles.alertHeader}>
        <AlertTriangle size={16} /> Alertes budgétaires
      </div>
      <div className={styles.alertList}>
        {risks.slice(0, 6).map((risk, idx) => (
          <div className={styles.alertItem} key={risk.id || risk.name || idx}>
            {risk.name || risk.label || risk.pointeur || "Budget"} · {formatCurrency(risk.amount || risk.ecart || risk.overrun || 0)}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SeasonalRiskBanner({ risks = [] }) {
  if (!risks.length) return null;
  return (
    <Card className={styles.seasonalCard}>
      <div className={styles.seasonalHeader}>
        <Brain size={16} /> Risques saisonniers détectés
      </div>
      <div className={styles.seasonalContent}>
        {risks.slice(0, 3).map((risk) => risk.name || risk.label).filter(Boolean).join(" · ")}
      </div>
    </Card>
  );
}
