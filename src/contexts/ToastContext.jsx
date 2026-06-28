import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import { ToastCtx } from "@/contexts/toastContextValue";
import styles from "./ToastContext.module.css";

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = (msg, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };
  const colors = {
    success: COLORS.success,
    info: COLORS.info,
    warning: COLORS.warning,
    error: COLORS.red,
  };
  const toneClass = (type) => styles[type] || styles.info;
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={styles.toastStack}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`fade-in ${styles.toast} ${toneClass(t.type)}`}
          >
            <span className={styles.toastIcon}>
              {t.type === "success" ? (
                <Icon name="check" size={15} color={colors.success} />
              ) : t.type === "error" ? (
                <Icon name="x" size={15} color={colors.error} />
              ) : (
                <Icon
                  name="alerts"
                  size={15}
                  color={colors[t.type] || COLORS.info}
                />
              )}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
