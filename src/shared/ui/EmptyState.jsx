import { memo } from "react";
import styles from "./EmptyState.module.css";

export const EmptyState = memo(function EmptyState({ icon, title, subtitle, cta, onCta }) {
  return (
    <div className={styles.root}>
      <div className={styles.icon}>
        {icon}
      </div>
      <div>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {cta && onCta && (
        <button className="btn-primary" onClick={onCta}>
          {cta}
        </button>
      )}
    </div>
  );
});
