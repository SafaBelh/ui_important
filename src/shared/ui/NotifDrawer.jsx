import { createPortal } from "react-dom";
import { Bell, BellOff, Check, X as LucideX } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { useToast } from "@/contexts/toastContextValue";
import { selectAlertsForTenant } from "@/features/alerts/model/alertSelectors";
import { markAlertRead } from "@/features/alerts/model/alertActions";
import { useSession } from "@/features/auth/model/useSession";
import { useAppSelector } from "@/store/hooks";
import styles from "./NotifDrawer.module.css";

export function NotifDrawer({ open, onClose, onNavigate }) {
  const { tenant } = useSession();
  const toast = useToast();
  const tenantAlerts = useAppSelector((state) => selectAlertsForTenant(state, tenant?.id));
  if (!tenant) return null;
  const alerts = tenantAlerts.slice().sort((a, b) => +new Date(b.timestamp || 0) - +new Date(a.timestamp || 0));
  const unread = alerts.filter(a => !a.read);

  return createPortal(
    <>
      {open && (
        <div
          className={styles.portal}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div
            className={styles.backdrop}
            onClick={onClose}
          />
          <div
            className={`scale-in ${styles.drawer}`}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerMain}>
                <div className={styles.headerIcon}>
                  <Bell size={16} color={COLORS.red} />
                </div>
                <div>
                  <div className={styles.title}>Notifications</div>
                  <div className={styles.subtitle}>{unread.length} non lue{unread.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <div className={styles.headerActions}>
                {unread.length > 0 && (
                  <button
                    className={`btn-ghost ${styles.readAllBtn}`}
                    onClick={() => { unread.forEach(a => markAlertRead(a.id)); toast("Toutes les alertes marquées comme lues", "success"); }}
                  >
                    Tout lire
                  </button>
                )}
                <button className="btn-icon" onClick={onClose}><LucideX size={14} color={COLORS.grey500} /></button>
              </div>
            </div>
            {/* List */}
            <div className={styles.list}>
              {alerts.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>
                    <BellOff size={26} color={COLORS.red} strokeWidth={1.8} />
                  </div>
                  <div className={styles.emptyTitle}>Aucune alerte</div>
                  <div className={styles.emptySubtitle}>Vous êtes à jour !</div>
                </div>
              ) : alerts.map(a => {
                const severityClass = {
                  critical: styles.severityCritical,
                  warning: styles.severityWarning,
                  info: styles.severityInfo,
                }[a.severity] || styles.severityDefault;
                return (
                  <div
                    key={a.id}
                    className={`${styles.alertRow} ${a.read ? styles.read : styles.unread} ${severityClass}`}
                  >
                    <div className={styles.dot} />
                    <div className={styles.itemMain}>
                      <div className={styles.message}>{a.message}</div>
                      {a.timestamp && (
                        <div className={styles.timestamp}>
                          {new Date(a.timestamp).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                    {!a.read && (
                      <button
                        className={`btn-icon ${styles.markBtn}`}
                        onClick={() => markAlertRead(a.id)}
                        title="Marquer comme lu"
                      >
                        <Check size={12} color={COLORS.grey500} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div className={styles.footer}>
              <button
                className={`btn-primary ${styles.viewAllBtn}`}
                onClick={() => { onNavigate("alerts"); onClose(); }}
              >
                Voir toutes les alertes
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
