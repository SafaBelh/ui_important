import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { CmdPaletteProvider } from "@/contexts/CmdPaletteContext";
import { useAuth } from "@/contexts/authContextValue";
import { useSession } from "@/features/auth/model/useSession";
import {
  loadAlertsForTenant,
  loadPartnersForTenant,
  loadPipelinesForTenant,
  loadTenants,
} from "@/shared/model/dataLoaders";
import { storeLogout } from "@/shared/model/sessionActions";
import { Sidebar, Topbar } from "@/shared/layout";
import { appRoutes } from "@/app/router/routes";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { RouteLoadingFallback } from "@/shared/ui/RouteLoadingFallback";
import { logError } from "@/shared/utils/logError";
import styles from "./AppShell.module.css";

const pages = ["dashboard", "pipelines", "explorer", "anomalies", "alerts", "series", "integrations", "tenants", "settings", "budget"];

export function AppShell() {
  const { user, isEngineAdmin, logout } = useAuth();
  const { tenant } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const pageSegment = location.pathname.split("/")[1] || "dashboard";
  const activePage = pages.includes(pageSegment) ? pageSegment : "dashboard";
  const activeTenantId = tenant?.id || null;

  const navigateToPage = (page) => navigate(`/${page}`);

  const handleLogout = () => {
    logout();
    storeLogout();
    navigate("/login");
  };

  useEffect(() => {
    if (!user) return;

    if (isEngineAdmin) {
      loadTenants().catch((error) => logError("loadTenants", error));
    }

    if (activeTenantId) {
      loadPipelinesForTenant(activeTenantId).catch((error) => logError("loadPipelinesForTenant", error));
      loadAlertsForTenant(activeTenantId).catch((error) => logError("loadAlertsForTenant", error));
      loadPartnersForTenant(activeTenantId).catch((error) => logError("loadPartnersForTenant", error));
    }
  }, [user, isEngineAdmin, activeTenantId]);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  if (!user) return null;

  return (
    <CmdPaletteProvider onNavigate={navigateToPage}>
      <div className={styles.shell}>
        <Sidebar activePage={activePage} onNavigate={navigateToPage} onLogout={handleLogout} />
        <div className={styles.contentColumn}>
          <Topbar activePage={activePage} onNavigate={navigateToPage} />
          <main className={styles.main}>
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  {appRoutes.map(({ path, element }) => (
                    <Route key={path} path={path} element={element} />
                  ))}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </CmdPaletteProvider>
  );
}
