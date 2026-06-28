import { memo } from "react";
import styles from "./PageHeader.module.css";

export const PageHeader = memo(function PageHeader({ eyebrow = "Monitoring", title, subtitle, actions = null }) {
  return (
    <div className={styles.root}>
      <div>
        <div className={styles.eyebrowRow}>
          <div className={styles.eyebrowLine} />
          <span className={styles.eyebrow}>{eyebrow}</span>
        </div>
        <h2 className={styles.title}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
});

export default PageHeader;
