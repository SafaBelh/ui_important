const tenantCredentials = new Map();

export function getTenantCredentials(tenantId, tenant = null) {
  if (!tenantId) return null;
  if (!tenantCredentials.has(tenantId)) {
    if (!tenant?.username) return null;
    tenantCredentials.set(tenantId, { username: tenant.username, password: "••••••••••••••••" });
  }
  return tenantCredentials.get(tenantId);
}

export function updateTenantCredentials(tenantId, data = {}, tenant = null) {
  if (!tenantId) return null;
  const current = getTenantCredentials(tenantId, tenant) || {};
  const next = {
    username: data.username ?? current.username,
    password: data.password ?? current.password,
  };
  tenantCredentials.set(tenantId, next);
  return next;
}
