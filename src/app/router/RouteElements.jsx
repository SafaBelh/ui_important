import { lazy } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/authContextValue";

const DashboardView = lazy(() => import("@/features/dashboard/pages/DashboardView").then((module) => ({ default: module.DashboardView })));
const PipelinesView = lazy(() => import("@/features/pipelines/pages/PipelinesView").then((module) => ({ default: module.PipelinesView })));
const ExplorerView = lazy(() => import("@/features/explorer/pages/ExplorerView").then((module) => ({ default: module.ExplorerView })));
const AnomaliesView = lazy(() => import("@/features/anomalies/pages/AnomaliesView").then((module) => ({ default: module.AnomaliesView })));
const AlertsView = lazy(() => import("@/features/alerts/pages/AlertsView").then((module) => ({ default: module.AlertsView })));
const SeriesView = lazy(() => import("@/features/series/pages/SeriesView").then((module) => ({ default: module.SeriesView })));
const IntegrationsView = lazy(() => import("@/features/integrations/pages/IntegrationsView").then((module) => ({ default: module.IntegrationsView })));
const TenantsView = lazy(() => import("@/features/tenants/pages/TenantsView").then((module) => ({ default: module.TenantsView })));
const BudgetView = lazy(() => import("@/features/budget/pages/BudgetView").then((module) => ({ default: module.BudgetView })));
const SettingsView = lazy(() => import("@/features/settings/pages/SettingsView").then((module) => ({ default: module.SettingsView })));

export function DashboardRoute() {
  const navigate = useNavigate();
  return <DashboardView onNavigate={(page) => navigate(`/${page}`)} />;
}

export function PipelinesRoute() {
  const navigate = useNavigate();
  return (
    <PipelinesView
      onNavigateToPipeline={(id, step = "mapping", options = {}) => navigate(`/pipelines/${id}/${step}${options.mode ? `?mode=${options.mode}` : ""}`)}
      onOpenSeriesConfig={(id) => navigate(`/pipelines/${id}/seriesConfig`)}
    />
  );
}

export function TenantsRoute() {
  const navigate = useNavigate();
  const { isEngineAdmin } = useAuth();

  if (!isEngineAdmin) return <Navigate to="/dashboard" replace />;
  return <TenantsView onNavigateToPipeline={(id) => navigate(`/pipelines/${id}/mapping`)} />;
}

export function ExplorerRoute() {
  return <ExplorerView />;
}

export function AnomaliesRoute() {
  return <AnomaliesView />;
}

export function AlertsRoute() {
  return <AlertsView />;
}

export function SeriesRoute() {
  return <SeriesView />;
}

export function IntegrationsRoute() {
  return <IntegrationsView />;
}

export function BudgetRoute() {
  return <BudgetView />;
}

export function SettingsRoute() {
  return <SettingsView />;
}
