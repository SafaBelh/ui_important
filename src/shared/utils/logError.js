export function logError(scope, error) {
  if (import.meta.env.DEV) {
    console.warn(`[${scope}]`, error);
  }
}
