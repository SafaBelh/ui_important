import { useState } from "react";
import { Search } from "lucide-react";
import { Icon } from "@/shared/ui/Icon";
import { NotifDrawer } from "@/shared/ui/NotifDrawer";
import { COLORS } from "@/constants/colors";
import { useCmdPalette } from "@/contexts/commandPaletteContextValue";
import { selectUnreadAlertCountForTenant } from "@/features/alerts/model/alertSelectors";
import { useSession } from "@/features/auth/model/useSession";
import { useAppSelector } from "@/store/hooks";
import { ContextSwitcher } from "@/shared/layout/ContextSwitcher";
import styles from "./Topbar.module.css";

export function Topbar({ activePage, onNavigate }) {
  const { user, tenant, partner, isEngineAdmin } = useSession();
  const [notifOpen, setNotifOpen] = useState(false);
  const { openPalette } = useCmdPalette();
  const unread = useAppSelector((state) => selectUnreadAlertCountForTenant(state, tenant?.id));
  const PAGE_TITLES = {
    dashboard: "Vue d'ensemble",
    budget: "Budget & Prévisions",
    pipelines: "Pipelines",
    explorer: "Explorateur",
    anomalies: "Anomalies",
    alerts: "Alertes",
    integrations: "Intégrations",
    tenants: "Tenants",
    settings: "Paramètres",
  };
  if (!user) return null;
  return (
    <>
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>
          {PAGE_TITLES[activePage] || "AnomalyIQ"}
        </h1>
        <p className={styles.subtitle}>
          {isEngineAdmin ? (
            tenant ? (
              <>
                SuperAdmin · Vue locataire <strong className={styles.accent}>{tenant.name}</strong>
              </>
            ) : (
              "SuperAdmin · Vue globale de tous les locataires"
            )
          ) : tenant ? (
            <>
              Espace <strong className={styles.accent}>{tenant.name}</strong>
              {partner && (
                <>
                  {" "}—{" "}
                  <strong className={styles.partnerName}>{partner.name}</strong>
                </>
              )}
            </>
          ) : (
            "Aucun espace actif"
          )}
        </p>
      </div>
      <div className={styles.spacer} />
      {/* Command Palette Trigger */}
      <button
        onClick={openPalette}
        className={styles.searchButton}
      >
        <Search size={13} />
        <span className={styles.searchLabel}>Rechercher…</span>
        <kbd className={styles.shortcut}>⌘K</kbd>
      </button>
      <ContextSwitcher />
      {/* Bell — opens notification drawer */}
      <button
        onClick={() => setNotifOpen(true)}
        className={`btn-icon ${styles.notificationButton}`}
      >
        <Icon name="bell" size={16} color={COLORS.grey600} />
        {unread > 0 && (
          <span className={styles.unreadBadge}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </header>
    <NotifDrawer open={notifOpen} onClose={() => setNotifOpen(false)} onNavigate={onNavigate} />
    </>
  );
}
