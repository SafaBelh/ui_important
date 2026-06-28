const EMPTY_DOCUMENTS = [];

export const selectInvoicesForTenant = (state, tenantId) => {
  if (!tenantId) return EMPTY_DOCUMENTS;
  return state.documents.invoicesByTenantId[tenantId] || EMPTY_DOCUMENTS;
};

export const selectCommandesForTenant = (state, tenantId) => {
  if (!tenantId) return EMPTY_DOCUMENTS;
  return state.documents.commandesByTenantId[tenantId] || EMPTY_DOCUMENTS;
};
