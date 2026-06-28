import { combineReducers } from "@reduxjs/toolkit";
import { alertsReducer } from "@/features/alerts/model/alertsSlice";
import { auditReducer } from "@/features/audit/model/auditSlice";
import { authReducer } from "@/features/auth/model/authSlice";
import { documentsReducer } from "@/features/documents/model/documentsSlice";
import { partnersReducer } from "@/features/partners/model/partnersSlice";
import { pipelinesReducer } from "@/features/pipelines/model/pipelinesSlice";
import { tenantsReducer } from "@/features/tenants/model/tenantsSlice";

export const rootReducer = combineReducers({
  alerts: alertsReducer,
  audit: auditReducer,
  auth: authReducer,
  documents: documentsReducer,
  partners: partnersReducer,
  pipelines: pipelinesReducer,
  tenants: tenantsReducer,
});
