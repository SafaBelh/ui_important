import { pipelineRemoved, tenantPipelinesCleared } from "@/features/pipelines/model/pipelinesSlice";
import { tenantRemoved } from "@/features/tenants/model/tenantsSlice";
import { dispatchApp } from "@/shared/model/storeBridge";

// Local Redux updates that mirror already-confirmed destructive backend actions.

/** Removes a pipeline from local state after a destructive pipeline action succeeds. */
export function deletePipeline(pipelineId) {
  dispatchApp(pipelineRemoved(pipelineId));
}

/** Clears locally cached analysis artifacts for a tenant without deleting the tenant itself. */
export function deleteTenantAnalysisData(tenantId) {
  dispatchApp(tenantPipelinesCleared(tenantId));
}

/** Removes a tenant from local state and returns success for legacy confirmation flows. */
export function deleteTenant(tenantId) {
  dispatchApp(tenantRemoved(tenantId));
  return true;
}
