import axios from "axios";
import { clearSession, getToken, getUser, setToken } from "./authStorage";
import { sessionSynced } from "@/features/auth/model/authSlice";
import { dispatchApp } from "@/shared/model/storeBridge";

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
      .post("/auth/refresh")
      .then((response) => {
        const nextToken = response.data?.access_token || response.data?.token || response.data?.accessToken;
        if (!nextToken) throw new Error("Token refresh failed");
        const session = setToken(nextToken);
        dispatchApp(sessionSynced(session));
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
        dispatchApp(sessionSynced(clearSession()));
      }
    }

    return Promise.reject(error);
  }
);

/** Returns the most useful backend-provided error text for UI notifications. */
export function getErrorMessage(error) {
  const payload = error?.response?.data;
  return toErrorText(payload?.message || payload?.error || payload || error?.message) || "Request failed";
}

function toErrorText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toErrorText).filter(Boolean).join(", ");
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
