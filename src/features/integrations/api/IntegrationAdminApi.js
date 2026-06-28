import { apiClient, getErrorMessage } from "@/shared/api/apiClient";

async function requestData(method, url, payload) {
  try {
    const response = await apiClient.request({
      method,
      url,
      params: method === "GET" ? payload : undefined,
      data: method === "GET" ? undefined : payload,
    });
    return response.data;
  } catch (error) {
    error.message = getErrorMessage(error);
    throw error;
  }
}

export function getAdminConnectors(params) {
  return requestData("GET", "/admin/connectors", params);
}

export function createAdminConnector(payload) {
  return requestData("POST", "/admin/connectors", payload);
}

export function updateAdminConnector(connectorId, payload) {
  return requestData("PUT", `/admin/connectors/${connectorId}`, payload);
}

export function previewConnectorConnection(connectorId, payload) {
  return connectorId
    ? requestData("POST", `/admin/connectors/${connectorId}/preview-connection`, payload)
    : requestData("POST", "/admin/connectors/preview-connection", payload);
}

export function getConnectorSchema(connectorId) {
  return requestData("GET", `/admin/connectors/${connectorId}/schema`);
}

export function discoverConnectorSchema(payload) {
  return requestData("POST", "/admin/connectors/schema", payload);
}

export function previewConnectorTable(connectorId, payload) {
  return requestData("POST", `/admin/connectors/${connectorId}/preview-table`, payload);
}

export function previewUnsavedConnectorTable(table, limit, payload) {
  return requestData("POST", `/admin/connectors/preview-table?table=${encodeURIComponent(table)}&limit=${limit}`, payload);
}

export function previewConnectorBudget(connectorId, queryString, payload) {
  return connectorId
    ? requestData("POST", `/admin/connectors/${connectorId}/budget-preview${queryString}`, payload)
    : requestData("POST", `/admin/connectors/budget-preview${queryString}`, payload);
}

export function validateConnectorPipelines(connectorId) {
  return requestData("POST", `/admin/connectors/${connectorId}/validate-pipelines`);
}

export function getTenantActivationStatus(params) {
  return requestData("GET", "/admin/tenant-activations/status", params);
}
