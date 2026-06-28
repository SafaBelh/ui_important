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

export function getInvoices(params) {
  return getData("/invoices", params);
}

export function getCommandes(params) {
  return getData("/budget/commandes", params);
}
