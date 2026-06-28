import { alertMarkedRead } from "@/features/alerts/model/alertsSlice";
import { dispatchApp } from "@/shared/model/storeBridge";

export async function markAlertRead(alertId) {
  dispatchApp(alertMarkedRead({ alertId }));
}
