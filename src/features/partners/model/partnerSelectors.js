export const selectPartnersByTenantId = (state) => state.partners.byTenantId;

export const selectPartnersForTenant = (state, tenantId) => {
  if (!tenantId) return [];
  return state.partners.byTenantId[tenantId] || [];
};
