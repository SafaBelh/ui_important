const EMPTY_PIPELINES = [];

export const selectPipelinesByTenantId = (state) => state.pipelines.byTenantId;

export const selectPipelinesForTenant = (state, tenantId) => {
  if (!tenantId) return EMPTY_PIPELINES;
  return state.pipelines.byTenantId[tenantId] || EMPTY_PIPELINES;
};

export const selectPipelineById = (state, pipelineId) => {
  if (!pipelineId) return null;
  for (const pipelines of Object.values(state.pipelines.byTenantId)) {
    const match = pipelines.find((pipeline) => pipeline.id === pipelineId);
    if (match) return match;
  }
  return null;
};
