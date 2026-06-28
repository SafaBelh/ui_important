export const selectInvoicesForTenant = (state, tenantId) => {
  if (!tenantId) return [];
  return state.documents.invoicesByTenantId[tenantId] || [];
};

export const selectCommandesForTenant = (state, tenantId) => {
  if (!tenantId) return [];
  return state.documents.commandesByTenantId[tenantId] || [];
};
