import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getAlerts } from "../api/alertsApi";

const initialState = {
  byTenantId: {},
  loadingTenantIds: [],
  error: null,
};

export const fetchAlertsForTenant = createAsyncThunk(
  "alerts/fetchForTenant",
  async ({ tenantId, isEngineAdmin }) => {
    const params = isEngineAdmin ? { adminTenantId: tenantId, size: 200 } : { size: 200 };
    const response = await getAlerts(params);
    return { tenantId, alerts: response?.content || response || [] };
  }
);

const alertsSlice = createSlice({
  name: "alerts",
  initialState,
  reducers: {
    alertsCacheUpdated(state, action) {
      state.byTenantId[action.payload.tenantId] = action.payload.alerts;
    },
    alertsAdded(state, action) {
      action.payload.forEach((alert) => {
        if (!alert.tenantId) return;
        const existingAlerts = state.byTenantId[alert.tenantId] || [];
        const alreadyExists = existingAlerts.some((item) => (
          (alert.id && item.id === alert.id) ||
          (alert.invoiceRef && item.invoiceRef === alert.invoiceRef)
        ));
        if (!alreadyExists) {
          state.byTenantId[alert.tenantId] = [...existingAlerts, alert];
        }
      });
    },
    alertMarkedRead(state, action) {
      Object.values(state.byTenantId).forEach((alerts) => {
        const alert = alerts.find((item) => item.id === action.payload.alertId);
        if (alert) {
          alert.read = true;
          alert.status = "READ";
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlertsForTenant.pending, (state, action) => {
        state.error = null;
        state.loadingTenantIds.push(action.meta.arg.tenantId);
      })
      .addCase(fetchAlertsForTenant.fulfilled, (state, action) => {
        state.loadingTenantIds = state.loadingTenantIds.filter((tenantId) => tenantId !== action.payload.tenantId);
        state.byTenantId[action.payload.tenantId] = action.payload.alerts;
      })
      .addCase(fetchAlertsForTenant.rejected, (state, action) => {
        state.loadingTenantIds = state.loadingTenantIds.filter((tenantId) => tenantId !== action.meta.arg.tenantId);
        state.error = action.error.message || "Unable to load alerts";
      });
  },
});

export const { alertMarkedRead, alertsAdded, alertsCacheUpdated } = alertsSlice.actions;
export const alertsReducer = alertsSlice.reducer;
