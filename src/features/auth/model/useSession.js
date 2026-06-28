import { useAppSelector } from "@/store/hooks";
import { selectAuthUser } from "./authSelectors";
import { selectActiveTenant } from "@/features/tenants/model/tenantSelectors";

// Keeps role and tenant session details consistent for components outside auth state.

/** Exposes the normalized session contract consumed by role-aware UI components. */
export function useSession() {
  const user = useAppSelector(selectAuthUser);
  const tenant = useAppSelector(selectActiveTenant);
  const isEngineAdmin = Boolean(user?.isEngineAdmin);
  const isSSO = Boolean(user?.isSSO);

  return {
    user: user
      ? {
          name: user.name || "Utilisateur",
          // SSO users are viewers in this UI; non-SSO users retain administrative controls.
          role: isEngineAdmin ? "engine_admin" : isSSO ? "sso" : "tenant_admin",
        }
      : null,
    tenant,
    partner: null,
    isSSO,
    isEngineAdmin,
    isTenantAdmin: !isEngineAdmin && !isSSO,
    isAdmin: !isSSO,
  };
}
