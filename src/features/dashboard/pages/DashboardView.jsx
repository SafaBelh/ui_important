import { useSession } from "@/features/auth/model/useSession";
import { AdminDashboardView } from "./AdminDashboardView";
import { TenantDashboardView } from "./TenantDashboardView";
import styles from "./DashboardView.module.css";

export function DashboardView({ onNavigate }) {
  const { tenant, isEngineAdmin } = useSession();
  if (isEngineAdmin && !tenant) return <div className={styles.route}><AdminDashboardView onNavigate={onNavigate} /></div>;
  return <div className={styles.route}><TenantDashboardView onNavigate={onNavigate} /></div>;
}
