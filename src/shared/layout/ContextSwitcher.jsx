import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectPartnersByTenantId, selectPartnersForTenant } from "@/features/partners/model/partnerSelectors";
import { selectActivePartnerId, selectEnrichedTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { setActivePartner, setActiveTenant } from "@/shared/model/sessionActions";
import { Icon } from "@/shared/ui/Icon";
import styles from "./ContextSwitcher.module.css";

function EntityMark({ entity, size = 32, radius = 8, fontSize = 11 }) {
  const setColor = (node) => {
    if (node) node.style.setProperty("--entity-color", entity?.color || COLORS.grey700);
  };
  const sizeClass = size === 22 ? styles.markSmall : size === 24 ? styles.markMedium : styles.markDefault;
  const radiusClass = radius === 5 ? styles.markRadiusSmall : radius === 6 ? styles.markRadiusMedium : styles.markRadiusDefault;
  const fontClass = fontSize === 9 ? styles.markFontSmall : styles.markFontDefault;

  return (
    <div ref={setColor} className={`${styles.entityMark} ${sizeClass} ${radiusClass} ${fontClass}`}>
      {entity?.logo ? entity.logo : (entity?.name?.slice(0, 2).toUpperCase() || "?")}
    </div>
  );
}

function GlobalMark({ size = 32, radius = 8, iconSize = 16 }) {
  const sizeClass = size === 22 ? styles.markSmall : styles.markDefault;
  const radiusClass = radius === 5 ? styles.markRadiusSmall : styles.markRadiusDefault;

  return (
    <div className={`${styles.globalMark} ${sizeClass} ${radiusClass}`}>
      <Globe size={iconSize} color="#fff" strokeWidth={2} />
    </div>
  );
}

function SwitcherRow({ children, active, indent = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${styles.switcherRow} ${indent ? styles.switcherRowIndented : ""} ${active ? styles.switcherRowActive : ""}`}
    >
      {children}
    </button>
  );
}

function RowText({ title, subtitle, titleSize = 12 }) {
  return (
    <div className={styles.rowText}>
      <div className={`${styles.rowTitle} ${titleSize === 11 ? styles.rowTitleSmall : ""}`}>{title}</div>
      {subtitle && <div className={styles.rowSubtitle}>{subtitle}</div>}
    </div>
  );
}

export function ContextSwitcher() {
  const { tenant, partner, isSSO, isEngineAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const parentTenantId = tenant?.parentId || tenant?.id;
  const partners = useAppSelector((state) => selectPartnersForTenant(state, parentTenantId));
  const partnersByTenantId = useAppSelector(selectPartnersByTenantId);
  const tenants = useAppSelector(selectEnrichedTenants);
  const activePartnerId = useAppSelector(selectActivePartnerId);
  const activeEntity = partner || tenant || null;
  const activeEntityColor = activeEntity?.color || COLORS.red;
  const hasChoices = isEngineAdmin ? tenants.length > 0 : partners.length > 0;
  const setTriggerColors = (node) => {
    if (!node) return;
    node.style.setProperty("--trigger-bg", activeEntity ? `${activeEntityColor}0F` : "rgba(217,79,61,.07)");
    node.style.setProperty("--trigger-border", activeEntity ? `${activeEntityColor}26` : "rgba(217,79,61,.16)");
  };

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (isSSO || !hasChoices) return null;

  const selectGlobalContext = () => {
    if (isEngineAdmin) {
      setActiveTenant(null);
    } else if (parentTenantId) {
      setActiveTenant(parentTenantId);
    }
    setActivePartner(null);
    setOpen(false);
  };

  const selectTenant = (tenantId) => {
    setActiveTenant(tenantId);
    setActivePartner(null);
    setOpen(false);
  };

  const selectPartner = (tenantId, partnerId) => {
    if (tenantId) setActiveTenant(tenantId);
    setActivePartner(partnerId);
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={ref}>
      <button
        onClick={() => setOpen((current) => !current)}
        ref={setTriggerColors}
        className={styles.trigger}
      >
        {activeEntity ? (
          <EntityMark entity={activeEntity} size={22} radius={5} fontSize={9} />
        ) : (
          <GlobalMark size={22} radius={5} iconSize={12} />
        )}
        <div className={styles.triggerText}>
          <div className={styles.triggerTitle}>
            {activeEntity ? activeEntity.name : isEngineAdmin ? "Vue globale" : "Tous les partenaires"}
          </div>
          <div className={styles.triggerSubtitle}>
            {activeEntity ? (partner ? `Partenaire (${tenant?.name})` : "Locataire") : "Administrateur"}
          </div>
        </div>
        <ChevronDown size={14} color={COLORS.grey500} />
      </button>

      {open && (
        <div
          className={`${styles.dropdown} scale-in`}
        >
          <div className={styles.dropdownHeader}>
            <Icon name="tenants" size={12} color={COLORS.grey400} />
            Contexte
          </div>
          <div className={styles.dropdownContent}>
            <SwitcherRow active={!activePartnerId} onClick={selectGlobalContext}>
              <GlobalMark />
              <RowText title="Tous les partenaires" subtitle="Vue globale administrateur" />
              {!activePartnerId && <Icon name="check" size={14} color={COLORS.red} />}
            </SwitcherRow>

            {isEngineAdmin ? (
              tenants.map((tenantItem) => (
                <div key={tenantItem.id}>
                  <SwitcherRow active={tenant?.id === tenantItem.id && !activePartnerId} onClick={() => selectTenant(tenantItem.id)}>
                    <EntityMark entity={tenantItem} />
                    <RowText title={tenantItem.name} subtitle={`Tenant ID: ${tenantItem.id}`} />
                    {tenant?.id === tenantItem.id && !activePartnerId && <Icon name="check" size={14} color={COLORS.red} />}
                  </SwitcherRow>
                  {(partnersByTenantId[tenantItem.id] || []).map((partnerItem) => (
                    <SwitcherRow key={partnerItem.id} active={activePartnerId === partnerItem.id} indent onClick={() => selectPartner(tenantItem.id, partnerItem.id)}>
                      <EntityMark entity={partnerItem} size={24} radius={6} fontSize={9} />
                      <RowText title={partnerItem.name} titleSize={11} />
                      {activePartnerId === partnerItem.id && <Icon name="check" size={14} color={COLORS.red} />}
                    </SwitcherRow>
                  ))}
                </div>
              ))
            ) : (
              partners.map((partnerItem) => (
                <SwitcherRow key={partnerItem.id} active={activePartnerId === partnerItem.id} onClick={() => selectPartner(parentTenantId, partnerItem.id)}>
                  <EntityMark entity={partnerItem} />
                  <RowText title={partnerItem.name} subtitle={`ID Externe: ${partnerItem.external_tenant_id}`} />
                  {activePartnerId === partnerItem.id && <Icon name="check" size={14} color={COLORS.red} />}
                </SwitcherRow>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
