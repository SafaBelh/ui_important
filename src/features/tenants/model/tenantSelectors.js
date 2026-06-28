export const selectTenants = (state) => state.tenants.tenants;
export const selectActiveTenantId = (state) => state.tenants.activeTenantId;
export const selectActiveTenantName = (state) => state.tenants.activeTenantName;
export const selectActivePartnerId = (state) => state.tenants.activePartnerId;
export const selectTenantStatsById = (state) => state.tenants.tenantStatsById;
export const selectTenantStats = (state, tenantId) => {
  if (!tenantId) return {};
  return state.tenants.tenantStatsById[tenantId] || {};
};

function stringHash(value) {
  if (!value) return 0;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function enrichTenantWithStats(tenant, stats) {
  if (!tenant) return tenant;
  const fallbackLogo = (tenant.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
  const invoiceCount = Number(stats?.invoicesCount ?? 0);
  const anomalyCount = Number(stats?.anomaliesCount ?? 0);

  return {
    ...tenant,
    plan: tenant.role || "USER",
    mrr: stats?.mrr ?? 0,
    invoiceCount,
    anomalyCount,
    anomalyRate: invoiceCount ? anomalyCount / invoiceCount : 0,
    storage: tenant.storage || "shared",
    color: tenant.color || `#${(stringHash(tenant.id || tenant.name) % 0xFFFFFF).toString(16).padStart(6, "0")}`,
    logo: tenant.logo || fallbackLogo,
  };
}

export const selectEnrichedTenants = (state) => {
  return selectTenants(state).map((tenant) => enrichTenantWithStats(tenant, selectTenantStats(state, tenant.id)));
};

export const selectEnrichedTenantById = (state, tenantId) => {
  if (!tenantId) return null;
  const tenant = selectTenants(state).find((item) => item.id === tenantId);
  return tenant ? enrichTenantWithStats(tenant, selectTenantStats(state, tenantId)) : null;
};

export const selectActiveTenant = (state) => {
  const activeTenantId = selectActiveTenantId(state);
  if (!activeTenantId) return null;

  const tenant = state.tenants.tenants.find((item) => item.id === activeTenantId);
  return tenant
    ? enrichTenantWithStats(tenant, selectTenantStats(state, activeTenantId))
    : { id: activeTenantId, name: state.tenants.activeTenantName || activeTenantId };
};
