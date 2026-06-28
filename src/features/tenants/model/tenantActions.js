import { tenantStatsCacheUpdated, tenantsCacheUpdated, tenantUpdated } from "@/features/tenants/model/tenantsSlice";
import { dispatchApp } from "@/shared/model/storeBridge";

export function isSystemTenant(tenant) {
  if (!tenant) return false;
  const role = String(tenant.role || "").toUpperCase();
  return role === "ADMIN" || role === "ENGINE_ADMIN" || tenant.username === "admin";
}

export function setTenantsCache(tenants = []) {
  dispatchApp(tenantsCacheUpdated((Array.isArray(tenants) ? tenants : []).filter((tenant) => !isSystemTenant(tenant))));
}

export function setTenantStatsCache(tenantId, stats = {}) {
  if (!tenantId) return;
  dispatchApp(tenantStatsCacheUpdated({ tenantId, stats: stats || {} }));
}

export function updateTenantStore(id, data = {}) {
  dispatchApp(tenantUpdated({ id, data }));
}
