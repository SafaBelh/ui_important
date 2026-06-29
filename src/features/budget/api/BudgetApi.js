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

export function getBudgetConnectors(params) {
  return requestData("GET", "/budget/connectors", params);
}

export function getBudgetSeriesAnalysis(params) {
  return requestData("GET", "/budget/series-analysis", params);
}

export function getBudgetOverview(params) {
  return requestData("GET", "/budget/overview", params);
}

export function getBudgetSuivi(params) {
  return requestData("GET", "/budget/suivi", params);
}

export function getBudgetAnalysis(params) {
  return requestData("GET", "/budget/analysis", params);
}
