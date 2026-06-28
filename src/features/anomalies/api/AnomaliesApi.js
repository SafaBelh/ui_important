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

export function getAnomalies(params) {
  return requestData("GET", "/anomalies", params);
}

export function getAnomalyDistribution(anomalyId, params) {
  return requestData("GET", `/anomalies/${anomalyId}/distribution`, params);
}

export function getAnomalyAggregate(params) {
  return requestData("GET", "/anomalies/aggregate", params);
}

export function sendAnomalyFeedback(anomalyId, decision, comment = "") {
  return requestData("POST", `/feedback/${anomalyId}`, { decision, comment });
}
