import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getPipelines } from "../api/pipelinesApi";

const initialState = {
  byTenantId: {},
  loadingTenantIds: [],
  error: null,
};

export const fetchPipelinesForTenant = createAsyncThunk(
  "pipelines/fetchForTenant",
  async ({ tenantId, isEngineAdmin }) => {
    const params = isEngineAdmin ? { adminTenantId: tenantId, size: 200 } : { size: 200 };
    const response = await getPipelines(params);
    return { tenantId, pipelines: response?.content || response || [] };
  }
);

const pipelinesSlice = createSlice({
  name: "pipelines",
  initialState,
  reducers: {
    pipelinesCacheUpdated(state, action) {
      state.byTenantId[action.payload.tenantId] = action.payload.pipelines;
    },
    pipelineUpdated(state, action) {
      Object.values(state.byTenantId).forEach((pipelines) => {
        const pipeline = pipelines.find((item) => item.id === action.payload.id);
        if (pipeline) {
          Object.assign(pipeline, action.payload.data);
        }
      });
    },
    pipelineRemoved(state, action) {
      Object.keys(state.byTenantId).forEach((tenantId) => {
        state.byTenantId[tenantId] = state.byTenantId[tenantId].filter((pipeline) => pipeline.id !== action.payload);
      });
    },
    tenantPipelinesCleared(state, action) {
      state.byTenantId[action.payload] = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPipelinesForTenant.pending, (state, action) => {
        state.error = null;
        state.loadingTenantIds.push(action.meta.arg.tenantId);
      })
      .addCase(fetchPipelinesForTenant.fulfilled, (state, action) => {
        state.loadingTenantIds = state.loadingTenantIds.filter((tenantId) => tenantId !== action.payload.tenantId);
        state.byTenantId[action.payload.tenantId] = action.payload.pipelines;
      })
      .addCase(fetchPipelinesForTenant.rejected, (state, action) => {
        state.loadingTenantIds = state.loadingTenantIds.filter((tenantId) => tenantId !== action.meta.arg.tenantId);
        state.error = action.error.message || "Unable to load pipelines";
      });
  },
});

export const { pipelineRemoved, pipelinesCacheUpdated, pipelineUpdated, tenantPipelinesCleared } = pipelinesSlice.actions;
export const pipelinesReducer = pipelinesSlice.reducer;
