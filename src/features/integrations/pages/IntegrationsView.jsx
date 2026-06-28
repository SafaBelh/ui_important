

import { useState, useEffect, useRef } from "react";
import {
  Plus, X, Tag, Plug, Network, Settings2, Calculator, Sparkles, CheckCircle2,
  ArrowLeft, ArrowRight, Database, GitBranch, ScanLine, ClipboardCheck,
  RefreshCw, Download, FlaskConical, TrendingUp, ChevronRight, ChevronDown,
  AlertCircle, Search, Link2, Maximize2, Minimize2, PanelRightClose, PanelRightOpen,
  Cpu, Layers, BarChart3, Eye, EyeOff, Zap, Filter, Table2, GripVertical, Hash,
  Bot, MessageSquare, FileJson, Send, ChevronUp, Code2, RotateCcw, Wand2,
  Info, Check, ChevronLeft, Copy, Users, Globe, Upload, FileText, AlertTriangle,
  FileBarChart, Activity, Clock, CheckSquare, XCircle, Loader2, Play, ArrowUpRight
} from "lucide-react";
import {
  CONNECTOR_CONFIG,
  AUTH_FIELDS,
  PIPELINE_DEFS,
  GENERIC_SCHEMA,
  TABLE_PALETTE,
  BUDGET_PRESETS,
  ERD_OFFSETS,
  CUSTOM_PIPELINE_COLORS,
  WIZARD_STEPS,
  CARD_W,
  MAX_COLS,
  PAD,
  CSV_SOURCE_PRESETS,
  DEFAULT_API_RESOURCE,
  TENANT_IDS_PLACEHOLDER,
  INTEGRATION_CATEGORIES,
  INTEGRATION_CONNECTION_TYPES,
  INTEGRATION_JOIN_TYPES,
  INTEGRATION_REPORT_FALLBACK_TENANTS,
  JSON_IMPORT_TEMPLATE,
  TENANT_JSON_IMPORT_TEMPLATE,
  VISUAL_JOIN_PALETTE,
} from "@/constants/integrationWizard";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { PageHeader } from "@/shared/ui/PageHeader";
import { useToast } from "@/contexts/toastContextValue";
import { createAdminConnector, getAdminConnectors, updateAdminConnector } from "@/features/integrations/api/IntegrationAdminApi";
import { activateTenantConnection, getTenantConnections } from "@/features/tenants/api/tenantsApi";
import {
  CONNECTOR_TEMPLATE,
} from "@/features/integrations/utils/connectorImport";
import {
  publishErpConnectorsForWidgets,
  normalizeConnectorFromApi,
  toConnectorApiPayload,
} from "@/features/integrations/api/connectorApi";
import {
  preparePipelineTemplates,
  QA_FLOW,
  QA_SIDEBAR_STEPS,
} from "@/features/integrations/utils/wizardHelpers";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { Toggle, InfoBox, SectionAccordion, VisualJoinBuilder } from "@/features/integrations/components/WizardUiPrimitives";
import { BudgetStep } from "@/features/integrations/components/BudgetStep";
import { PipelinesStep } from "@/features/integrations/components/PipelinesStep";
import { TenantsStep } from "@/features/integrations/components/TenantsStep";
import { AssistantMiniChat, AssistantFullscreen, AssistantBubble } from "@/features/integrations/components/IntegrationAssistant";
import { ExplorationStep, IdentityStep, ConnectionStep, DataPreviewStep, SummaryStep } from "@/features/integrations/components/WizardSteps";
import { ERPReportModal } from "@/features/integrations/components/ERPReportModal";
import { ConnectorWizardModal } from "@/features/integrations/components/ConnectorWizardModal";
import "./IntegrationsRuntime.css";
import styles from "./IntegrationsView.module.css";








/* ─── INTEGRATION CARD ──────────────────────────────────────── */
function IntegrationCard({ integration, onEdit, onReport, onDisconnect, isAdmin }) {
  const [confirmDis, setConfirmDis] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef(null);

  const statusMap = {
    connected: { label: "Connecté", dot: "#86efac", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    available: { label: "Disponible", dot: "#93c5fd", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    coming_soon: { label: "Bientôt", dot: "#e5e7eb", bg: "#f9fafb", color: "#9ca3af", border: "#e5e7eb" },
  };
  const status = statusMap[integration.status] || statusMap.coming_soon;

  useEffect(() => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--integration-logo-bg", integration.color || "#6b7280");
    cardRef.current.style.setProperty("--integration-status-bg", status.border);
    cardRef.current.style.setProperty("--integration-status-color", status.color);
  }, [integration.color, status.border, status.color]);

  const cardClasses = [
    styles.integrationCard,
    integration.status === "connected" ? styles.integrationCardConnected : styles.integrationCardDefault,
    hovered ? styles.integrationCardHovered : "",
    integration.status === "coming_soon" ? styles.integrationCardDisabled : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={cardRef}
      className={cardClasses}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.statusRibbonWrap}>
        <div className={styles.statusRibbon}>
          {status.label}
        </div>
      </div>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardLogo}>
            {integration.logo || integration.name.slice(0, 2)}
          </div>
          <div className={styles.cardText}>
            <div className={styles.cardTitle}>{integration.name}</div>
            <div className={styles.cardDescription}>{integration.description}</div>
          </div>
        </div>
      </div>

      <div className={styles.cardBadges}>
        {integration.authType && <span className={styles.cardBadge}>{integration.authType}</span>}
        {integration.category && <span className={styles.cardBadge}>{integration.category}</span>}
      </div>

      <div className={styles.cardDivider} />

      {isAdmin && (
        <div className={styles.cardActions}>
          {integration.status === "connected" && !confirmDis && (
            <>
              <button onClick={onEdit} className={styles.cardAction}>
                <Settings2 size={13} /> Configurer
              </button>
              <div className={styles.cardActionDivider} />
              <button onClick={onReport} className={styles.cardAction}>
                <FileBarChart size={13} /> Rapport
              </button>
              <div className={styles.cardActionDivider} />
              <button onClick={() => setConfirmDis(true)} className={`${styles.cardAction} ${styles.cardActionDanger}`}>
                <Zap size={13} /> Déconnecter
              </button>
            </>
          )}
          {integration.status === "connected" && confirmDis && (
            <div className={styles.confirmDisconnect}>
              <span className={styles.confirmText}>Confirmer ?</span>
              <button onClick={onDisconnect} className={styles.confirmYes}>Oui</button>
              <button onClick={() => setConfirmDis(false)} className={styles.confirmNo}>Non</button>
            </div>
          )}
          {integration.status === "available" && (
            <button onClick={onEdit} className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
              <Plus size={13} /> Connecter
            </button>
          )}
          {integration.status === "coming_soon" && (
            <div className={styles.comingSoonAction}>
              <Zap size={13} /> Bientôt disponible
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── MAIN VIEW ─────────────────────────────────────────────── */

export function IntegrationsView() {
  const toast = useToast();
  const platformTenantIds = useAppSelector(selectTenants).map((tenant) => tenant.id).filter(Boolean);
  const [connectors, setConnectors] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [modal, setModal] = useState(null);
  const [reportConnector, setReportConnector] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState(null);
  const [miniOpen, setMiniOpen] = useState(false);
  const [assistantHasData, setAssistantHasData] = useState(false);

  const CATS = INTEGRATION_CATEGORIES;

  const filtered = connectors.filter(c => {
    if (category !== "all" && c.category !== category) return false;
    if (search && !`${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const connected = connectors.filter(c => c.status === "connected");

  useEffect(() => {
    publishErpConnectorsForWidgets(connectors);
  }, [connectors]);

  useEffect(() => {
    getAdminConnectors({ size: 200 })
      .then(res => setConnectors((res?.content || []).map(normalizeConnectorFromApi)))
      .catch(err => toast(err.message || "Impossible de charger les connecteurs", "error"));
  }, [toast]);

  // Persist without closing the wizard (used by the Tenants step so the user
  // can save then deploy pipelines in the same session).
  const persistConnector = async d => {
    const pipelines = preparePipelineTemplates(d.pipelines || CONNECTOR_CONFIG.step7_templates);
    const saved = { ...d, pipelines, pipelineTemplates: pipelines, pipelineTemplatesJson: JSON.stringify(pipelines) };
    const payload = toConnectorApiPayload(saved);
    const response = saved.id
      ? await updateAdminConnector(saved.id, payload)
      : await createAdminConnector(payload);
    const normalized = normalizeConnectorFromApi(response);
    setConnectors(prev => saved.id
      ? prev.map(c => c.id === saved.id ? normalized : c)
      : [normalized, ...prev]);
    toast("Connecteur sauvegardé", "success");
    return normalized;
  };

  const handleSave = async d => {
    try {
      await persistConnector(d);
      setModal(null);
    } catch (err) {
      toast(err.message || "Erreur lors de la sauvegarde du connecteur", "error");
    }
  };

  const handleDisconnect = id => setConnectors(prev => prev.map(c => c.id === id ? { ...c, status: "available" } : c));

  const handleAssistantAutofill = (d) => { setAssistantHasData(true); setModal(d); };

  const handleSyncTemplates = async (integration) => {
    // Persist the latest wizard config FIRST so activation reads fresh templates
    // (schedule/polling, mappings, joins) from the DB — otherwise schedule edits
    // are lost. Activation is idempotent backend-side, so this no longer duplicates
    // facture/commande pipelines on each click.
    const saved = await persistConnector(integration);
    const connectorId = saved?.id || integration.id;
    const linkedTenants = await getTenantConnections({ connectorId });

    if (linkedTenants.length === 0) {
      alert("Aucun tenant actif lié à cet ERP.");
      return;
    }

    let accepted = 0;
    for (const tc of linkedTenants.filter(x => x.active !== false)) {
      await activateTenantConnection(tc.id);
      accepted += 1;
    }
    alert(`Synchronisation lancée : ${accepted} job(s) d'activation créé(s).`);
  };

  return (
    <>
      <div className={`root fade-up ${styles.pageRoot}`}>
        <PageHeader
          eyebrow="Connecteurs"
          title="Intégrations ERP"
          subtitle={`${connected.length} connectée${connected.length > 1 ? "s" : ""} · ${connectors.length} disponibles`}
          actions={(
            <>
              <div className={styles.searchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input value={search} onChange={e => setSearch(e.target.value)} className={`input ${styles.searchInput}`} placeholder="Rechercher…" />
              </div>
              <button onClick={() => setModal({})} className="btn btn-primary"><Plus size={13} /> Nouveau connecteur</button>
            </>
          )}
        />

        {/* Category filter */}
        <div className={styles.categoryFilter}>
          {CATS.map(cat => {
            const count = connectors.filter(c => cat.id === "all" || c.category === cat.id).length;
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)} className={`${styles.categoryButton} ${category === cat.id ? styles.categoryButtonActive : ""}`}>
                {cat.label} <span className={styles.categoryCount}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Connected section */}
        {connected.length > 0 && category === "all" && (
          <div>
            <p className={styles.connectedHeading}>
              <CheckCircle2 size={11} /> Connectés ({connected.length})
            </p>
            <div className={styles.integrationsGrid}>
              {connected.filter(c => !search || `${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())).map(c => (
                <IntegrationCard key={c.id} integration={c} isAdmin={true} onEdit={() => setModal(c)} onReport={() => setReportConnector(c)} onDisconnect={() => handleDisconnect(c.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Available / filtered section */}
        {category !== "all" || (search && filtered.length === 0) ? (
          filtered.length > 0
            ? <div className={styles.integrationsGrid}>
              {filtered.map(c => <IntegrationCard key={c.id} integration={c} isAdmin={true} onEdit={() => setModal(c)} onReport={() => setReportConnector(c)} onDisconnect={() => handleDisconnect(c.id)} />)}
            </div>
            : (
              <div className={styles.emptyStateCompact}>
                <Plug size={32} color={INTEGRATION_COLORS.g300} />Aucune intégration trouvée
              </div>
            )
        ) : (
          filtered.filter(c => c.status !== "connected").length === 0 ? (
            !search && connected.length === 0 && (
              <div className={styles.emptyState}>
                <Plug size={34} color={INTEGRATION_COLORS.g300} />
                <div className={styles.emptyStateTitle}>Aucune intégration</div>
                <div>Aucun connecteur n'est configuré pour le moment.</div>
              </div>
            )
          ) : (
            <div className={styles.integrationsGrid}>
              {filtered.filter(c => c.status !== "connected").map(c => (
                <IntegrationCard key={c.id} integration={c} isAdmin={true} onEdit={() => setModal(c)} onReport={() => setReportConnector(c)} onDisconnect={() => handleDisconnect(c.id)} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Wizard modal */}
      {modal !== null && (
        <ConnectorWizardModal
          open={true}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onSyncTemplates={handleSyncTemplates}
          onPersist={persistConnector}
          onDelete={modal.id ? () => { setConnectors(prev => prev.filter(c => c.id !== modal.id)); setModal(null); } : null}
        />
      )}

      {reportConnector && (
        <ERPReportModal
          integration={reportConnector}
          onClose={() => setReportConnector(null)}
        />
      )}

      {/* Floating assistant bubble → opens the compact mini chat (NOT fullscreen) */}
      <AssistantBubble onOpen={() => setMiniOpen(o => !o)} hasData={assistantHasData} />

      {miniOpen && (
        <AssistantMiniChat
          onClose={() => setMiniOpen(false)}
          onAutofill={handleAssistantAutofill}
          onOpenFullscreen={(mode) => { setMiniOpen(false); setAssistantMode(mode || null); setAssistantOpen(true); }}
          knownPlatformTenantIds={platformTenantIds}
        />
      )}

      {/* Fullscreen assistant (Q&A / form) — only on explicit request */}
      {assistantOpen && (
        <AssistantFullscreen
          onClose={() => { setAssistantOpen(false); setAssistantMode(null); }}
          onAutofill={handleAssistantAutofill}
          rawSchema={null}
          initialMode={assistantMode}
          onMinimize={() => { setAssistantOpen(false); setAssistantMode(null); setMiniOpen(true); }}
        />
      )}
    </>
  );
}

export default IntegrationsView;
