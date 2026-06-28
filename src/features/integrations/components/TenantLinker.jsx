import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Link2, Loader2, Search, X } from "lucide-react";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { resolvePlatformTenant } from "@/features/integrations/model/tenantLinking";
import styles from "./TenantLinker.module.css";

function getInitials(name) {
  return (name || "?").split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function getColorIndex(id) {
  let hash = 0;
  for (const char of (id || "")) hash = (hash * 31 + char.charCodeAt(0)) & 0xffff;
  return hash % 6;
}

export function GQLTenantLinker({ tenant, platformTenants, onLink, loading = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const linked = resolvePlatformTenant(tenant, platformTenants);

  useEffect(() => {
    const handler = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search
    ? platformTenants.filter((platformTenant) => (platformTenant.name || "").toLowerCase().includes(search.toLowerCase()) || (platformTenant.id || "").toLowerCase().includes(search.toLowerCase()))
    : platformTenants;

  return (
    <div className="gql-tenant-wrap" ref={ref}>
      <div className={`gql-tenant-trigger${linked ? " linked" : ""}${open ? " open" : ""}`} onClick={() => { if (!linked) setOpen((current) => !current); }}>
        {linked ? (
          <>
            <div className={`${styles.linkedAvatar} ${styles[`tenantColor${getColorIndex(linked.id)}`]}`}>{getInitials(linked.name)}</div>
            <div className={styles.tenantText}>
              <div className={styles.linkedName}>{linked.name}</div>
              <div className={styles.linkedId}>{linked.id}</div>
            </div>
            <CheckCircle2 size={14} color={INTEGRATION_COLORS.success} />
            <button className={styles.unlinkButton} onClick={(event) => { event.stopPropagation(); onLink(null); setOpen(false); }} title="Délier">
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <div className={styles.linkIconBox}>
              <Link2 size={11} color={INTEGRATION_COLORS.g400} />
            </div>
            <span className={styles.linkPrompt}>Lier au tenant plateforme…</span>
            <ChevronDown className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`} size={13} color={INTEGRATION_COLORS.g400} />
          </>
        )}
      </div>

      {open && !linked && (
        <div className="gql-tenant-dropdown">
          <div className="gql-search-row">
            <Search size={12} color={INTEGRATION_COLORS.g400} />
            <input className="gql-search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom ou ID…" autoFocus />
          </div>
          <div className={styles.optionsList}>
            {loading ? (
              <div className={styles.loadingState}><Loader2 size={13} className="spin" /> Chargement des tenants...</div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>Aucun résultat</div>
            ) : filtered.map((platformTenant) => (
              <div key={platformTenant.id} className={`gql-opt${platformTenant.id === tenant.platformTenantId ? " sel" : ""}`} onClick={() => { onLink(platformTenant); setOpen(false); setSearch(""); }}>
                <div className={`gql-opt-avatar ${styles[`tenantColorSoft${getColorIndex(platformTenant.id)}`]}`}>{getInitials(platformTenant.name)}</div>
                <div className={styles.tenantText}>
                  <div className="gql-opt-name">{platformTenant.name}</div>
                  <div className="gql-opt-id">{platformTenant.id}{platformTenant.industry ? ` · ${platformTenant.industry}` : ""}</div>
                </div>
                {platformTenant.id === tenant.platformTenantId && <CheckCircle2 size={13} color={INTEGRATION_COLORS.success} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
