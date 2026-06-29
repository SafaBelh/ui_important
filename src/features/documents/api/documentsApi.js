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

export function getDocuments(params) {
  return getData("/documents", params);
}
