export const selectPipelinesByTenantId = (state) => state.pipelines.byTenantId;

export const selectPipelinesForTenant = (state, tenantId) => {
  if (!tenantId) return [];
  return state.pipelines.byTenantId[tenantId] || [];
};

export const selectPipelineById = (state, pipelineId) => {
  if (!pipelineId) return null;
  for (const pipelines of Object.values(state.pipelines.byTenantId)) {
    const match = pipelines.find((pipeline) => pipeline.id === pipelineId);
    if (match) return match;
  }
  return null;
};
