import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getTenants } from "../api/tenantsApi";

const initialState = {
  activeTenantId: null,
  activeTenantName: null,
  activePartnerId: null,
  tenants: [],
  tenantStatsById: {},
  loading: false,
  error: null,
};

function isSystemTenant(tenant) {
  const role = String(tenant.role || "").toUpperCase();
  return role === "ADMIN" || role === "ENGINE_ADMIN" || tenant.username === "admin";
}

export const fetchTenants = createAsyncThunk("tenants/fetchTenants", async () => {
  const response = await getTenants({ size: 500 });
  return response?.content || response || [];
});

const tenantsSlice = createSlice({
  name: "tenants",
  initialState,
  reducers: {
    activeTenantChanged(state, action) {
      state.activeTenantId = action.payload.id;
      state.activeTenantName = action.payload.name ?? null;
      state.activePartnerId = null;
    },
    activePartnerChanged(state, action) {
      state.activePartnerId = action.payload;
    },
    tenantsCacheUpdated(state, action) {
      state.tenants = action.payload.filter((tenant) => !isSystemTenant(tenant));
    },
    tenantUpdated(state, action) {
      const tenant = state.tenants.find((item) => item.id === action.payload.id);
      if (tenant) {
        Object.assign(tenant, action.payload.data);
      }
      if (state.activeTenantId === action.payload.id && action.payload.data.name != null) {
        state.activeTenantName = action.payload.data.name;
      }
    },
    tenantRemoved(state, action) {
      state.tenants = state.tenants.filter((tenant) => tenant.id !== action.payload);
      delete state.tenantStatsById[action.payload];
      if (state.activeTenantId === action.payload) {
        state.activeTenantId = null;
        state.activeTenantName = null;
      }
    },
    tenantStatsCacheUpdated(state, action) {
      state.tenantStatsById[action.payload.tenantId] = action.payload.stats || {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenants.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.loading = false;
        state.tenants = action.payload.filter((tenant) => !isSystemTenant(tenant));
      })
      .addCase(fetchTenants.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Unable to load tenants";
      });
  },
});

export const { activePartnerChanged, activeTenantChanged, tenantRemoved, tenantStatsCacheUpdated, tenantsCacheUpdated, tenantUpdated } = tenantsSlice.actions;
export const tenantsReducer = tenantsSlice.reducer;
