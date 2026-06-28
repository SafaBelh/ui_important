const EMPTY_PARTNERS = [];

export const selectPartnersByTenantId = (state) => state.partners.byTenantId;

export const selectPartnersForTenant = (state, tenantId) => {
  if (!tenantId) return EMPTY_PARTNERS;
  return state.partners.byTenantId[tenantId] || EMPTY_PARTNERS;
};
