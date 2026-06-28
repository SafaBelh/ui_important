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

export function getAlerts(params) {
  return requestData("GET", "/alerts", params);
}

export function updateAlertStatus(alertId, status) {
  return requestData("PATCH", `/alerts/${alertId}/status`, { status });
}

export function sendAlertFeedback(alertId, decision, comment = "") {
  return requestData("POST", `/feedback/${alertId}`, { decision, comment });
}
