export function resolvePlatformTenant(tenant, platformTenants = []) {
  if (!tenant) return null;
  const direct = platformTenants.find((platformTenant) => platformTenant.id === tenant.platformTenantId)
    || platformTenants.find((platformTenant) => platformTenant.name === tenant.platformTenantName);
  if (direct) return direct;
  return tenant.platformTenantName ? { id: tenant.platformTenantId || "", name: tenant.platformTenantName } : null;
}
