import axios from "axios";
import { clearSession, getToken, getUser, setToken } from "./authStorage";

// Shared Axios client that attaches auth, tenant scope, and token-refresh behavior.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

let refreshTokenRequest = null;

/** Reads an engine-admin tenant override from request params or body data. */
function getAdminTenantId(config) {
  return config?.params?.adminTenantId || config?.data?.adminTenantId || null;
}

/** Deduplicates concurrent refresh calls and stores the replacement access token. */
async function refreshAccessToken() {
  if (!refreshTokenRequest) {
    refreshTokenRequest = apiClient
      .post("/auth/refresh", undefined, { skipAuthRefresh: true })
      .then((response) => {
        const nextToken = response.data?.access_token || response.data?.token || response.data?.accessToken;
        if (!nextToken) throw new Error("Token refresh failed");
        setToken(nextToken);
        return nextToken;
      })
      .finally(() => {
        refreshTokenRequest = null;
      });
  }

  return refreshTokenRequest;
}

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const user = getUser();
  const adminTenantId = getAdminTenantId(config);
  // Engine admins can impersonate a tenant scope; tenant users always use their own backend scope.
  if (user?.isEngineAdmin && adminTenantId) {
    config.headers["X-Tenant-ID"] = adminTenantId;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRequest = originalRequest?.url?.startsWith("/auth/");
    const canRefresh = error.response?.status === 401 && !isAuthRequest && !originalRequest?._retry && getToken();

    if (canRefresh) {
      originalRequest._retry = true;
      try {
        await refreshAccessToken();
        return apiClient(originalRequest);
      } catch {
        clearSession();
      }
    }

    return Promise.reject(error);
  }
);

/** Returns the most useful backend-provided error text for UI notifications. */
export function getErrorMessage(error) {
  const payload = error?.response?.data;
  return payload?.message || payload?.error || payload || error?.message || "Request failed";
}
