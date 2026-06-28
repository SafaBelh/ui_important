import { alertsAdded } from "@/features/alerts/model/alertsSlice";
import { pipelineUpdated } from "@/features/pipelines/model/pipelinesSlice";
import { dispatchApp } from "@/shared/model/storeBridge";

export async function updatePipelineStore(id, data = {}) {
  dispatchApp(pipelineUpdated({ id, data }));
}

export function addPipelineDetectionAlerts(alerts = []) {
  dispatchApp(alertsAdded(alerts));
}
