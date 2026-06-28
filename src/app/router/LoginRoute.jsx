import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { RouteLoadingFallback } from "@/shared/ui/RouteLoadingFallback";

const LoginScreen = lazy(() => import("@/features/auth/pages/LoginScreen").then((module) => ({ default: module.LoginScreen })));

export function LoginRoute() {
  const navigate = useNavigate();

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <LoginScreen onLogin={() => navigate("/dashboard")} />
    </Suspense>
  );
}
