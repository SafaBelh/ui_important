import { logError } from "@/shared/utils/logError";

export const STORAGE_KEY = "anomalyiq.state.v2";

// Active UI context should last only for the current browser session.
export function loadStorage() {
  try {
    const r = sessionStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch (error) {
    logError("storage.load", error);
    return null;
  }
}
export function saveStorage(db) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeTenantId: db.activeTenantId,
        activeTenantName: db.activeTenantName,
        activePartnerId: db.activePartnerId,
        isSSO: db.isSSO,
        isEngineAdmin: db.isEngineAdmin,
      })
    );
  } catch (error) {
    logError("storage.save", error);
  }
}
