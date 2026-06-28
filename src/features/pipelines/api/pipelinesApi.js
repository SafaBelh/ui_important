import { apiClient, getErrorMessage } from "@/shared/api/apiClient";

async function requestData(method, url, payload) {
  try {
    const response = await apiClient.request({
      method,
      url,
      params: ["GET", "DELETE"].includes(method) ? payload : undefined,
      data: ["GET", "DELETE"].includes(method) ? undefined : payload,
    });
    return response.data;
  } catch (error) {
    error.message = getErrorMessage(error);
    throw error;
  }
}

export function getPipelines(params) {
  return requestData("GET", "/pipelines", params);
}

export function createPipeline(payload) {
  return requestData("POST", "/pipelines", payload);
}

export function updatePipeline(pipelineId, payload) {
  return requestData("PUT", `/pipelines/${pipelineId}`, payload);
}

export function deletePipeline(pipelineId) {
  return requestData("DELETE", `/pipelines/${pipelineId}`);
}

export function runPipeline(pipelineId, payload) {
  return requestData("POST", `/pipelines/${pipelineId}/run`, payload);
}

export function updatePipelineMapping(pipelineId, payload) {
  return requestData("PUT", `/pipelines/${pipelineId}/mapping`, payload);
}

export function previewPipelineSourceConnection(payload) {
  return requestData("POST", "/pipelines/source/preview-connection", payload);
}

export function getPipelineSourceSchema(payload) {
  return requestData("POST", "/pipelines/source/schema", payload);
}

export function checkPipelineInvoice(pipelineId, payload) {
  return requestData("POST", `/pipelines/${pipelineId}/invoices/check`, payload);
}

export function confirmPipelineInvoice(pipelineId, payload) {
  return requestData("POST", `/pipelines/${pipelineId}/invoices/confirm`, payload);
}

export function getPipelineRuns(pipelineId, params) {
  return requestData("GET", `/pipelines/${pipelineId}/runs`, params);
}

export function getPipelineRunLogs(pipelineId, runId, params) {
  return requestData("GET", `/pipelines/${pipelineId}/runs/${runId}/logs`, params);
}
