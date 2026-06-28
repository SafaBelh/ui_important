import { useEffect, useState } from "react";
import { DangerZoneSection } from "@/shared/ui/DangerZoneSection";
import { Icon } from "@/shared/ui/Icon";
import { PageHeader } from "@/shared/ui/PageHeader";
import { COLORS } from "@/constants/colors";
import { useToast } from "@/contexts/toastContextValue";
import { getAdminConnectors } from "@/features/integrations/api/IntegrationAdminApi";
import { getTenantConnections } from "@/features/tenants/api/tenantsApi";
import { selectAlertsForTenant } from "@/features/alerts/model/alertSelectors";
import { selectPartnersForTenant } from "@/features/partners/model/partnerSelectors";
import { selectPipelinesForTenant } from "@/features/pipelines/model/pipelineSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { getTenantCredentials, updateTenantCredentials } from "@/features/tenants/model/tenantCredentials";
import { useSession } from "@/features/auth/model/useSession";
import { useAppSelector } from "@/store/hooks";
import { updatePipelineStore } from "@/features/pipelines/model/pipelineActions";
import { updateTenantStore } from "@/features/tenants/model/tenantActions";
import { logError } from "@/shared/utils/logError";
import styles from "./SettingsView.module.css";

const SETTINGS_DEFAULTS = {
  lightMode: true,
  compactMode: false,
  pipelineMode: "manual",
  alertChannel: "email",
  storageMode: "shared",
  authMode: "password",
  anomalyMinInvoices: 6,
  anomalyTolerancePct: 5,
};

const SETTINGS_OPTIONS = {
  storageModes: [["shared", "Shared"], ["isolated", "Isolated"]],
  authModes: [["password", "Mot de passe"], ["sso", "SSO"]],
  pipelineModes: [["manual", "Manuel"], ["auto", "Automatique"]],
  alertChannels: [["email", "Email"], ["webhook", "Webhook"], ["none", "Aucun"]],
};

const STATIC_DATA_REPORT = [];
const EMPTY_CONNECTORS = [];
const EMPTY_TENANT_CONNECTIONS = [];

const applyVars = (node, vars) => {
  if (!node) return;
  Object.entries(vars).forEach(([key, value]) => node.style.setProperty(key, value));
};

function Card({ children }) {
  return (
    <div className={styles.card}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, accent = COLORS.red }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeaderIcon} ref={(node) => applyVars(node, { "--accent-bg": `${accent}12` })}>
        <Icon name={icon} size={15} color={accent} />
      </div>
      <h2 className={styles.sectionHeaderTitle}>{title}</h2>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`${styles.toggle} ${value ? styles.toggleOn : styles.toggleOff}`}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

function Row({ label, description, right, last = false }) {
  return (
    <div className={`${styles.row} ${last ? styles.rowLast : ""}`}>
      <div className={styles.rowTextWrap}>
        <div className={styles.rowLabel}>{label}</div>
        {description && <div className={styles.rowDesc}>{description}</div>}
      </div>
      <div className={styles.rowRight}>{right}</div>
    </div>
  );
}

function Field({ label, value, mono = false, last = false }) {
  return (
    <div className={`${styles.field} ${last ? styles.fieldLast : ""}`}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldValue} ${mono ? styles.fieldValueMono : ""}`}>{value || "-"}</span>
    </div>
  );
}

function StatGrid({ items }) {
  return (
    <div className={styles.statGrid}>
      {items.map((item) => (
        <div key={item.label} className={styles.statGridItem}>
          <div className={styles.statGridValue}>{item.value}</div>
          <div className={styles.statGridLabel}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`input-field ${styles.select}`}>
      {options.map((option) => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
    </select>
  );
}

function stringifyDetail(value) {
  if (value === null || value === undefined) return "-";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return JSON.stringify(value, (key, item) => (typeof item === "function" ? `[Function ${item.name || "anonymous"}]` : item), 2);
}

function StaticDataReportTable({ table }) {
  return (
    <details className={styles.reportDetails}>
      <summary className={styles.reportSummary}>
        <div>
          <div className={styles.reportTableLabel}>{table.label}</div>
          <div className={styles.reportTableSection}>{table.section}</div>
        </div>
        <div className={styles.reportRowCount}>{table.rowCount.toLocaleString("fr-FR")} lignes</div>
        <div className={styles.reportDescription}>{table.description}</div>
      </summary>
      <div className={styles.reportBody}>
        <div className={styles.reportColumnTags}>
          {table.columns.map((column) => (
            <span key={column} className={styles.reportColumnTag}>{column}</span>
          ))}
        </div>
        <div className={styles.reportTableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr className={styles.reportTheadRow}>
                <th className={styles.reportThHash}>#</th>
                {table.columns.map((column) => (
                  <th key={column} className={styles.reportThMono}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${table.id}-${rowIndex}`} className={styles.reportTr}>
                  <td className={styles.reportTdIndex}>{rowIndex + 1}</td>
                  {table.columns.map((column) => (
                    <td key={column} className={styles.reportTdValue}>{stringifyDetail(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function SettingsView() {
  const { user, tenant, isEngineAdmin } = useSession();
  const toast = useToast();
  const tenants = useAppSelector(selectTenants);
  const hasTenantContext = !!tenant?.id;
  const isPlatformSettings = !!isEngineAdmin && !hasTenantContext;
  const isAdmin = isPlatformSettings;
  const [platformConnectors, setPlatformConnectors] = useState(EMPTY_CONNECTORS);
  const [platformConnections, setPlatformConnections] = useState(EMPTY_TENANT_CONNECTIONS);
  useEffect(() => {
    if (!isPlatformSettings) return;
    getAdminConnectors({ size: 200 })
      .then((res) => setPlatformConnectors(res?.content || []))
      .catch((error) => logError("settings.loadAdminConnectors", error));
    getTenantConnections()
      .then((res) => setPlatformConnections(Array.isArray(res) ? res : []))
      .catch((error) => logError("settings.loadTenantConnections", error));
  }, [isPlatformSettings]);
  const activeTenant = hasTenantContext ? tenants.find((item) => item.id === tenant.id) || tenant : null;
  const pipelines = useAppSelector((state) => selectPipelinesForTenant(state, activeTenant?.id));
  const alerts = useAppSelector((state) => selectAlertsForTenant(state, activeTenant?.id));
  const partners = useAppSelector((state) => selectPartnersForTenant(state, activeTenant?.id));
  const credentials = activeTenant ? getTenantCredentials(activeTenant.id, activeTenant) : null;
  const budgets = [];
  const settingsPipelines = pipelines;
  const settingsAlerts = alerts;
  const settingsBudgets = budgets;
  const connectorIds = new Set(platformConnections.map((item) => item.connectorId));

  const adminNav = [
    ["profil_admin", "key", "Profil plateforme"],
    ["tenants", "tenants", "Tenants & acces"],
    ["connecteurs", "integrations", "Connecteurs ERP"],
    ["pipelines", "pipelines", "Pipelines"],
    ["anomalies", "alerts", "Moteur anomalies"],
    ["budget", "fileText", "Budget"],
    ["notifs", "alerts", "Alertes"],
    ["donnees", "shield", "Donnees"],
    ["apparence", "eye", "Apparence"],
    ["danger", "shield", "Zone dangereuse"],
  ];
  const tenantNav = [
    ["profil_tenant", "key", "Profil tenant"],
    ["compte", "tenants", "Mon compte"],
    ["erp", "integrations", "Connexion ERP"],
    ["pipelines", "pipelines", "Pipelines"],
    ["anomalies", "alerts", "Anomalies"],
    ["budget", "fileText", "Budget"],
    ["notifs", "alerts", "Notifications"],
    ["donnees", "shield", "Donnees"],
    ["apparence", "eye", "Apparence"],
    ["danger", "shield", "Zone dangereuse"],
  ];
  const nav = isPlatformSettings ? adminNav : tenantNav;
  const defaultSection = isPlatformSettings ? "profil_admin" : "profil_tenant";
  const [activeSection, setActiveSection] = useState(defaultSection);
  const [lightMode, setLightMode] = useState(SETTINGS_DEFAULTS.lightMode);
  const [compactMode, setCompactMode] = useState(SETTINGS_DEFAULTS.compactMode);
  const [pipelineMode, setPipelineMode] = useState(SETTINGS_DEFAULTS.pipelineMode);
  const [alertChannel, setAlertChannel] = useState(SETTINGS_DEFAULTS.alertChannel);
  const [storageMode, setStorageMode] = useState(SETTINGS_DEFAULTS.storageMode);
  const [authMode, setAuthMode] = useState(SETTINGS_DEFAULTS.authMode);
  const [tenantForm, setTenantForm] = useState({ name: "", logo: "", color: "#3B82F6", storage: "shared" });
  const [accountForm, setAccountForm] = useState({ username: "", password: "" });

  useEffect(() => {
    setActiveSection(defaultSection);
  }, [defaultSection]);

  useEffect(() => {
    setTenantForm({
      name: activeTenant?.name || "",
      logo: activeTenant?.logo || "",
      color: activeTenant?.color || "#3B82F6",
      storage: activeTenant?.storage || "shared",
    });
    setAccountForm({
      username: credentials?.username || "",
      password: credentials?.password || "",
    });
  }, [
    activeTenant?.color,
    activeTenant?.id,
    activeTenant?.logo,
    activeTenant?.name,
    activeTenant?.storage,
    credentials?.password,
    credentials?.username,
  ]);

  const saveTenantProfile = () => {
    if (!activeTenant) return;
    updateTenantStore(activeTenant.id, tenantForm);
    toast("Profil tenant enregistre", "success");
  };

  const saveAccount = () => {
    if (!activeTenant) return;
    updateTenantCredentials(activeTenant.id, accountForm, activeTenant);
    updateTenantStore(activeTenant.id, { username: accountForm.username });
    toast("Compte mis a jour", "success");
  };

  if (!user) return null;

  const activePipelineCount = settingsPipelines.filter((p) => p.status === "actif" || p.status === "ACTIVE" || p.active).length;
  const unreadAlerts = settingsAlerts.filter((a) => a.status !== "READ" && a.status !== "RESOLVED").length;
  const localDataRowCount = STATIC_DATA_REPORT.reduce((sum, table) => sum + table.rowCount, 0);
  const localDataColumnCount = STATIC_DATA_REPORT.reduce((sum, table) => sum + table.columns.length, 0);

  const exportStaticDataReport = () => {
    const payload = stringifyDetail(STATIC_DATA_REPORT);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "static-data-report.json";
    link.click();
    URL.revokeObjectURL(url);
    toast("Rapport donnees locales exporte", "success");
  };

  const renderContent = () => {
    if (activeSection === "profil_admin") {
      return (
        <Card>
          <SectionHeader icon="key" title="Profil plateforme" />
          <StatGrid items={[
            { label: "Tenants", value: tenants.length.toLocaleString("fr-FR") },
            { label: "Connecteurs", value: platformConnectors.length.toLocaleString("fr-FR") },
            { label: "Liens ERP", value: platformConnections.length.toLocaleString("fr-FR") },
          ]} />
          <div className={styles.mt16}>
            <Field label="Utilisateur" value={user.name} />
            <Field label="Role" value={user.role} />
            <Field label="Mode" value="Backend reel" last />
          </div>
        </Card>
      );
    }

    if (activeSection === "profil_tenant") {
      return (
        <Card>
          <SectionHeader icon="key" title="Profil tenant" />
          <div className={styles.twoColGrid}>
            <div>
              <div className={styles.fieldHeading}>Nom</div>
              <input className="input-field" value={tenantForm.name} onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <div className={styles.fieldHeading}>Logo</div>
              <input className="input-field" value={tenantForm.logo} onChange={(e) => setTenantForm((f) => ({ ...f, logo: e.target.value.toUpperCase().slice(0, 4) }))} />
            </div>
            <div>
              <div className={styles.fieldHeading}>Couleur</div>
              <input type="color" value={tenantForm.color} onChange={(e) => setTenantForm((f) => ({ ...f, color: e.target.value }))} className={styles.colorInput} />
            </div>
            <div>
              <div className={styles.fieldHeading}>Mode DB</div>
              <Select value={tenantForm.storage} onChange={(storage) => setTenantForm((f) => ({ ...f, storage }))} options={[["shared", "Base partagee"], ["dedicated", "Base isolee"]]} />
            </div>
          </div>
          <Field label="Identifiant" value={activeTenant?.id} mono />
          <Row label="Apercu" right={<span className={styles.tenantPreview}><span className={styles.tenantPreviewBadge} ref={(node) => applyVars(node, { "--badge-color": tenantForm.color })}>{tenantForm.logo || "?"}</span>{tenantForm.name}</span>} />
          <button type="button" className={`btn-primary ${styles.btnMt12}`} onClick={saveTenantProfile}>Enregistrer</button>
        </Card>
      );
    }

    if (activeSection === "compte") {
      return (
        <Card>
          <SectionHeader icon="tenants" title="Mon compte" accent={COLORS.info} />
          <div className={styles.twoColGrid}>
            <div>
              <div className={styles.fieldHeading}>Nom d'utilisateur</div>
              <input className="input-field" value={accountForm.username} onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <div className={styles.fieldHeading}>Mot de passe</div>
              <input className="input-field" type="password" value={accountForm.password} onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <Field label="Role" value={user.role === "engine_admin" && activeTenant ? "tenant_admin" : user.role} last />
          <button type="button" className={`btn-primary ${styles.btnMt12}`} onClick={saveAccount}>Enregistrer</button>
        </Card>
      );
    }

    if (activeSection === "tenants") {
      return (
        <Card>
          <SectionHeader icon="tenants" title="Tenants & acces" accent={COLORS.info} />
          <Row label="Mode de stockage par defaut" description="Applique aux nouveaux tenants." right={<Select value={storageMode} onChange={setStorageMode} options={SETTINGS_OPTIONS.storageModes} />} />
          <div className={styles.mt14}>
            {tenants.map((item) => (
              <Field key={item.id} label={item.name} value={`${item.storage === "dedicated" ? "Base isolee" : "Base partagee"} · ${item.invoiceCount || 0} factures`} />
            ))}
          </div>
        </Card>
      );
    }

    if (activeSection === "connecteurs") {
      return (
        <Card>
          <SectionHeader icon="integrations" title="Connecteurs ERP" />
          <StatGrid items={[
            { label: "Connecteurs", value: platformConnectors.length.toLocaleString("fr-FR") },
            { label: "Connecteurs lies", value: connectorIds.size.toLocaleString("fr-FR") },
            { label: "Liens tenants", value: platformConnections.length.toLocaleString("fr-FR") },
          ]} />
          <div className={styles.mt16}>
            <Row label="Authentification par defaut" right={<Select value={authMode} onChange={setAuthMode} options={SETTINGS_OPTIONS.authModes} />} />
            {platformConnectors.slice(0, 6).map((connector) => (
              <Field key={connector.id} label={connector.name} value={connector.description || connector.connectorType || "ERP"} />
            ))}
          </div>
        </Card>
      );
    }

    if (activeSection === "erp") {
      return (
        <Card>
          <SectionHeader icon="integrations" title="Connexion ERP" />
          <Field label="Statut" value={partners.length ? "Connecte" : "Non connecte"} />
          <Field label="Connexions" value={String(partners.length)} />
          <Field label="Connecteur" value={partners[0]?.name || "Aucun"} />
          <Field label="ID ERP externe" value={partners[0]?.external_tenant_id || "-"} mono last />
        </Card>
      );
    }

    if (activeSection === "pipelines") {
      return (
        <Card>
          <SectionHeader icon="pipelines" title="Pipelines" />
          <StatGrid items={[
            { label: "Pipelines", value: settingsPipelines.length.toLocaleString("fr-FR") },
            { label: "Actifs", value: activePipelineCount.toLocaleString("fr-FR") },
            { label: "Mode par defaut", value: pipelineMode === "automated" ? "Auto" : "Manuel" },
          ]} />
          <div className={styles.mt16}>
            <Row label="Mode d'execution par defaut" right={<Select value={pipelineMode} onChange={setPipelineMode} options={SETTINGS_OPTIONS.pipelineModes} />} />
            {settingsPipelines.map((pipeline) => (
              <Row
                key={pipeline.id}
                label={pipeline.name}
                description={`${pipeline.connector || "ERP"} · ${pipeline.status || "actif"}`}
                right={<Toggle value={pipeline.status === "actif" || pipeline.status === "ACTIVE" || pipeline.active} onChange={(next) => { updatePipelineStore(pipeline.id, { status: next ? "actif" : "paused" }); toast(next ? "Pipeline active" : "Pipeline mis en pause", "info"); }} />}
              />
            ))}
          </div>
        </Card>
      );
    }

    if (activeSection === "anomalies") {
      return (
        <Card>
          <SectionHeader icon="alerts" title={isAdmin ? "Moteur anomalies" : "Anomalies"} />
          <Row label="Minimum de factures" description="Nombre minimum requis pour analyser une serie." right={<span className={styles.inlineValue}>{SETTINGS_DEFAULTS.anomalyMinInvoices} fact.</span>} />
          <Row label="Tolerance d'ecart" description="Marge avant signalement d'une anomalie." right={<span className={styles.inlineValue}>{SETTINGS_DEFAULTS.anomalyTolerancePct}%</span>} />
          <Row label="Types affiches" description="Montant inhabituel, frequence inhabituelle, doublon, ecart habituel." right={<span className={styles.inlineHint}>Moteur</span>} last />
        </Card>
      );
    }

    if (activeSection === "budget") {
      return (
        <Card>
          <SectionHeader icon="fileText" title="Budget" accent={COLORS.purple} />
          <StatGrid items={[
            { label: "Exercice", value: String(new Date().getFullYear()) },
            { label: "Lignes budget", value: settingsBudgets.length.toLocaleString("fr-FR") },
            { label: "Saisonnalite", value: "Auto" },
          ]} />
          <div className={styles.mt16}>
            <Row label="Alertes budget" description="Déduites automatiquement par série selon le rythme, la saisonnalité et la projection moteur." right={<span className={styles.inlineHint}>Moteur</span>} last />
          </div>
        </Card>
      );
    }

    if (activeSection === "notifs") {
      return (
        <Card>
          <SectionHeader icon="alerts" title={isAdmin ? "Alertes" : "Notifications"} />
          <StatGrid items={[
            { label: "Alertes", value: settingsAlerts.length.toLocaleString("fr-FR") },
            { label: "Non lues", value: unreadAlerts.toLocaleString("fr-FR") },
            { label: "Canal", value: alertChannel === "inapp" ? "In-app" : alertChannel },
          ]} />
          <div className={styles.mt16}>
            <Row label="Canal principal" right={<Select value={alertChannel} onChange={setAlertChannel} options={SETTINGS_OPTIONS.alertChannels} />} />
            <Row label="Marquer tout lu" description="Action locale en attente de raccord backend." right={<button type="button" className="btn-ghost" onClick={() => toast("Toutes les alertes marquees comme lues", "success")}>Marquer tout lu</button>} last />
          </div>
        </Card>
      );
    }

    if (activeSection === "donnees") {
      return (
        <Card>
          <SectionHeader icon="shield" title="Donnees" />
          <StatGrid items={[
            { label: "Tables locales", value: STATIC_DATA_REPORT.length.toLocaleString("fr-FR") },
            { label: "Lignes detaillees", value: localDataRowCount.toLocaleString("fr-FR") },
            { label: "Colonnes exposees", value: localDataColumnCount.toLocaleString("fr-FR") },
          ]} />
          <div className={styles.twoColGridMt}>
            <div className={styles.dataSourceBox}>
              <Field label="Source" value="Backend" mono />
              <Field label="Tenants" value={tenants.length.toLocaleString("fr-FR")} />
              <Field label="Connecteurs" value={platformConnectors.length.toLocaleString("fr-FR")} />
              <Field label={isPlatformSettings ? "Budgets" : "Budgets tenant"} value={settingsBudgets.length.toLocaleString("fr-FR")} last />
            </div>
            <div className={styles.dataReportBox}>
              <div>
                <div className={styles.dataReportTitle}>Rapport donnees locales</div>
                <div className={styles.dataReportDesc}>Aucune table de demonstration locale n'est exposee.</div>
              </div>
              <button type="button" className={`btn-primary ${styles.exportBtn}`} onClick={exportStaticDataReport}>Exporter JSON</button>
            </div>
          </div>
          <div className={styles.reportList}>
            {STATIC_DATA_REPORT.map((table) => <StaticDataReportTable key={table.id} table={table} />)}
          </div>
        </Card>
      );
    }

    if (activeSection === "apparence") {
      return (
        <Card>
          <SectionHeader icon="eye" title="Apparence" />
          <Row label="Theme clair" description="Preference locale de demonstration." right={<Toggle value={lightMode} onChange={setLightMode} />} />
          <Row label="Cartes compactes" description="Reduit visuellement l'espacement." right={<Toggle value={compactMode} onChange={setCompactMode} />} last />
        </Card>
      );
    }

    if (activeSection === "danger") {
      return <DangerZoneSection pipelines={pipelines} tenant={activeTenant} isAdmin={isAdmin} toast={toast} />;
    }

    return null;
  };

  return (
    <div className={`fade-up ${styles.root}`}>
      <PageHeader
        eyebrow={isPlatformSettings ? "Configuration" : "Mon espace"}
        title="Parametres"
        subtitle={isPlatformSettings ? "Profil · tenants · pipelines · audit · securite" : "Profil · compte · pipelines · anomalies · budget"}
      />
      <div className={styles.grid}>
        <div className={`glass-card ${styles.sidebar}`}>
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`${styles.navBtn} ${activeSection === id ? styles.navBtnActive : ""} ${id === "danger" ? styles.navBtnDanger : ""}`}
            >
              <Icon name={icon} size={14} color={activeSection === id ? "#fff" : id === "danger" ? COLORS.red : COLORS.grey500} />
              {label}
            </button>
          ))}
        </div>
        <div key={activeSection} className={styles.contentPane}>{renderContent()}</div>
      </div>
    </div>
  );
}
