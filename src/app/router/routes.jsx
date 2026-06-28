import {
  AlertsRoute,
  AnomaliesRoute,
  BudgetRoute,
  DashboardRoute,
  ExplorerRoute,
  IntegrationsRoute,
  PipelinesRoute,
  SeriesRoute,
  SettingsRoute,
  TenantsRoute,
} from "@/app/router/RouteElements";

export const appRoutes = [
  { path: "/dashboard", element: <DashboardRoute /> },
  { path: "/pipelines", element: <PipelinesRoute /> },
  { path: "/explorer", element: <ExplorerRoute /> },
  { path: "/anomalies", element: <AnomaliesRoute /> },
  { path: "/alerts", element: <AlertsRoute /> },
  { path: "/series", element: <SeriesRoute /> },
  { path: "/integrations", element: <IntegrationsRoute /> },
  { path: "/tenants", element: <TenantsRoute /> },
  { path: "/budget", element: <BudgetRoute /> },
  { path: "/settings", element: <SettingsRoute /> },
];
