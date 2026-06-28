import { COLORS } from "@/constants/colors";
import { TENANT_SECTIONS } from "@/features/dashboard/model/tenantDashboardModel";
import styles from "./TenantDashboardChrome.module.css";

export function ChartSectionDivider({ label, LucideComp }) {
  return (
    <div className={styles.divider}>
      <div className={styles.dividerLineStart} />
      <span className={styles.dividerLabel}>
        {LucideComp && <LucideComp size={12} color={COLORS.grey400} strokeWidth={2} />}
        {label}
      </span>
      <div className={styles.dividerLineEnd} />
    </div>
  );
}

export function TenantSectionNav({ activeSection, setActiveSection }) {
  return (
    <div className={`fade-up ${styles.sectionNav}`}>
      {TENANT_SECTIONS.map((section) => {
        const active = activeSection === section.id;
        return (
          <button
            key={section.id}
            className={`${styles.sectionButton} ${active ? styles.sectionButtonActive : ""}`}
            onClick={() => setActiveSection(section.id)}
          >
            <section.LucideComp size={13} color={active ? "#fff" : COLORS.grey500} strokeWidth={2.2} />
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
