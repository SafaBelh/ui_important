import { activePartnerChanged, activeTenantChanged } from "@/features/tenants/model/tenantsSlice";
import { dispatchApp, getAppState } from "@/shared/model/storeBridge";
import { saveStorage } from "@/utils/storage";

// Coordinates active tenant/partner state with the session snapshot in storage.

/** Persists the reload-safe subset of session context and role flags. */
function persistSession() {
  const state = getAppState();
  saveStorage({
    activeTenantId: state.tenants.activeTenantId,
    activeTenantName: state.tenants.activeTenantName,
    activePartnerId: state.tenants.activePartnerId,
    isSSO: state.auth.user?.isSSO ?? false,
    isEngineAdmin: state.auth.user?.isEngineAdmin ?? false,
  });
}

/** Clears tenant and partner selection after logout while preserving persisted role flags. */
export function storeLogout() {
  dispatchApp(activeTenantChanged({ id: null, name: null }));
  dispatchApp(activePartnerChanged(null));
  persistSession();
}

/** Restores tenant context from local storage before fresh tenant data is loaded. */
export function restoreStoredSession(storedSession = {}) {
  dispatchApp(activeTenantChanged({
    id: storedSession.activeTenantId ?? null,
    name: storedSession.activeTenantName ?? null,
  }));
  dispatchApp(activePartnerChanged(storedSession.activePartnerId ?? null));
}

/** Selects the active tenant and persists the display name used during reloads. */
export function setActiveTenant(id, name = null) {
  const state = getAppState();
  const tenantName = name || state.tenants.tenants.find((tenant) => tenant.id === id)?.name || null;
  dispatchApp(activeTenantChanged({ id, name: tenantName }));
  persistSession();
}

/** Selects the active ERP partner; SSO sessions cannot change partner scope. */
export function setActivePartner(partnerId) {
  const state = getAppState();
  if (state.auth.user?.isSSO) return;
  dispatchApp(activePartnerChanged(partnerId));
  persistSession();
}
