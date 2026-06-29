// Optional per-tenant isolated source database. Most tenants share the connector's
// source DB (default); a tenant whose data lives in its own database sets the
// connection here. The password is write-only — left blank on edit it is preserved.
import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { getTenantSourceConnection, updateTenantSourceConnection } from "@/features/tenants/api/tenantsApi";
import { logError } from "@/shared/utils/logError";

const box = { marginTop: 8, padding: 10, border: "1px solid rgba(0,0,0,.10)", borderRadius: 8, background: "rgba(0,0,0,.015)" };
const toggle = { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 500 };
const grid = { display: "grid", gap: 8, marginTop: 8 };

export function TenantSourceDbForm({ connectionId, toast }) {
  const [enabled, setEnabled] = useState(false);
  const [jdbcUrl, setJdbcUrl] = useState("");
  const [jdbcUsername, setJdbcUsername] = useState("");
  const [jdbcPassword, setJdbcPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getTenantSourceConnection(connectionId)
      .then((res) => {
        if (!live) return;
        setEnabled(!!res?.enabled);
        setJdbcUrl(res?.jdbcUrl || "");
        setJdbcUsername(res?.jdbcUsername || "");
        setHasPassword(!!res?.hasPassword);
      })
      .catch((error) => logError("tenantSourceDb.load", error))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [connectionId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = enabled
        ? { enabled: true, jdbcUrl: jdbcUrl.trim(), jdbcUsername: jdbcUsername.trim() || null, jdbcPassword: jdbcPassword || undefined }
        : { enabled: false };
      const res = await updateTenantSourceConnection(connectionId, payload);
      setHasPassword(!!res?.hasPassword);
      setJdbcPassword("");
      toast?.(enabled ? "Base de données isolée enregistrée" : "Base partagée rétablie (par défaut)", "success");
    } catch (e) {
      toast?.(e.message || "Erreur d'enregistrement", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div style={box}>
      <label style={toggle}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <Database size={13} /> Ce tenant utilise sa propre base de données
      </label>
      {enabled && (
        <div style={grid}>
          <input className="input-field" value={jdbcUrl} onChange={(e) => setJdbcUrl(e.target.value)}
                 placeholder="JDBC URL — ex: jdbc:postgresql://host:5432/db_du_tenant" />
          <input className="input-field" value={jdbcUsername} onChange={(e) => setJdbcUsername(e.target.value)}
                 placeholder="Utilisateur" />
          <input className="input-field" type="password" value={jdbcPassword} onChange={(e) => setJdbcPassword(e.target.value)}
                 placeholder={hasPassword ? "•••••• (laisser vide pour conserver)" : "Mot de passe"} />
        </div>
      )}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-primary" style={{ fontSize: 11 }} onClick={save}
                disabled={saving || (enabled && !jdbcUrl.trim())}>
          {saving ? "Enregistrement…" : "Enregistrer la base source"}
        </button>
      </div>
    </div>
  );
}
