import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Database,
  FileText,
  FolderOpen,
  Globe,
} from "lucide-react";
import { COLORS } from "@/constants/colors";
import { useSession } from "@/features/auth/model/useSession";
import { selectPartnersForTenant } from "@/features/partners/model/partnerSelectors";
import { selectTenants } from "@/features/tenants/model/tenantSelectors";
import { useAppSelector } from "@/store/hooks";
import { updatePipelineStore } from "@/features/pipelines/model/pipelineActions";
import { loadPartnersForTenant } from "@/shared/model/dataLoaders";
import { CSV_IMPORT_SEQUENCE } from "@/constants/uiConstants";
import {
  inferSchemaRelations,
  normalizePipelineEnabledChecks,
  normalizePipelineRecordType,
} from "@/constants/integrationWizard";
import { parseCSV, wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import {
  createPipeline,
  getPipelineSourceSchema,
  previewPipelineSourceConnection,
  updatePipeline,
  updatePipelineMapping,
} from "@/features/pipelines/api/pipelinesApi";
import { LBL } from "./PipelineConfigFormUi";
import { parseStatusTags } from "./PipelineConfigFormStatusTags";
import { CONN_SEQUENCES, getDefaultFields } from "./PipelineConfigTerminal";
import { PipelineConfigTerminalView } from "./PipelineConfigTerminalView";
import { PipelineStatusWorkflowSection } from "./PipelineStatusWorkflowSection";
import { PipelineSchemaExplorer } from "./PipelineSchemaExplorer";
import { PipelineAlgorithmSettingsStep } from "./PipelineAlgorithmSettingsStep";
import { PipelineGeneralSettingsStep } from "./PipelineGeneralSettingsStep";
import { logError } from "@/shared/utils/logError";
import { PipelineConnectionTab } from "./PipelineConnectionTab";
import styles from "./PipelineConfigForm.module.css";

export function PipelineConfigForm({
  pipeline,
  tenantId,
  mode: _mode = "wizard",
  onCancel,
  onSubmitted,
  onOpenSeries,
}) {
  const { tenant, partner, isSSO } = useSession();
  const tenants = useAppSelector(selectTenants);
  const creationTenantId = pipeline?.tenantId || tenantId || tenant?.id || tenants[0]?.id || null;
  const availablePartners = useAppSelector((state) =>
    selectPartnersForTenant(state, creationTenantId),
  );
  const savedConfig = (() => {
    const raw = pipeline?.configJson ?? pipeline?.config ?? {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw && typeof raw === "object" ? raw : {};
  })();
  const [wizardStep, setWizardStep] = useState(pipeline ? 4 : 1);
  const [name, setName] = useState(pipeline?.name ?? "");
  useEffect(() => {
    if (creationTenantId)
      loadPartnersForTenant(creationTenantId).catch((error) =>
        logError("loadPartnersForTenant", error),
      );
  }, [creationTenantId]);
  const [desc, setDesc] = useState(pipeline?.description ?? "");
  const active = pipeline ? pipeline.status === "actif" : true;
  const [connType, setConnType] = useState(
    (savedConfig.connection?.type || pipeline?.connector?.toLowerCase() || "api").replace(
      "rest",
      "api",
    ),
  );
  const freq = savedConfig.schedule?.freq ?? pipeline?.freq ?? "daily";
  const [executionMode, setExecutionMode] = useState(
    savedConfig.automation?.mode ?? savedConfig.executionMode ?? "automated",
  );
  const [tolPct, setTolPct] = useState(
    savedConfig.detection?.tolerancePct ?? pipeline?.tolerancePct ?? 10,
  );
  const [tolDays, setTolDays] = useState(
    savedConfig.detection?.toleranceDays ?? pipeline?.toleranceDays ?? 10,
  );
  const [kFactor, setKFactor] = useState(
    savedConfig.detection?.kFactor ?? pipeline?.kFactor ?? 3.0,
  );
  const [recordType] = useState(
    normalizePipelineRecordType(
      savedConfig.recordType || pipeline?.recordType,
      pipeline?.kind || pipeline?.templateKey || savedConfig.template,
      "INVOICE",
    ),
  );
  const [enabledChecks] = useState(
    normalizePipelineEnabledChecks(savedConfig.enabledChecks ?? pipeline?.enabledChecks),
  );
  const [apiUrl, setApiUrl] = useState(savedConfig.connection?.apiUrl ?? "");
  const [apiAuth, setApiAuth] = useState(savedConfig.connection?.apiAuth ?? "Bearer token");
  const [apiToken, setApiToken] = useState(savedConfig.connection?.apiToken ?? "");
  const [jdbcUrl, setJdbcUrl] = useState(savedConfig.connection?.jdbcUrl ?? "");
  const [jdbcDriver, setJdbcDriver] = useState(savedConfig.connection?.jdbcDriver ?? "PostgreSQL");
  const jdbcHost = savedConfig.connection?.jdbcHost ?? "";
  const jdbcPort = savedConfig.connection?.jdbcPort ?? "5432";
  const jdbcDb = savedConfig.connection?.jdbcDb ?? "";
  const [jdbcUser, setJdbcUser] = useState(savedConfig.connection?.jdbcUser ?? "");
  const [jdbcPass, setJdbcPass] = useState(savedConfig.connection?.jdbcPass ?? "");
  const [sftpHost, setSftpHost] = useState(savedConfig.connection?.sftpHost ?? "");
  const [sftpPort, setSftpPort] = useState(savedConfig.connection?.sftpPort ?? "22");
  const [sftpUser, setSftpUser] = useState(savedConfig.connection?.sftpUser ?? "");
  const [sftpPath, setSftpPath] = useState(savedConfig.connection?.sftpPath ?? "");
  const [sftpAuthMethod, setSftpAuthMethod] = useState(
    savedConfig.connection?.sftpAuthMethod ?? "password",
  );
  const [sftpPass, setSftpPass] = useState(savedConfig.connection?.sftpPass ?? "");
  const [csvDelim, setCsvDelim] = useState(savedConfig.connection?.csvDelim ?? ",");
  const [csvEnc, setCsvEnc] = useState(savedConfig.connection?.csvEnc ?? "UTF-8");
  const [csvHeader, setCsvHeader] = useState(savedConfig.connection?.csvHeader ?? "first");

  const [jdbcTables, setJdbcTables] = useState(
    savedConfig.jdbc?.tables ?? (pipeline ? [{ name: "factures", alias: "f" }] : []),
  );
  const [jdbcJoins, setJdbcJoins] = useState(savedConfig.jdbc?.joins ?? []);
  const [jdbcWhere, setJdbcWhere] = useState(savedConfig.jdbc?.where ?? "");
  const [discoveredSchema, setDiscoveredSchema] = useState(savedConfig.jdbc?.schema ?? null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");
  const [schemaMessage, setSchemaMessage] = useState("");
  const contentRef = useRef(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [wizardStep, connType]);

  // Status workflow fields
  const [statusCol, setStatusCol] = useState(
    savedConfig.statusWorkflow?.statusColumn ?? pipeline?.statusColumn ?? "",
  );
  const [allowedStatuses, setAllowedStatuses] = useState(
    savedConfig.statusWorkflow?.allowedStatuses ??
      pipeline?.allowedStatuses ??
      '["VALIDATED","PAID"]',
  );
  const [provisionalStatuses, setProvisionalStatuses] = useState(
    savedConfig.statusWorkflow?.provisionalStatuses ??
      pipeline?.provisionalStatuses ??
      '["Reçu","En attente"]',
  );
  const [finalStatuses, setFinalStatuses] = useState(
    savedConfig.statusWorkflow?.finalStatuses ??
      pipeline?.finalStatuses ??
      '["Comptabilisé","Validé"]',
  );
  const [importStartDate, setImportStartDate] = useState(
    savedConfig.statusWorkflow?.importStartDate ?? pipeline?.importStartDate ?? "",
  );

  const [scheduleMode, setScheduleMode] = useState(
    savedConfig.schedule?.scheduleMode ??
      savedConfig.schedule?.mode ??
      pipeline?.scheduleMode ??
      "MANUAL",
  );
  const [cronExpression, setCronExpression] = useState(
    savedConfig.schedule?.cronExpression ??
      savedConfig.schedule?.cron ??
      pipeline?.cronExpression ??
      "0 0 2 * * ?",
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    savedConfig.schedule?.intervalMinutes ?? pipeline?.intervalMinutes ?? "15",
  );

  const [csvFile, setCsvFile] = useState(null);
  const [csvImportPhase, setCsvImportPhase] = useState("idle");
  const [csvImportLines, setCsvImportLines] = useState([]);
  const [csvDetectedFields, setCsvDetectedFields] = useState([]);
  const csvDropRef = useRef();

  const runCsvTerminal = useCallback(
    (fields, rowCount) => {
      setCsvImportPhase("importing");
      setCsvImportLines([]);
      const lastIdx = CSV_IMPORT_SEQUENCE.length - 1;
      CSV_IMPORT_SEQUENCE.forEach(({ delay, text, color }, idx) => {
        setTimeout(() => {
          setCsvImportLines((prev) => [
            ...prev,
            {
              text:
                text === "__FIELDS__"
                  ? "    " +
                    fields.slice(0, 8).join("  ·  ") +
                    (fields.length > 8 ? `  +${fields.length - 8} autres` : "")
                  : text === "__ROWS__"
                    ? `  → ${rowCount.toLocaleString("fr-FR")} lignes importées`
                    : text,
              color,
            },
          ]);
          // Complete on the LAST sequence step (was keyed to an exact string that
          // wasn't present → import stayed "en cours" forever).
          if (idx === lastIdx) {
            setCsvImportPhase("done");
            setCsvDetectedFields(fields);
            setTimeout(() => setWizardStep(2), 600);
          }
        }, delay);
      });
    },
    [setWizardStep],
  );

  const handleCsvFile = useCallback(
    async (file) => {
      if (!file) return;
      setCsvFile(file);
      try {
        const text = await file.text();
        const { headers, rows } = parseCSV(text);
        wsStore.csvHeaders = headers;
        wsStore.csvSampleRows = rows.slice(0, 5);
        wsStore.csvRawRows = rows;
        wsStore.invoices = rows.map((r, i) => ({
          invoice_ref: r.invoice_ref || `INV-${i + 1}`,
          invoice_date: r.invoice_date || r.date || "",
          amount: parseFloat(r.amount) || 0,
          supplier_code: r.supplier_code || r.supplier || "",
          label: r.label || "",
          entity: r.entity || "",
          status: r.status || "",
          due_date: r.due_date || "",
        }));
        wsStore.series = [];
        wsStore.alerts = [];
        wsStore.detectionRun = false;
        if (!headers || headers.length === 0 || rows.length === 0) {
          throw new Error("CSV vide ou en-têtes illisibles");
        }
        runCsvTerminal(headers, rows.length);
      } catch (e) {
        // Local parse failed. Only the backend preview path needs an existing
        // pipeline; for a brand-new pipeline it would hang, so surface a clear
        // error state instead of an infinite "Import en cours…".
        try {
          if (!pipeline?.id) throw e;
          await wsAPI.importCSV();
          const preview = await wsAPI.previewCSV();
          runCsvTerminal(preview.headers, preview.row_count);
        } catch (inner) {
          setCsvImportPhase("error");
          setCsvImportLines([
            {
              text:
                "  ✗ Import impossible : " + (inner?.message || e?.message || "fichier illisible"),
              color: "#f87171",
            },
          ]);
        }
      }
    },
    [runCsvTerminal, pipeline?.id],
  );

  const canSubmit = name.trim().length >= 2 && (pipeline || creationTenantId);

  const CONNS = [
    { id: "api", label: "API REST", sub: "HTTP / Bearer", LucideComp: Globe },
    { id: "jdbc", label: "JDBC", sub: "Base SQL", LucideComp: Database },
    { id: "sftp", label: "SFTP", sub: "Fichiers", LucideComp: FolderOpen },
    { id: "csv", label: "CSV", sub: "Import", LucideComp: FileText },
  ];

  const driverClassName =
    {
      PostgreSQL: "org.postgresql.Driver",
      MySQL: "com.mysql.cj.jdbc.Driver",
      MSSQL: "com.microsoft.sqlserver.jdbc.SQLServerDriver",
      Oracle: "oracle.jdbc.OracleDriver",
    }[jdbcDriver] || "org.postgresql.Driver";

  // Single source of truth: the full JDBC URL (the split host/db mode was removed
  // — it confused users and browser autofill leaked secrets into the db-name field).
  const effectiveJdbcUrl = jdbcUrl.trim();

  const connectorPayload = () => ({
    name: name.trim() || "Pipeline source",
    connectorType: "ERP",
    authType: "NONE",
    publicKey: "N/A",
    connectionType: connType,
    jdbcUrl: effectiveJdbcUrl,
    jdbcUsername: jdbcUser,
    jdbcPassword: jdbcPass,
    jdbcDriverClassName: driverClassName,
    apiEndpoint: apiUrl,
    apiAuthHeader: apiAuth,
    apiAuthToken: apiToken,
  });

  const aliasForTable = (name = "", index = 0) => {
    const base =
      String(name)
        .split("_")
        .map((part) => part[0])
        .join("")
        .toLowerCase()
        .replace(/[^a-z]/g, "") || `t${index + 1}`;
    const used = new Set(jdbcTables.map((t) => t.alias));
    if (!used.has(base)) return base;
    let next = `${base}${index + 1}`;
    let n = index + 1;
    while (used.has(next)) next = `${base}${++n}`;
    return next;
  };

  const addSchemaTable = (tableName) => {
    if (!tableName || jdbcTables.some((t) => t.name === tableName)) return;
    setJdbcTables((ts) => [...ts, { name: tableName, alias: aliasForTable(tableName, ts.length) }]);
  };

  const addSchemaRelation = (rel) => {
    const fromName = rel.from;
    const toName = rel.to;
    let fromAlias = jdbcTables.find((t) => t.name === fromName)?.alias;
    let toAlias = jdbcTables.find((t) => t.name === toName)?.alias;
    setJdbcTables((ts) => {
      const next = [...ts];
      if (!fromAlias) {
        const used = new Set(next.map((t) => t.alias));
        fromAlias = aliasForTable(fromName, next.length);
        while (used.has(fromAlias)) fromAlias = `${fromAlias}${next.length + 1}`;
        next.push({ name: fromName, alias: fromAlias });
      }
      if (!toAlias) {
        const used = new Set(next.map((t) => t.alias));
        toAlias = aliasForTable(toName, next.length);
        while (used.has(toAlias)) toAlias = `${toAlias}${next.length + 1}`;
        next.push({ name: toName, alias: toAlias });
      }
      return next;
    });
    const condition = `${fromAlias}.${rel.col} = ${toAlias}.${rel.toCol || rel.col}`;
    setJdbcJoins((js) =>
      js.some((j) => j.condition === condition)
        ? js
        : [...js, { fromAlias, toAlias, condition, type: "LEFT" }],
    );
  };

  const discoverSourceSchema = async () => {
    if (connType !== "jdbc") return null;
    if (!effectiveJdbcUrl || !jdbcUser) {
      setSchemaError("Renseignez l'URL JDBC complète et l'utilisateur SQL.");
      return null;
    }
    if (!/^jdbc:[a-z0-9]+:\/\//i.test(effectiveJdbcUrl)) {
      setSchemaError("URL JDBC invalide — format attendu : jdbc:postgresql://hôte:port/base");
      return null;
    }
    setSchemaLoading(true);
    setSchemaError("");
    setSchemaMessage("");
    try {
      const test = await previewPipelineSourceConnection(connectorPayload());
      if (test?.status === "error") throw new Error(test.message || "Connexion impossible");
      const res = await getPipelineSourceSchema(connectorPayload());
      if (res?.status === "error")
        throw new Error(res.message || "Découverte du schéma impossible");
      const tables = res?.tables || [];
      const schema = { tables, rels: inferSchemaRelations(tables, res?.rels || []) };
      setDiscoveredSchema(schema);
      setSchemaMessage(`${tables.length} table(s), ${schema.rels.length} relation(s) détectée(s).`);
      return schema;
    } catch (err) {
      setSchemaError(err.message || "Connexion ou découverte impossible");
      return null;
    } finally {
      setSchemaLoading(false);
    }
  };

  const goNext = async () => {
    if (wizardStep === 1) {
      setWizardStep(2);
      return;
    }
    if (wizardStep === 2 && connType === "jdbc") {
      const schema = discoveredSchema || (await discoverSourceSchema());
      if (!schema) return;
      setWizardStep(3);
      return;
    }
    setWizardStep((s) => s + 1);
  };

  const persist = async () => {
    if (!canSubmit) return;
    const connectorName = connType === "api" ? "REST" : connType.toUpperCase();
    const configJson = {
      ...(savedConfig || {}),
      mode: pipeline ? "edit" : "create",
      connection: {
        type: connType,
        apiUrl,
        apiAuth,
        apiToken,
        jdbcDriver,
        jdbcUrl: effectiveJdbcUrl,
        jdbcHost,
        jdbcPort,
        jdbcDb,
        jdbcUser,
        jdbcPass,
        sftpHost,
        sftpPort,
        sftpUser,
        sftpPath,
        sftpAuthMethod,
        sftpPass,
        csvDelim,
        csvEnc,
        csvHeader,
        csvFileName: csvFile?.name || savedConfig.connection?.csvFileName || null,
      },
      jdbc: {
        tables: jdbcTables,
        joins: jdbcJoins,
        where: jdbcWhere,
        schema: discoveredSchema,
      },
      detection: {
        tolerancePct: tolPct,
        toleranceDays: tolDays,
        kFactor,
      },
      schedule: {
        freq,
        mode: scheduleMode,
        cron: cronExpression,
        scheduleMode,
        cronExpression,
        intervalMinutes: parseInt(intervalMinutes, 10) || null,
      },
      automation: {
        mode: executionMode,
        autoRun: executionMode === "automated",
      },
      executionMode,
      recordType,
      enabledChecks,
      statusWorkflow: {
        statusColumn: statusCol,
        allowedStatuses,
        provisionalStatuses,
        finalStatuses,
        importStartDate,
      },
      updatedAt: new Date().toISOString(),
    };
    const patch = {
      name: name.trim(),
      description: desc,
      connector: connectorName,
      status: active ? "actif" : "paused",
      kFactor,
      tolerancePct: tolPct,
      toleranceDays: tolDays,
      freq,
      erpPartnerId: pipeline?.erpPartnerId || (isSSO ? partner?.id : null),
      scheduleMode,
      cronExpression,
      intervalMinutes,
      statusColumn: statusCol,
      allowedStatuses,
      provisionalStatuses,
      finalStatuses,
      importStartDate,
      recordType,
      enabledChecks,
      configJson,
    };
    // Backend-shaped config (PipelineConfigDTO): this is what actually
    // persists — the rich local configJson above is only a display cache.
    const backendConfig = {
      description: desc || null,
      tolerancePct: tolPct,
      toleranceDays: tolDays,
      schedule: {
        freq,
        mode: scheduleMode,
        cron: cronExpression,
        intervalMinutes: parseInt(intervalMinutes, 10) || null,
      },
      importStatusColumn: statusCol || null,
      importStatuses: parseStatusTags(allowedStatuses),
      provisionalStatuses: parseStatusTags(provisionalStatuses),
      finalStatuses: parseStatusTags(finalStatuses),
      importStartDate: importStartDate || null,
      recordType,
      enabledChecks,
    };
    if (pipeline) {
      // Persist name/status (drives the scheduler) then the config; the
      // backend re-arms or cancels the rhythm automatically.
      await updatePipeline(pipeline.id, {
        name: patch.name,
        status: active ? "ACTIVE" : "DRAFT",
        adminTenantId: pipeline.tenantId,
      });
      await updatePipelineMapping(pipeline.id, {
        ...backendConfig,
        adminTenantId: pipeline.tenantId,
      });
      updatePipelineStore(pipeline.id, patch);
      onSubmitted(pipeline.id);
    } else {
      const created = await createPipeline({
        // adminTenantId → X-Tenant-ID header: without it, an engine admin
        // would create the pipeline under the ADMIN tenant.
        adminTenantId: creationTenantId,
        name: patch.name,
        isCustom: connType === "csv",
        sourceType:
          connType === "csv"
            ? "CSV"
            : String(connType || "JDBC")
                .toUpperCase()
                .replace("REST", "API"),
        config: { ...backendConfig, isCustom: connType === "csv" },
      });
      onSubmitted(created?.id);
    }
  };

  // Terminal connection state
  const [connPhase, setConnPhase] = useState("idle");
  const [connLines, setConnLines] = useState([]);
  const [connFields, setConnFields] = useState([]);
  const [connRowCount, setConnRowCount] = useState(0);

  const runConnTerminal = useCallback(() => {
    const fields = getDefaultFields(connType, csvDetectedFields);
    const rows = connType === "csv" ? wsStore.invoices.length : 0;
    setConnFields(fields);
    setConnRowCount(rows);
    setConnPhase("connecting");
    setConnLines([]);
    const seq = CONN_SEQUENCES[connType] || CONN_SEQUENCES.api;
    let lastDelay = 0;
    seq.forEach(({ delay, text, color }) => {
      lastDelay = Math.max(lastDelay, delay);
      setTimeout(() => {
        setConnLines((prev) => [
          ...prev,
          {
            text:
              text === "__FIELDS__"
                ? "    " +
                  fields.slice(0, 8).join("  ·  ") +
                  (fields.length > 8 ? `  +${fields.length - 8} autres` : "")
                : text === "__ROWS__"
                  ? `  → ${rows.toLocaleString("fr-FR")} enregistrements chargés`
                  : text,
            color,
          },
        ]);
      }, delay);
    });
    setTimeout(() => setConnPhase("done"), lastDelay + 200);
  }, [connType, csvDetectedFields]);

  const handleCreate = () => {
    if (!canSubmit) return;
    if (!pipeline) {
      persist();
      return;
    }
    runConnTerminal();
  };
  const handleConfirmCreate = () => {
    persist();
  };

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className={styles.shell}>
      {connPhase !== "idle" ? (
        <PipelineConfigTerminalView
          phase={connPhase}
          lines={connLines}
          fields={connFields}
          rowCount={connRowCount}
          connType={connType}
          connector={CONNS.find((conn) => conn.id === connType)}
          name={name}
          csvFileName={csvFile?.name}
          onEdit={() => setConnPhase("idle")}
          onConfirm={handleConfirmCreate}
          isEditMode={Boolean(pipeline)}
        />
      ) : (
        /* ── Wizard ── */
        <div className={styles.wizardShell}>
          <div className={styles.wizardBody}>
            {/* ── Sidebar Stepper ── */}
            <div className={styles.stepper}>
              {[
                {
                  stepNum: 1,
                  title: "1. Identité & Rythme",
                  desc: "Nom, partenaire et planification",
                },
                {
                  stepNum: 2,
                  title: "2. Connexion Source",
                  desc: "Credentials et type de connecteur",
                },
                { stepNum: 3, title: "3. Exploration", desc: "Tables, colonnes et relations" },
                { stepNum: 4, title: "4. Paramètres MAD", desc: "Seuils, tolérances et clusters" },
              ].map((s) => {
                const isPast = s.stepNum < wizardStep;
                const isCurrent = s.stepNum === wizardStep;
                return (
                  <div
                    key={s.stepNum}
                    className={`${styles.stepItem} ${isCurrent ? styles.stepItemCurrent : ""}`}
                  >
                    <div className={styles.stepHeader}>
                      <div
                        className={`${styles.stepBadge} ${isPast ? styles.stepBadgePast : isCurrent ? styles.stepBadgeCurrent : styles.stepBadgeUpcoming}`}
                      >
                        {isPast ? (
                          <Check
                            size={10}
                            strokeWidth={3}
                            color={
                              isPast
                                ? s.stepNum < wizardStep && s.stepNum === 1
                                  ? COLORS.grey500
                                  : COLORS.success
                                : COLORS.grey500
                            }
                          />
                        ) : (
                          s.stepNum
                        )}
                      </div>
                      <span
                        className={`${styles.stepTitle} ${isCurrent ? styles.stepTitleCurrent : ""}`}
                      >
                        {s.title}
                      </span>
                    </div>
                    <span className={styles.stepDesc}>{s.desc}</span>
                  </div>
                );
              })}
            </div>

            {/* ── Main content ── */}
            <div ref={contentRef} className={styles.contentPanel}>
              {/* ══ STEP 1 ══ */}
              {wizardStep === 1 && (
                <PipelineGeneralSettingsStep
                  pipeline={pipeline}
                  availablePartners={availablePartners}
                  name={name}
                  setName={setName}
                  desc={desc}
                  setDesc={setDesc}
                  executionMode={executionMode}
                  setExecutionMode={setExecutionMode}
                  scheduleMode={scheduleMode}
                  setScheduleMode={setScheduleMode}
                  cronExpression={cronExpression}
                  setCronExpression={setCronExpression}
                  intervalMinutes={intervalMinutes}
                  setIntervalMinutes={setIntervalMinutes}
                />
              )}

              {/* ══ STEP 2 ══ */}
              {wizardStep === 2 && (
                <div className={styles.stepContentStack}>
                  {/* Connector type selector */}
                  <div>
                    <LBL>TYPE DE SOURCE</LBL>
                    <div className={styles.connectorGrid}>
                      {CONNS.map((c) => {
                        const sel = connType === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setConnType(c.id)}
                            className={`${styles.connectorButton} ${sel ? styles.connectorButtonSelected : ""}`}
                          >
                            <c.LucideComp
                              size={16}
                              color={sel ? COLORS.red : COLORS.grey400}
                              strokeWidth={2}
                            />
                            <span>{c.label}</span>
                            <span
                              className={`${styles.connectorSub} ${sel ? styles.connectorSubSelected : ""}`}
                            >
                              {c.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.connectionPanel}>
                    <PipelineConnectionTab
                      connType={connType}
                      apiUrl={apiUrl}
                      setApiUrl={setApiUrl}
                      apiAuth={apiAuth}
                      setApiAuth={setApiAuth}
                      apiToken={apiToken}
                      setApiToken={setApiToken}
                      jdbcDriver={jdbcDriver}
                      setJdbcDriver={setJdbcDriver}
                      jdbcUrl={jdbcUrl}
                      setJdbcUrl={setJdbcUrl}
                      jdbcUser={jdbcUser}
                      setJdbcUser={setJdbcUser}
                      jdbcPass={jdbcPass}
                      setJdbcPass={setJdbcPass}
                      discoverSourceSchema={discoverSourceSchema}
                      schemaLoading={schemaLoading}
                      schemaMessage={schemaMessage}
                      schemaError={schemaError}
                      sftpHost={sftpHost}
                      setSftpHost={setSftpHost}
                      sftpPort={sftpPort}
                      setSftpPort={setSftpPort}
                      sftpUser={sftpUser}
                      setSftpUser={setSftpUser}
                      sftpPath={sftpPath}
                      setSftpPath={setSftpPath}
                      sftpAuthMethod={sftpAuthMethod}
                      setSftpAuthMethod={setSftpAuthMethod}
                      sftpPass={sftpPass}
                      setSftpPass={setSftpPass}
                      csvImportPhase={csvImportPhase}
                      csvImportLines={csvImportLines}
                      setCsvImportPhase={setCsvImportPhase}
                      setCsvImportLines={setCsvImportLines}
                      csvFile={csvFile}
                      setCsvFile={setCsvFile}
                      csvDetectedFields={csvDetectedFields}
                      csvDelim={csvDelim}
                      setCsvDelim={setCsvDelim}
                      csvEnc={csvEnc}
                      setCsvEnc={setCsvEnc}
                      csvHeader={csvHeader}
                      setCsvHeader={setCsvHeader}
                      csvDropRef={csvDropRef}
                      handleCsvFile={handleCsvFile}
                    />
                  </div>

                  <PipelineStatusWorkflowSection
                    statusCol={statusCol}
                    setStatusCol={setStatusCol}
                    importStartDate={importStartDate}
                    setImportStartDate={setImportStartDate}
                    allowedStatuses={allowedStatuses}
                    setAllowedStatuses={setAllowedStatuses}
                    provisionalStatuses={provisionalStatuses}
                    setProvisionalStatuses={setProvisionalStatuses}
                    finalStatuses={finalStatuses}
                    setFinalStatuses={setFinalStatuses}
                  />
                </div>
              )}

              {/* ══ STEP 3 ══ */}
              {wizardStep === 3 && (
                <PipelineSchemaExplorer
                  connType={connType}
                  discoveredSchema={discoveredSchema}
                  schemaLoading={schemaLoading}
                  discoverSourceSchema={discoverSourceSchema}
                  jdbcTables={jdbcTables}
                  setJdbcTables={setJdbcTables}
                  jdbcJoins={jdbcJoins}
                  setJdbcJoins={setJdbcJoins}
                  jdbcWhere={jdbcWhere}
                  setJdbcWhere={setJdbcWhere}
                  addSchemaTable={addSchemaTable}
                  addSchemaRelation={addSchemaRelation}
                />
              )}

              {/* ══ STEP 4 ══ */}
              {wizardStep === 4 && (
                <PipelineAlgorithmSettingsStep
                  tolPct={tolPct}
                  setTolPct={setTolPct}
                  tolDays={tolDays}
                  setTolDays={setTolDays}
                  kFactor={kFactor}
                  setKFactor={setKFactor}
                  isEditMode={Boolean(pipeline)}
                  executionMode={executionMode}
                />
              )}
            </div>
          </div>

          {/* ── Sticky Footer ── */}
          <div className={styles.footer}>
            <div className={styles.footerGroup}>
              {wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className={["btn-ghost", styles.footerGhostButton].join(" ")}
                >
                  Annuler
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => s - 1)}
                  className={["btn-ghost", styles.footerBackButton].join(" ")}
                >
                  <ChevronLeft size={14} /> Précédent
                </button>
              )}
              {onOpenSeries && (
                <button
                  type="button"
                  onClick={onOpenSeries}
                  className={["btn-ghost", styles.seriesButton].join(" ")}
                >
                  <FileText size={13} color={COLORS.grey500} /> Config séries
                </button>
              )}
            </div>
            <div className={styles.footerGroupRight}>
              {!canSubmit && name.trim().length < 2 && (
                <span className={styles.requiredHint}>Nom requis (min. 2 caractères)</span>
              )}
              {wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={(wizardStep === 1 && name.trim().length < 2) || schemaLoading}
                  className={["btn-primary", styles.primaryFooterButton].join(" ")}
                >
                  Suivant <ArrowRight size={14} color="#fff" className={styles.nextIcon} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canSubmit}
                  className={["btn-primary", styles.primaryFooterButton].join(" ")}
                >
                  <Check size={14} color="#fff" />
                  {pipeline
                    ? "Sauvegarder"
                    : executionMode === "automated"
                      ? "Créer et lancer"
                      : "Créer le pipeline"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
