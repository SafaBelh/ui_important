import { reduxStore } from "@/store/reduxStore";

/**
 * Transitional bridge for legacy non-React loaders/actions that still need Redux.
 * New feature code should prefer hooks or RTK thunks instead of importing this.
 */
export const dispatchApp = reduxStore.dispatch;
export const getAppState = reduxStore.getState;
