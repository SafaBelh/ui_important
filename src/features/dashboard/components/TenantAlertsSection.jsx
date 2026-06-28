import { Bell } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS } from "@/constants/colors";
import { ChartSectionDivider } from "@/features/dashboard/components/TenantDashboardChrome";
import styles from "./TenantAlertsSection.module.css";

export function TenantAlertsSection({ alertsTotal, unreadAlertsCount, criticalAlertsCount, treatedAlertsCount, alertTypeData, sevData, tenantAlerts }) {
  return (
    <div className="fade-in">
      <ChartSectionDivider label="Alertes & notifications" LucideComp={Bell} />

      <div className={styles.kpiGrid}>
        {[
          { label: "Total alertes", val: alertsTotal, toneClass: styles.toneInfo },
          { label: "Non-lues", val: unreadAlertsCount, toneClass: styles.toneWarning },
          { label: "Critiques", val: criticalAlertsCount, toneClass: styles.toneRed },
          { label: "Lues", val: treatedAlertsCount, toneClass: styles.toneSuccess },
        ].map((kpi) => (
          <div key={kpi.label} className={`glass-card-sm ${styles.kpiCard} ${kpi.toneClass}`}>
            <div className={styles.kpiValue}>{kpi.val}</div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.chartGrid}>
        <div className={`glass-card ${styles.panel}`}>
          <div className={styles.panelTitle}>Alertes par type</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={alertTypeData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grey100} vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 11, fill: COLORS.grey700 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: COLORS.grey500 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Alertes" radius={[8, 8, 0, 0]}>
                {alertTypeData.map((item) => <Cell key={item.type} fill={item.color} />)}
                <LabelList dataKey="count" position="top" className={styles.barLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`glass-card ${styles.panel}`}>
          <div className={styles.panelTitle}>Répartition sévérité</div>
          {sevData.length > 0 ? (
            <div className={styles.severityLayout}>
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={sevData} dataKey="c" nameKey="s" cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={4} startAngle={90} endAngle={450}>
                    {sevData.map((item) => <Cell key={item.s} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value + " alertes", name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.severityList}>
                {sevData.map((item) => (
                  <div key={item.s} className={styles.severityItem}>
                    <div className={styles.severityHeader}>
                      <div className={styles.severityNameGroup}>
                        <div className={styles.severityDot} data-severity={item.s} />
                        <span className={styles.severityName}>{item.s}</span>
                      </div>
                      <span className={styles.severityCount} data-severity={item.s}>{item.c}</span>
                    </div>
                    <progress className={styles.severityProgress} data-severity={item.s} value={item.c} max={Math.max(1, alertsTotal)} aria-label={`${item.s}: ${item.c}`} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>Aucune alerte</div>
          )}
        </div>
      </div>

      <div className={`glass-card ${styles.panel}`}>
        <div className={styles.panelTitle}>Fil d'alertes · toutes</div>
        <div className={styles.alertList}>
          {tenantAlerts.map((alert) => (
            <div key={alert.id} className={`${styles.alertItem} ${alert.read ? styles.alertRead : styles.alertUnread} ${styles[`severity${alert.severity[0].toUpperCase()}${alert.severity.slice(1)}`]}`}>
              <div className={styles.alertDot} />
              <div className={styles.alertContent}>
                <div className={styles.alertMessage}>{alert.message}</div>
                <div className={styles.alertTimestamp}>{new Date(alert.timestamp).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div className={styles.badgeGroup}>
                <span className={`badge badge-${alert.severity === "critical" ? "red" : alert.severity === "warning" ? "warn" : "info"} ${styles.alertBadge}`}>{alert.severity}</span>
                <span className={`badge badge-mute ${styles.alertBadge}`}>{alert.type}</span>
                {!alert.read && <span className={`badge badge-purple ${styles.alertBadge}`}>Nouveau</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
