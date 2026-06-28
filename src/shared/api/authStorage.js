const TOKEN_KEY = "anomalyiq_token";
const USER_KEY = "anomalyiq_user";

// Browser sessionStorage facade for the auth credentials needed by API and role checks.

function decodeBase64UrlJson(value) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isExpired(payload) {
  return typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000);
}

function isMalformedOrExpiredToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return true;
  }

  const payload = decodeBase64UrlJson(parts[1]);
  return !payload || isExpired(payload);
}

/** Returns the stored JWT, clearing auth state if a malformed token is detected. */
export function getToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token && isMalformedOrExpiredToken(token)) {
    clearSession();
    return null;
  }
  return token;
}

/** Persists the current access token used by API requests for this browser session. */
export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/** Returns the stored user profile, or null when storage contains invalid JSON. */
export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

/** Persists the user profile used for role and tenant-scoping decisions in sessionStorage. */
export function setUser(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clears authentication credentials from sessionStorage. */
export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
