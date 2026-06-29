import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getDocuments } from "../api/documentsApi";

const initialState = {
  invoicesByTenantId: {},
  commandesByTenantId: {},
  loadingTenantIds: [],
  error: null,
};

export const fetchInvoicesForTenant = createAsyncThunk(
  "documents/fetchInvoicesForTenant",
  async ({ tenantId, isEngineAdmin, size = 1000 }) => {
    const params = isEngineAdmin ? { adminTenantId: tenantId, size } : { size };
    const response = await getDocuments({ ...params, recordType: "INVOICE" });
    return { tenantId, invoices: response?.content || response || [] };
  }
);

export const fetchCommandesForTenant = createAsyncThunk(
  "documents/fetchCommandesForTenant",
  async ({ tenantId, isEngineAdmin, size = 1000 }) => {
    const params = isEngineAdmin ? { adminTenantId: tenantId, size } : { size };
    const response = await getDocuments({ ...params, recordType: "COMMANDE" });
    return { tenantId, commandes: response?.content || response?.commandes || response || [] };
  }
);

const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    invoicesCacheUpdated(state, action) {
      state.invoicesByTenantId[action.payload.tenantId] = action.payload.invoices;
    },
    commandesCacheUpdated(state, action) {
      state.commandesByTenantId[action.payload.tenantId] = action.payload.commandes;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvoicesForTenant.fulfilled, (state, action) => {
        state.invoicesByTenantId[action.payload.tenantId] = action.payload.invoices;
      })
      .addCase(fetchCommandesForTenant.fulfilled, (state, action) => {
        state.commandesByTenantId[action.payload.tenantId] = action.payload.commandes;
      })
      .addMatcher(
        (action) => action.type.startsWith("documents/") && action.type.endsWith("/rejected"),
        (state, action) => {
          state.error = action.error?.message || "Unable to load documents";
        }
      );
  },
});

export const { commandesCacheUpdated, invoicesCacheUpdated } = documentsSlice.actions;
export const documentsReducer = documentsSlice.reducer;
