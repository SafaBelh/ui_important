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

export function getTenants(params = { size: 500 }) {
  return requestData("GET", "/admin/tenants", params);
}

export function createTenant(payload) {
  return requestData("POST", "/admin/tenants", payload);
}

export function updateTenant(tenantId, payload) {
  return requestData("PUT", `/admin/tenants/${tenantId}`, payload);
}

export function deleteTenant(tenantId) {
  return requestData("DELETE", `/admin/tenants/${tenantId}`);
}

export function getTenantStats(tenantId) {
  return requestData("GET", `/admin/stats/tenant/${tenantId}`);
}

export function getTenantConnections(params) {
  return requestData("GET", "/admin/tenant-connections", params);
}

export function createTenantConnection(payload) {
  return requestData("POST", "/admin/tenant-connections", payload);
}

export function updateTenantConnection(connectionId, payload) {
  return requestData("PUT", `/admin/tenant-connections/${connectionId}`, payload);
}

export function deleteTenantConnection(connectionId) {
  return requestData("DELETE", `/admin/tenant-connections/${connectionId}`);
}

export function getTenantSourceConnection(connectionId) {
  return requestData("GET", `/admin/tenant-connections/${connectionId}/source-connection`);
}

export function updateTenantSourceConnection(connectionId, payload) {
  return requestData("PUT", `/admin/tenant-connections/${connectionId}/source-connection`, payload);
}

export function activateTenantConnection(connectionId) {
  return requestData("POST", `/admin/tenant-connections/${connectionId}/activate`);
}

export function getTenantActivation(jobId) {
  return requestData("GET", `/admin/tenant-activations/${jobId}`);
}

export function bulkCreateTenantConnections(payload) {
  return requestData("POST", "/admin/tenant-connections/bulk", payload);
}

export function bulkActivateTenants(payload) {
  return requestData("POST", "/admin/tenant-activations/bulk", payload);
}
