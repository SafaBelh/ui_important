import { auditEntriesLoaded, auditEntryAdded } from "@/features/audit/model/auditSlice";
import { apiClient, getErrorMessage } from "@/shared/api/apiClient";
import { getUser } from "@/shared/api/authStorage";
import { dispatchApp } from "@/shared/model/storeBridge";
import { logError } from "@/shared/utils/logError";

// Bridges audit UI state with the backend audit stream.

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

/**
 * Writes an optimistic audit event to Redux and asynchronously mirrors it to the
 * backend audit stream, which remains the source of truth on reload.
 */
export function addAuditEntry(action, detail, userId) {
  const entry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    detail,
    userId: userId || getUser()?.name || "unknown",
    timestamp: new Date().toISOString(),
  };
  dispatchApp(auditEntryAdded(entry));
  // Audit writes are fire-and-forget so user actions are not blocked by history persistence.
  requestData("POST", "/audit", { action: entry.action, detail: entry.detail, actor: entry.userId }).catch((error) => logError("audit.persistEntry", error));
}

/** Loads the latest backend audit entries into Redux for audit/history views. */
export async function loadAuditLog() {
  const res = await requestData("GET", "/audit", { size: 200 });
  const rows = (res?.content || res || []).map((e) => ({
    id: e.id,
    action: e.action,
    detail: e.detail,
    userId: e.actor || "unknown",
    timestamp: e.createdAt || e.timestamp,
  }));
  dispatchApp(auditEntriesLoaded(rows));
  return rows;
}
