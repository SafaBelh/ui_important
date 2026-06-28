import { AlertTriangle, BarChart3, Bot, Brain } from "lucide-react";
import { COLORS } from "@/constants/colors";
import styles from "./DashboardTabs.module.css";

function InsightCard({ insight }) {
  const Icon = insight.icon;

  return (
    <div className={`glass-card-sm ${styles.insightCard} ${styles.insightToneBg} ${styles[insight.tone]}`}>
      <div className={styles.iconSlot}><Icon size={20} color={insight.color} strokeWidth={1.8} /></div>
      <div className={styles.textSlot}>
        <div className={styles.insightTitle}>{insight.title}</div>
        <div className={styles.insightBody}>{insight.body}</div>
        <div className={styles.insightAction}>{insight.action}</div>
      </div>
    </div>
  );
}

export function DashboardInsightsTab({ criticalCount, alertsCount, feedbackCount, series, groupFields }) {
  const stableAutoCandidates = series.filter((item) => item.cv < 0.05 && item.n > 20).length;
  const insights = [
    criticalCount > 0 && {
      icon: AlertTriangle,
      color: COLORS.red,
      tone: "toneRed",
      title: `${criticalCount} anomalies CRITIQUE`,
      body: `Sur ${alertsCount} alertes totales.`,
      action: "Audit manuel immédiat requis.",
    },
    feedbackCount > 0 && {
      icon: Brain,
      color: COLORS.success,
      tone: "toneSuccess",
      title: `${feedbackCount} feedbacks enregistrés`,
      body: "Le système s'adapte à chaque décision.",
      action: "Continuer à valider les alertes.",
    },
    stableAutoCandidates > 0 && {
      icon: Bot,
      color: COLORS.teal,
      tone: "toneTeal",
      title: `${stableAutoCandidates} candidats auto`,
      body: "Séries très stables — auto-approbation possible.",
      action: "Configurer un seuil strict.",
    },
    {
      icon: BarChart3,
      color: COLORS.info,
      tone: "toneInfo",
      title: `${series.length} séries actives`,
      body: `Regroupées par: ${groupFields.join(", ") || "—"}.`,
      action: "Ajustez les tolérances si nécessaire.",
    },
  ].filter(Boolean);

  return (
    <div className={styles.insightsGrid}>
      {insights.map((insight, index) => <InsightCard key={index} insight={insight} />)}
    </div>
  );
}
