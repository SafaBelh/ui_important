/**
 * Connector wizard shell: the step navigation, validation gating, and save/deploy flow
 * that mounts each wizard step (Identity, Connection, Exploration, Pipelines, Budget,
 * Tenants, DataPreview, Summary) and the ERP report. Extracted from IntegrationsView.
 */
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileBarChart, Maximize2, Minimize2, Plug, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import { WIZARD_STEPS, buildApiSchema, buildCsvSchema, inferSchemaRelations } from "@/constants/integrationWizard";
import { useToast } from "@/contexts/toastContextValue";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { toConnectorApiPayload } from "@/features/integrations/api/connectorApi";
import { discoverConnectorSchema, getConnectorSchema, previewConnectorConnection } from "@/features/integrations/api/IntegrationAdminApi";
import { BudgetStep } from "@/features/integrations/components/BudgetStep";
import { PipelinesStep } from "@/features/integrations/components/PipelinesStep";
import { getPipelineGroupByErrors } from "@/features/integrations/model/PipelineValidation";
import { TenantsStep } from "@/features/integrations/components/TenantsStep";
import { ExplorationStep, IdentityStep, ConnectionStep, DataPreviewStep, SummaryStep } from "@/features/integrations/components/WizardSteps";
import { ERPReportModal } from "@/features/integrations/components/ERPReportModal";
import styles from "./ConnectorWizardModal.module.css";

const progressClassByStep = [
  styles.progress13,
  styles.progress25,
  styles.progress38,
  styles.progress50,
  styles.progress63,
  styles.progress75,
  styles.progress88,
  styles.progress100,
];

export function ConnectorWizardModal({ open, initialData = {}, onClose, onSave, onDelete, onSyncTemplates, onPersist }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [savedPipelineSnapshot, setSavedPipelineSnapshot] = useState(null);
  const [showReport, setShowReport] = useState(false);
  // Seed the schema preview from an assistant JSON import so the Exploration /
  // Pipelines / Budget steps render their column pickers immediately (the user
  // can still « Tester la connexion » to refresh it from the live database).
  const [discoveredSchema, setDiscoveredSchema] = useState(initialData?.__importedSchema || null);
  const fromJsonImport = initialData?.__importSource === "assistant-json-import";

  const [data, setData] = useState({
    name: "", connectorType: "ERP", authType: "NONE", description: "", color: "#D94F3D", logo: "",
    jdbcUrl: "", jdbcUsername: "", jdbcPassword: "", jdbcDriverClassName: "org.postgresql.Driver",
    apiEndpoint: "", apiAuthToken: "", apiResources: [], csvFiles: [], connectionType: "jdbc",
    selectedTables: [], pipelines: {}, tableRoles: {}, customPipelines: [],
    budgetSourceTables: [], budgetAmountCols: [],
    budgetFormula: [], budgetPreset: null, budgetAgg: "SUM",
    budgetTemplate: null,
    widgetConfig: null,
    tenants: [], generatedData: {},
    ...initialData,
  });

  const isEditing = !!initialData?.id;

  const makeIdentitySnap = (d) => JSON.stringify({ name: d.name, color: d.color, description: d.description, logo: d.logo, authType: d.authType });
  const makePipelineSnap = (d) => JSON.stringify({ pipelines: d.pipelines, customPipelines: d.customPipelines, selectedTables: d.selectedTables });
  const [initialIdentitySnap] = useState(() => makeIdentitySnap(initialData));
  const [initialPipeSnap] = useState(() => makePipelineSnap(initialData));

  const hasUnsavedIdentity = isEditing && makeIdentitySnap(data) !== (savedSnapshot || initialIdentitySnap);
  const hasUnsavedPipeline = isEditing && makePipelineSnap(data) !== (savedPipelineSnapshot || initialPipeSnap);

  const openReport = () => {
    if (hasUnsavedIdentity || hasUnsavedPipeline) {
      toast("Sauvegardez ou synchronisez les changements avant d'ouvrir le rapport.", "warning");
      return;
    }
    setShowReport(true);
  };

  const ensurePipelineGroupBy = () => {
    const errors = getPipelineGroupByErrors(data);
    if (errors.length === 0) return true;
    const unmapped = errors.find(e => e.type === "unmapped");
    toast(unmapped
      ? `Le champ de regroupement « ${unmapped.fields[0]} » (${unmapped.label}) doit être mappé à une colonne source.`
      : `Sélectionnez au moins un champ de regroupement pour: ${errors.map(e => e.label).join(", ")}.`, "error");
    setStep(4);
    return false;
  };

  const goToStep = (nextStep) => {
    if (step === 4 && nextStep > 4 && !ensurePipelineGroupBy()) return;
    setStep(nextStep);
  };

  const saveConnector = () => {
    if (!ensurePipelineGroupBy()) return;
    onSave(data);
  };

  // Save in place (wizard stays open) and propagate the new connector id so
  // the Tenants step can deploy right after the first save.
  const persistAndKeepOpen = async () => {
    if (!ensurePipelineGroupBy()) return null;
    const saved = await onPersist?.(data);
    if (saved?.id && !data.id) setData(prev => ({ ...prev, id: saved.id }));
    return saved;
  };

  // B2: save (create or update) from ANY wizard step — no need to walk to the
  // last step. Does NOT force the groupBy gate (that blocks at deploy time), so a
  // draft can be persisted early; refreshes the change snapshots so the header
  // "unsaved" buttons clear.
  const [savingInPlace, setSavingInPlace] = useState(false);
  const saveInPlace = async () => {
    if (savingInPlace) return;
    setSavingInPlace(true);
    try {
      const saved = await onPersist?.(data);
      if (saved?.id && !data.id) setData(prev => ({ ...prev, id: saved.id }));
      setSavedSnapshot(makeIdentitySnap(data));
      setSavedPipelineSnapshot(makePipelineSnap(data));
      toast("Connecteur enregistré", "success");
    } catch (e) {
      toast(e.message || "Sauvegarde impossible", "error");
    } finally {
      setSavingInPlace(false);
    }
  };

  const syncTemplates = () => {
    if (!ensurePipelineGroupBy()) return;
    onSyncTemplates?.(data);
    setSavedPipelineSnapshot(makePipelineSnap(data));
  };

  const testConnection = async () => {
    const payload = toConnectorApiPayload(data);
    return previewConnectorConnection(data.id, payload);
  };

  const discoverSchema = async () => {
    const payload = toConnectorApiPayload(data);
    const res = data.id
      ? await getConnectorSchema(data.id)
      : await discoverConnectorSchema(payload);
    if (res?.status === "ok") {
      const tables = res.tables || [];
      const schema = { tables, rels: inferSchemaRelations(tables, res.rels || []) };
      setDiscoveredSchema(schema);
      // Persist the discovered FK relations on the connector so the backend can
      // self-heal a pipeline's JOIN graph (derive missing joins) at deploy time.
      setData(prev => ({
        ...prev,
        schemaRels: schema.rels || [],
        selectedTables: prev.selectedTables?.length ? prev.selectedTables : schema.tables.map(t => t.name),
      }));
      return schema;
    }
    throw new Error(res?.message || "Impossible de découvrir le schéma");
  };

  const connId = data.jdbcUrl?.includes("sap") ? "c1"
    : (data.jdbcUrl?.includes("sage") || data.jdbcUrl?.includes("sqlserver") || initialData?.id === "c2") ? "c2"
      : initialData?.id === "c1" ? "c1" : null;

  const rawSchema = data.connectionType === "csv"
    ? buildCsvSchema(data.csvFiles || [])
    : data.connectionType === "api"
      ? buildApiSchema(data.apiResources || [])
      : discoveredSchema;

  const schema = useMemo(() => {
    if (!rawSchema) return null;
    const sel = data.selectedTables || [];
    if (sel.length === 0) return { ...rawSchema, rels: inferSchemaRelations(rawSchema.tables || [], rawSchema.rels || []) };
    const tables = rawSchema.tables.filter(t => sel.includes(t.name));
    const tableNames = new Set(tables.map(t => t.name));
    const rels = inferSchemaRelations(tables, rawSchema.rels || []).filter(r => tableNames.has(r.from) && tableNames.has(r.to));
    return { tables, rels };
  }, [rawSchema, data.selectedTables]);

  const schemaForConnection = useMemo(() => {
    if (data.connectionType === "csv") return buildCsvSchema(data.csvFiles || []);
    if (data.connectionType === "api") return buildApiSchema(data.apiResources || []);
    if (discoveredSchema) return discoveredSchema;
    return null;
  }, [data.connectionType, data.csvFiles, data.apiResources, discoveredSchema]);

  if (!open) return null;

  const progress = Math.round((step / WIZARD_STEPS.length) * 100);
  const cur = WIZARD_STEPS[step - 1];
  const progressFillClass = `${styles.progressFill} ${progressClassByStep[step - 1] || styles.progress100}`;

  const renderStep = () => {
    switch (step) {
      case 1: return <IdentityStep data={data} setData={setData} />;
      case 2: return <ConnectionStep data={data} setData={setData} schema={schemaForConnection} onTestConnection={testConnection} onDiscoverSchema={discoverSchema} />;
      case 3: return <ExplorationStep data={data} setData={setData} schema={schema} selectedTable={selectedTable} setSelectedTable={setSelectedTable} />;
      case 4: return <PipelinesStep data={data} setData={setData} schema={schema} />;
      case 5: return <BudgetStep data={data} setData={setData} schema={schema} connId={connId || "generic"} />;
      case 6: return <TenantsStep data={data} setData={setData} onPersist={persistAndKeepOpen} />;
      case 7: return <DataPreviewStep data={data} setData={setData} schema={schema} />;
      case 8: return <SummaryStep data={data} onSave={saveConnector} onDelete={onDelete} initialData={initialData} />;
      default: return null;
    }
  };

  const modalContent = (
    <>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Plug size={15} color="#fff" />
          </div>
          <div className={styles.headerDivider} />
          <div>
            <div className={styles.headerTitle}>{isEditing ? "Modifier le connecteur" : "Nouveau connecteur ERP"}</div>
            <div className={styles.headerSubtitle}>Moteur anomalie · Prévision budgétaire</div>
          </div>
        </div>

        <div className={styles.headerActions}>
          {hasUnsavedIdentity && (
            <button
              onClick={() => { if (!ensurePipelineGroupBy()) return; onSave(data); setSavedSnapshot(makeIdentitySnap(data)); }}
              className={`${styles.actionButton} ${styles.saveAction}`}
            >
              <Check size={13} /> Sauvegarder
            </button>
          )}
          {hasUnsavedPipeline && (
            <button
              onClick={syncTemplates}
              className={`${styles.actionButton} ${styles.syncAction}`}
            >
              <RefreshCw size={13} /> Synchroniser
            </button>
          )}
          {isEditing && (
            <button
              onClick={openReport}
              className={`${styles.actionButton} ${styles.reportAction}`}
            >
              <FileBarChart size={13} /> Rapport
            </button>
          )}
          <button onClick={() => setIsFullscreen(p => !p)} className={styles.iconButton}>
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={onClose} className={styles.iconButton}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── PREFILL BANNER (assistant JSON import) ── */}
      {fromJsonImport && (
        <div className={styles.prefillBanner}>
          <Wand2 size={14} color="#1d4ed8" />
          <span className={styles.prefillStrong}>Prérempli depuis le JSON de l'assistant.</span>
          <span className={styles.prefillText}>Vérifiez chaque étape avant d'enregistrer — rien n'est sauvegardé ni déployé automatiquement.</span>
        </div>
      )}

      {/* ── BODY ── */}
      <div className={styles.body}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.progressSection}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>Progression</span>
              <span className={styles.progressValue}>{progress}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={progressFillClass} />
            </div>
          </div>
          <div className={`scroll ${styles.stepList}`}>
            {WIZARD_STEPS.map((s, i) => {
              const n = i + 1, done = step > n, active = step === n;
              const { Icon: SIcon } = s;
              return (
                <div key={n} onClick={() => goToStep(n)}
                  className={`${styles.stepItem} ${active ? styles.stepItemActive : ""}`}>
                  {active && <div className={styles.stepActiveMarker} />}
                  <div className={`${styles.stepIconBox} ${done ? styles.stepIconDone : active ? styles.stepIconActive : ""}`}>
                    {done ? <CheckCircle2 size={13} color={INTEGRATION_COLORS.success} /> : <SIcon size={13} color={active ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g400} />}
                  </div>
                  <div className={styles.stepTextWrap}>
                    <div className={`${styles.stepLabel} ${done ? styles.stepLabelDone : ""} ${active ? styles.stepLabelActive : ""}`}>{s.label}</div>
                    <div className={`${styles.stepDesc} ${active ? styles.stepDescActive : ""}`}>{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className={styles.main}>
          <div className={styles.mainHeader}>
            <div className={styles.mainTitleRow}>
              <div className={styles.mainIconBox}>
                <cur.Icon size={18} color={INTEGRATION_COLORS.red} />
              </div>
              <div>
                <div className={`serif ${styles.mainTitle}`}>{cur.label}</div>
                <div className={styles.mainSubtitle}>
                  {cur.desc}
                  <span className={styles.stepBadge}>{step}/{WIZARD_STEPS.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div key={step} className={`scroll fade-in ${styles.content}`}>
            {renderStep()}
          </div>

          {/* Footer nav */}
          <div className={styles.footer}>
            <button onClick={() => setStep(s => s - 1)} disabled={step === 1} className={`btn btn-ghost ${styles.prevButton}`}>
              <ArrowLeft size={13} /> Précédent
            </button>
            <div className={styles.footerDots}>
              {WIZARD_STEPS.map((_, i) => (
                <div key={i} onClick={() => goToStep(i + 1)}
                  className={`${styles.footerDot} ${step > i + 1 ? styles.footerDotDone : ""} ${step === i + 1 ? styles.footerDotActive : ""}`} />
              ))}
            </div>
            <div className={styles.footerActions}>
              <button onClick={saveInPlace} disabled={savingInPlace} className="btn btn-ghost" title="Enregistrer les modifications depuis n'importe quelle étape">
                {savingInPlace ? <RefreshCw size={13} className="spin" /> : <Check size={13} />} Enregistrer
              </button>
              {step < WIZARD_STEPS.length ? (
                <button onClick={() => goToStep(step + 1)} className="btn btn-primary">Suivant <ArrowRight size={13} /></button>
              ) : !isEditing ? (
                <button onClick={saveConnector} className="btn btn-primary"><Sparkles size={13} /> Créer</button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const wrapper = isFullscreen
    ? <div className={styles.fullscreenWrapper}>{modalContent}</div>
    : createPortal(
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          {modalContent}
        </div>
      </div>,
      document.body
    );

  return (
    <>
      {!showReport && (isFullscreen ? createPortal(wrapper, document.body) : wrapper)}
      {showReport && (
        <ERPReportModal
          integration={{ ...data, ...initialData }}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
