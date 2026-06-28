export const selectAlertsByTenantId = (state) => state.alerts.byTenantId;

export const selectAlertsForTenant = (state, tenantId) => {
  if (!tenantId) return [];
  return state.alerts.byTenantId[tenantId] || [];
};

export const selectUnreadAlertCountForTenant = (state, tenantId) => {
  return selectAlertsForTenant(state, tenantId).filter((alert) => !alert.read).length;
};
