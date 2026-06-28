import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { LoginRoute } from "./LoginRoute";
import { WorkspaceRoute } from "./WorkspaceRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/pipelines/:id/:step" element={<WorkspaceRoute />} />
      <Route path="/pipelines/:id" element={<Navigate to="mapping" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
