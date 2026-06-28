import { memo } from "react";
import { formatEuro } from "@/utils/formatters";
import styles from "./CustomTip.module.css";

export const CustomTip = memo(function CustomTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.root}>
      {label && (
        <div className={styles.label}>
          {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className={styles.item} {...{ style: { "--tip-item-color": p.color || "var(--color-grey-700)" } }}>
          {p.name}:{" "}
          <strong>
            {typeof p.value === "number" && p.value > 999
              ? formatEuro(Math.round(p.value))
              : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
});
