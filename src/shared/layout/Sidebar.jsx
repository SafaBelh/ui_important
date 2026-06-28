import { useState } from "react";
import { Icon } from "@/shared/ui/Icon";
import { COLORS } from "@/constants/colors";
import { selectUnreadAlertCountForTenant } from "@/features/alerts/model/alertSelectors";
import { useSession } from "@/features/auth/model/useSession";
import { useAppSelector } from "@/store/hooks";
import styles from "./Sidebar.module.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const colorClasses = {
  [COLORS.red]: styles.colorRed,
  [COLORS.info]: styles.colorBlue,
  [COLORS.success]: styles.colorSuccess,
  [COLORS.warning]: styles.colorAmber,
  [COLORS.purple]: styles.colorViolet,
  [COLORS.teal]: styles.colorTeal,
  [COLORS.orange]: styles.colorOrange,
  [COLORS.pink]: styles.colorRose,
  [COLORS.redMid]: styles.colorRedMid,
  "#10B981": styles.colorGreen,
  "#06B6D4": styles.colorCyan,
  "#84CC16": styles.colorLime,
};

const getColorClass = (color) => colorClasses[color] || styles.colorRed;

export function Sidebar({ activePage, onNavigate, onLogout }) {
  const { user, tenant, isEngineAdmin } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const unread = useAppSelector((state) => selectUnreadAlertCountForTenant(state, tenant?.id));
  if (!user) return null;
  const tenantWithStats = tenant;
  const tenantColorClass = getColorClass(tenantWithStats?.color || COLORS.red);
  const footerAvatarLogo = tenantWithStats?.logo || user.name?.slice(0, 2).toUpperCase() || "?";
  const ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "budget", label: "Budget", icon: "chart" },
    { id: "pipelines", label: "Pipelines", icon: "pipelines" },
    { id: "explorer", label: "Explorer", icon: "explorer" },
    { id: "anomalies", label: "Anomalies", icon: "anomalies" },
    { id: "alerts", label: "Alertes", icon: "alerts" },
    { id: "series", label: "Séries", icon: "fileText" },
    ...(isEngineAdmin ? [{ id: "integrations", label: "Intégrations", icon: "integrations" }] : []),
    ...(isEngineAdmin ? [{ id: "tenants", label: "Tenants", icon: "tenants" }] : []),
    { id: "settings", label: "Paramètres", icon: "settings" },
  ];
  return (
    <aside className={cx(styles.sidebar, collapsed && styles.collapsed)}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <Icon name="bolt" size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div>
            <div className={styles.brandTitle}>
              AnomalyIQ
            </div>
            <div className={styles.brandSubtitle}>
              Invoice Intelligence
            </div>
          </div>
        )}
      </div>
      {/* Tenant chip */}
      {tenantWithStats && !collapsed && (
        <div className={cx(styles.tenantChip, tenantColorClass)}>
          <div className={styles.tenantAvatar}>
            {tenantWithStats.logo
              ? tenantWithStats.logo
              : (tenantWithStats.name?.slice(0, 2).toUpperCase() || "?")}
          </div>
          <div className={styles.truncateWrap}>
            <div className={styles.tenantName}>
              {tenantWithStats.name}
            </div>
            <div className={styles.tenantMeta}>
              {tenantWithStats.plan} · {(tenantWithStats.invoiceCount ?? 0).toLocaleString("fr-FR")} {" "}
              factures
            </div>
          </div>
        </div>
      )}
      {/* Nav */}
      <nav className={styles.nav}>
        {ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => (item.newTab ? window.open(item.newTab, "_blank", "noopener") : onNavigate(item.id))}
            className={cx("nav-item", activePage === item.id && "active", collapsed && styles.navItemCentered)}
            title={collapsed ? item.label : undefined}
          >
            <Icon
              name={item.icon}
              size={17}
              color="currentColor"
            />
            {!collapsed && (
              <span className={styles.navLabel}>
                {item.label}
              </span>
            )}
            {!collapsed && item.id === "alerts" && unread > 0 && (
              <span className={styles.unreadBadge}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>
      {/* Footer */}
      <div className={styles.footer}>
        {!collapsed && (
          <div className={styles.footerUser}>
            <div className={cx(styles.footerAvatar, tenantColorClass)}>
              {footerAvatarLogo}
            </div>
            <div className={styles.truncateWrap}>
              <div className={styles.userName}>
                {user.name}
              </div>
              <div className={styles.userRole}>
                {user.role ? user.role.replace("_", " ") : ""}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            onLogout();
          }}
          className={cx("nav-item", collapsed && styles.navItemCentered)}
          title="Déconnexion"
        >
          <Icon name="logout" size={17} color="currentColor" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={cx("nav-item", styles.collapseButton, collapsed && styles.navItemCentered)}
          title={collapsed ? "Étendre" : "Réduire"}
        >
          <Icon
            name={collapsed ? "expand" : "collapse"}
            size={15}
            color="currentColor"
          />
          {!collapsed && <span>Réduire</span>}
        </button>
      </div>
    </aside>
  );
}
