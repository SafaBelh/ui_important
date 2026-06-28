import { apiClient, getErrorMessage } from "@/shared/api/apiClient";

async function getData(url, params) {
  try {
    const response = await apiClient.get(url, { params });
    return response.data;
  } catch (error) {
    error.message = getErrorMessage(error);
    throw error;
  }
}

export function getAdminStats() {
  return getData("/admin/stats");
}

export function getAdminPipelines(params) {
  return getData("/admin/pipelines", params);
}

export function getAdminAlerts(params) {
  return getData("/admin/alerts", params);
}

export function getTenantStatsSummary(params) {
  return getData("/stats", params);
}

export function getTenantStatsCharts(params) {
  return getData("/stats/charts", params);
}
