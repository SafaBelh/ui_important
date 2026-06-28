import { apiClient, getErrorMessage } from "@/shared/api/apiClient";

async function postData(url, data) {
  try {
    const response = await apiClient.post(url, data);
    return response.data;
  } catch (error) {
    error.message = getErrorMessage(error);
    throw error;
  }
}

export function loginRequest(credentials) {
  return postData("/auth/login", credentials);
}

export function refreshSessionRequest() {
  return postData("/auth/refresh");
}
