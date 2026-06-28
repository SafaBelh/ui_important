// Tenant ERP connection UI: inline connector picker + the ERP connection form.
// Extracted from TenantsView.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "@/shared/ui/Icon";
import { Link2 } from "lucide-react";
import { getAdminConnectors } from "@/features/integrations/api/IntegrationAdminApi";
import { createTenantConnection } from "@/features/tenants/api/tenantsApi";
import { logError } from "@/shared/utils/logError";
import { COLORS } from "@/constants/colors";
import styles from "./TenantErpConnection.module.css";
export function ErpConnectInline({ tenantId, existingConnections = [], onCancel, onDone, toast }) {
  const [connectors, setConnectors] = useState([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [erpTenantSearch, setErpTenantSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedConn = connectors.find(c => c.id === selectedConnectorId);
  const isAlreadyLinked = useCallback(
    (connectorId, erpTenantId) => existingConnections.some((c) => c.connectorId === connectorId && c.externalId === erpTenantId),
    [existingConnections]
  );
  const erpTenantOptions = useMemo(() => {
    const raw = selectedConn?.tenants || selectedConn?.tenantIds || selectedConn?.availableTenants || [];
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return raw.split(",").map((id) => ({ id: id.trim(), label: id.trim(), active: true })).filter((x) => x.id); }
    }
    return Array.isArray(raw)
      ? raw.map((t) => typeof t === "string" ? { id: t, label: t, active: true } : { id: t.id || t.externalId || t.tenantId || t.label, label: t.label || t.name || t.id || t.externalId || t.tenantId, active: t.active !== false })
        .filter((t) => t.id)
      : [];
  }, [selectedConn]);
  const filteredErpTenantOptions = useMemo(() => {
    const q = erpTenantSearch.trim().toLowerCase();
    if (!q) return erpTenantOptions;
    return erpTenantOptions.filter((t) => `${t.label || ""} ${t.id || ""}`.toLowerCase().includes(q));
  }, [erpTenantOptions, erpTenantSearch]);
  const selectedErpTenant = erpTenantOptions.find((t) => t.id === externalId);
  const selectedAlreadyLinked = !!selectedConnectorId && !!externalId && isAlreadyLinked(selectedConnectorId, externalId);
  const canLinkSelectedTenant = !!selectedConnectorId && !!externalId && !!selectedErpTenant && selectedErpTenant.active !== false && !selectedAlreadyLinked;

  useEffect(() => {
    getAdminConnectors({ size: 100 })
      .then(res => setConnectors(res?.content || []))
      .catch((error) => logError("tenantErpConnection.loadConnectors", error));
  }, []);

  const handleSave = async () => {
    if (!canLinkSelectedTenant) return;
    setSaving(true);
    try {
      await createTenantConnection({
        tenantId,
        connectorId: selectedConnectorId,
        externalId: externalId.trim(),
        notes: notes.trim() || undefined,
      });
      toast("Connexion ERP créée", "success");
      onDone();
    } catch (e) {
      console.error("Failed:", e);
      toast(e.response?.data?.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.inlineRoot}>
      <div className={styles.inlineHeader}>
        <div className={styles.inlineHeaderIcon}>
          <Link2 size={13} color={COLORS.red} />
        </div>
        <div className={styles.inlineHeaderText}>
          <div className={styles.inlineTitle}>Lier un connecteur ERP</div>
          <div className={styles.inlineSubtitle}>Sélectionnez un ERP puis un tenant déclaré par cet ERP</div>
        </div>
        <button onClick={onCancel} className={styles.inlineCloseButton}>
          <Icon name="x" size={13} color={COLORS.grey400} />
        </button>
      </div>

      <div className={styles.inlineBody}>
        {connectors.length > 0 ? (
          <div>
            <label className={`${styles.label} ${styles.labelSpaced}`}>
              Connecteurs ERP disponibles <span className={styles.required}>*</span>
            </label>
            <div className={styles.connectorList}>
              {connectors.map((conn, index) => {
                const isSelected = selectedConnectorId === conn.id;
                const tenants = Array.isArray(conn.tenants) ? conn.tenants : [];
                const normalizedTenants = tenants.map((t) => typeof t === "string" ? { id: t, active: true } : { id: t.id || t.externalId || t.tenantId || t.label, active: t.active !== false }).filter((t) => t.id);
                const activeCount = normalizedTenants.filter((t) => t.active !== false).length;
                const remainingCount = normalizedTenants.filter((t) => t.active !== false && !isAlreadyLinked(conn.id, t.id)).length;
                const allActiveLinked = activeCount > 0 && remainingCount === 0;
                const noActiveTenant = activeCount === 0;
                const statusLabel = conn.availabilityStatus || (conn.status === "factures.status" ? "ACTIVE" : conn.status) || "ACTIVE";
                return (
                  <div
                    key={conn.id}
                    onClick={() => { if (!allActiveLinked) { setSelectedConnectorId(conn.id); setExternalId(""); setErpTenantSearch(""); } }}
                    className={`${styles.connectorOption} ${isSelected ? styles.connectorOptionSelected : ""} ${allActiveLinked ? styles.optionDisabled : ""}`}
                  >
                    <div className={styles.connectorLogo}>
                      <svg className={styles.connectorLogoBg} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
                        <defs>
                          <linearGradient id={`connector-logo-${index}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor={conn.color || "#64748B"} />
                            <stop offset="1" stopColor={conn.color || "#64748B"} stopOpacity="0.73" />
                          </linearGradient>
                        </defs>
                        <rect width="28" height="28" rx="8" fill={`url(#connector-logo-${index})`} />
                      </svg>
                      <span className={styles.connectorLogoText}>{conn.logo || conn.name?.[0] || "?"}</span>
                    </div>
                    <div className={styles.connectorInfo}>
                      <div className={`${styles.connectorName} ${isSelected ? styles.connectorNameSelected : ""}`}>{conn.name}</div>
                      <div className={styles.connectorMeta}>{conn.connectorType || conn.type || "ERP"} · {conn.authType} · {activeCount}/{tenants.length} tenants ERP actifs · {remainingCount} à lier</div>
                    </div>
                    <span className={`${styles.badge} ${allActiveLinked ? styles.badgeMuted : noActiveTenant ? styles.badgeWarning : statusLabel === "ACTIVE" || statusLabel === "available" || statusLabel === "connected" ? styles.badgeSuccess : styles.badgeWarning}`}>
                      {allActiveLinked ? "Déjà lié" : noActiveTenant ? "ERP requis" : statusLabel}
                    </span>
                    <div className={`${styles.radioMark} ${isSelected ? styles.radioMarkSelected : ""}`}>
                      {isSelected && <div className={styles.radioDot} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={styles.emptyConnectors}>
            Aucun connecteur ERP disponible.<br />
            <span className={styles.emptyConnectorsHint}>Créez d'abord un connecteur dans Intégrations.</span>
          </div>
        )}

        {selectedConn && (
          <div>
            <label className={`${styles.label} ${styles.labelSpaced}`}>
              Rechercher tenant ERP par nom <span className={styles.required}>*</span>
            </label>
            <input
              value={erpTenantSearch}
              onChange={e => {
                const next = e.target.value;
                setErpTenantSearch(next);
                const exact = erpTenantOptions.find(t => (t.label || "").toLowerCase() === next.trim().toLowerCase() || t.id.toLowerCase() === next.trim().toLowerCase());
                setExternalId(exact ? exact.id : "");
              }}
              className={`input-field ${styles.searchInput}`}
              placeholder="Tapez le nom du tenant ERP, ex: whitecape ask"
            />
            {erpTenantOptions.length > 0 ? (
              <div className={styles.erpTenantList}>
                {filteredErpTenantOptions.map((t) => {
                  const selected = externalId === t.id;
                  const linkable = t.active !== false;
                  const alreadyLinked = isAlreadyLinked(selectedConnectorId, t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { if (!alreadyLinked) { setExternalId(t.id); setErpTenantSearch(t.label || t.id); } }}
                      disabled={alreadyLinked}
                      className={`${styles.erpTenantOption} ${alreadyLinked ? styles.erpTenantOptionLinked : selected ? (linkable ? styles.erpTenantOptionSelected : styles.erpTenantOptionWarning) : ""}`}
                    >
                      <span className={`${styles.statusDot} ${alreadyLinked ? styles.statusDotMuted : linkable ? styles.statusDotSuccess : styles.statusDotWarning}`} />
                      <span className={styles.erpTenantInfo}>
                        <span className={styles.erpTenantName}>{t.label}</span>
                        <span className={styles.erpTenantId}>ERP tenant ID: {t.id}</span>
                      </span>
                      <span className={`${styles.badge} ${alreadyLinked ? styles.badgeMuted : linkable ? styles.badgeSuccess : styles.badgeWarning}`}>
                        {alreadyLinked ? "Déjà lié" : linkable ? "Liable" : "ERP requis"}
                      </span>
                    </button>
                  );
                })}
                {filteredErpTenantOptions.length === 0 && (
                  <div className={styles.noResultsMessage}>
                    Aucun tenant ERP ne correspond à cette recherche. Essayez le nom affiché dans l'ERP ou son identifiant externe.
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.warningMessage}>
                Cet ERP n'a déclaré aucun tenant ID. Demandez à l'ERP d'ajouter le tenant dans sa liste avant de le lier.
              </div>
            )}
            {selectedConn && externalId && !canLinkSelectedTenant && (
              <div className={styles.selectedWarningMessage}>
                Ce tenant ERP n'est pas actif côté ERP. Demandez à l'ERP de l'activer avant de le lier à ce tenant AnomalyIQ.
              </div>
            )}
          </div>
        )}

        <div>
          <label className={`${styles.label} ${styles.labelCompact}`}>
            Tenant ERP sélectionné <span className={styles.required}>*</span>
          </label>
          <div className={styles.selectedTenantBox}>
            {selectedErpTenant ? (
              <>
                <span className={styles.selectedTenantName}>{selectedErpTenant.label}</span>
                <span className={`mono ${styles.selectedTenantId}`}>ID: {selectedErpTenant.id}</span>
              </>
            ) : (
              <span className={styles.selectedTenantPlaceholder}>{selectedConn ? "Recherchez puis choisissez un tenant ERP" : "Sélectionnez d'abord un ERP"}</span>
            )}
          </div>
        </div>

        <div>
          <label className={`${styles.label} ${styles.labelCompact}`}>
            Notes <span className={styles.optional}>(optionnel)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className={`input-field ${styles.notesInput}`}
            placeholder="Informations supplémentaires…"
          />
        </div>

        <div className={styles.inlineActions}>
          <button onClick={onCancel} className={`btn-ghost ${styles.inlineCancelButton}`}>Annuler</button>
          <button
            onClick={handleSave}
            disabled={!canLinkSelectedTenant || saving}
            className={`btn-primary ${styles.inlineSaveButton}`}
          >
            {saving ? <><Icon name="refresh" size={11} color="#fff" /> Connexion…</> : <><Icon name="integrations" size={11} color="#fff" /> Lier ce tenant</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ErpConnectionForm ────────────────────────────────────────────────────────────
export function ErpConnectionForm({ tenantId, onCancel, onDone }) {
  const [connectors, setConnectors] = useState([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminConnectors({ size: 100 })
      .then(res => setConnectors(res?.content || []))
      .catch((error) => logError("tenantErpConnection.formLoadConnectors", error));
  }, []);

  const handleSave = async () => {
    if (!selectedConnectorId || !externalId.trim()) return;
    setSaving(true);
    try {
      await createTenantConnection({
        tenantId,
        connectorId: selectedConnectorId,
        externalId: externalId.trim(),
      });
      onDone();
    } catch (e) {
      console.error("Failed to create ERP connection:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`card-solid fade-in ${styles.formCard}`}>
      <div className={styles.formHeader}>
        <h4 className={styles.formTitle}>Connecter un ERP</h4>
        <button onClick={onCancel} className={`btn-icon ${styles.formCloseButton}`}>
          <Icon name="x" size={14} color={COLORS.grey500} />
        </button>
      </div>
      <div className={styles.formBody}>
        <div>
          <label className={`${styles.label} ${styles.labelCompact}`}>
            Connecteur ERP <span className={styles.required}>*</span>
          </label>
          <select value={selectedConnectorId} onChange={e => setSelectedConnectorId(e.target.value)} className={`input-field ${styles.connectorSelect}`}>
            <option value="">Sélectionner un connecteur…</option>
            {connectors.filter(c => c.status === "ACTIVE" || c.status === "available").map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={`${styles.label} ${styles.labelCompact}`}>
            Identifiant externe (External ID) <span className={styles.required}>*</span>
          </label>
          <input value={externalId} onChange={e => setExternalId(e.target.value)} className={`input-field ${styles.externalIdInput}`} placeholder="ex: whitecape_sage" />
        </div>
        <div className={styles.formActions}>
          <button onClick={onCancel} className={`btn-ghost ${styles.formActionButton}`}>Annuler</button>
          <button onClick={handleSave} disabled={!selectedConnectorId || !externalId.trim() || saving} className={`btn-primary ${styles.formActionButton}`}>
            {saving ? "Connexion…" : "Connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Password generator ─────────────────────────────────────────────────────────
