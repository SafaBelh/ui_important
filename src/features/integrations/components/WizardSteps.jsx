/**
 * The smaller connector-wizard steps (Exploration, Identity, Connection, DataPreview,
 * Summary) plus the schema visualisation switcher they use.
 * Extracted from IntegrationsView; the wizard shell mounts the five exported steps.
 */
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Table2,
  X,
  Zap,
} from "lucide-react";
import {
  PIPELINE_DEFS,
  INTEGRATION_CONNECTION_TYPES,
  CSV_SOURCE_PRESETS,
  DEFAULT_API_RESOURCE,
  buildApiSchema,
  buildCsvSchema,
  normalizeTableName,
} from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { getPipelineGroupByErrors } from "@/features/integrations/model/PipelineValidation";
import { toConnectorApiPayload } from "@/features/integrations/api/connectorApi";
import {
  previewConnectorTable,
  previewUnsavedConnectorTable,
} from "@/features/integrations/api/IntegrationAdminApi";
import { InfoBox } from "@/features/integrations/components/WizardUiPrimitives";
import { SchemaERD } from "@/features/integrations/components/SchemaERD";
import { SchemaForceGraph } from "@/features/integrations/components/SchemaForceGraph";
import styles from "./WizardSteps.module.css";

export function ExplorationStep({
  data,
  setData: _setData,
  schema,
  selectedTable,
  setSelectedTable,
}) {
  const [graphView, setGraphView] = useState("erd");
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("integration-graph-fullscreen", graphFullscreen);
    return () => document.body.classList.remove("integration-graph-fullscreen");
  }, [graphFullscreen]);
  const tableInfo = schema?.tables?.find((t) => t.name === selectedTable);
  const graphHeight = graphFullscreen ? Math.max(window.innerHeight - 43, 520) : 460;
  const graphShellStyle = graphFullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        borderRadius: 0,
        overflow: "hidden",
        background: INTEGRATION_COLORS.canvas,
        boxShadow: "none",
      }
    : { borderRadius: 14, overflow: "hidden" };
  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.info}>
        Schéma filtré — <strong>{schema?.tables?.length || 0} tables</strong> ·{" "}
        <strong>{schema?.rels?.length || 0} relations</strong>
      </InfoBox>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="tab-bar">
          <button
            className={`tab${graphView === "erd" ? " active" : ""}`}
            onClick={() => setGraphView("erd")}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Table2 size={12} /> Vue ERD
            </span>
          </button>
          <button
            className={`tab${graphView === "force" ? " active" : ""}`}
            onClick={() => setGraphView("force")}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Network size={12} /> Force Graph
            </span>
          </button>
        </div>
      </div>
      {schema ? (
        <>
          {graphView === "erd" && (
            <div style={graphShellStyle}>
              <div className="schema-toolbar">
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: "linear-gradient(135deg,#D94F3D,#e86b59)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Table2 size={11} color="#fff" />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7" }}>Schéma ERD</div>
                <div
                  style={{
                    marginLeft: "auto",
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    background: "rgba(217,79,61,.18)",
                    color: "#fca5a5",
                    border: "1px solid rgba(217,79,61,.3)",
                  }}
                >
                  {schema?.rels?.length || 0} relations
                </div>
                <button
                  onClick={() => setGraphFullscreen((v) => !v)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(255,255,255,.06)",
                    color: "#d4d4d8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {graphFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>
              <SchemaERD
                schema={schema}
                tableRoles={data.tableRoles || {}}
                onSelectTable={setSelectedTable}
                selectedTable={selectedTable}
                height={graphHeight}
                fullscreen={graphFullscreen}
              />
            </div>
          )}
          {graphView === "force" && (
            <div style={graphShellStyle}>
              <div className="schema-toolbar">
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Network size={11} color="#fff" />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7" }}>Force Graph</div>
                <div
                  style={{
                    marginLeft: "auto",
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    background: "rgba(59,130,246,.18)",
                    color: "#93c5fd",
                    border: "1px solid rgba(59,130,246,.3)",
                  }}
                >
                  {schema?.tables?.length || 0} tables
                </div>
                <button
                  onClick={() => setGraphFullscreen((v) => !v)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(255,255,255,.06)",
                    color: "#d4d4d8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {graphFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>
              <SchemaForceGraph
                schema={schema}
                onSelectTable={setSelectedTable}
                selectedTable={selectedTable}
                height={graphHeight}
                fullscreen={graphFullscreen}
              />
            </div>
          )}
          {tableInfo && (
            <div
              className="fade-in"
              style={{
                background: "#fff",
                border: `1px solid ${INTEGRATION_COLORS.g200}`,
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: INTEGRATION_COLORS.g900,
                    fontFamily: "inherit",
                  }}
                >
                  {tableInfo.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 7px",
                    borderRadius: 99,
                    background: INTEGRATION_COLORS.g100,
                    color: INTEGRATION_COLORS.g500,
                  }}
                >
                  {tableInfo.rowCount.toLocaleString()} lignes
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {tableInfo.cols.map((col) => (
                  <span
                    key={col}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 5,
                      background: INTEGRATION_COLORS.g100,
                      border: `1px solid ${INTEGRATION_COLORS.g200}`,
                      fontSize: 10,
                      fontFamily: "inherit",
                      color: INTEGRATION_COLORS.g700,
                    }}
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: INTEGRATION_COLORS.g400,
          }}
        >
          <Database size={36} style={{ display: "block", margin: "0 auto 12px", opacity: 0.35 }} />
          <p style={{ fontSize: 13 }}>Connexion requise (étape 2)</p>
        </div>
      )}
    </div>
  );
}

export function IdentityStep({ data, setData }) {
  // ERP connectors authenticate via JWT signed by the external ERP's public key — one method only.
  useEffect(() => {
    if (data.authType !== "JWT_PUBLIC_KEY") {
      setData((d) => ({ ...d, authType: "JWT_PUBLIC_KEY", algorithm: d.algorithm || "RS256" }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pem = (data.publicKey || "").trim();
  const pemValid = /-----BEGIN [A-Z ]*PUBLIC KEY-----[\s\S]+-----END [A-Z ]*PUBLIC KEY-----/.test(
    pem,
  );
  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.red}>
        Définissez l'identité du connecteur ERP et son mode d'authentification.
      </InfoBox>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="label">Nom du connecteur</label>
          <input
            value={data.name || ""}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="input"
            placeholder="ex: SAP S/4HANA Production"
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            value={data.connectorType || "ERP"}
            onChange={(e) => setData({ ...data, connectorType: e.target.value })}
            className="select"
          >
            <option value="ERP">ERP</option>
            <option value="DATA_SOURCE">Source de données</option>
            <option value="ACCOUNTING">Comptabilité</option>
          </select>
        </div>
        <div>
          <label className="label">Authentification</label>
          <select value="JWT_PUBLIC_KEY" disabled className="select">
            <option value="JWT_PUBLIC_KEY">JWT signé (clé publique)</option>
          </select>
        </div>
        <div>
          <label className="label">Logo (2 lettres)</label>
          <input
            value={data.logo || ""}
            maxLength={2}
            onChange={(e) => setData({ ...data, logo: e.target.value })}
            className="input"
            placeholder="SG"
          />
        </div>
        <div>
          <label className="label">Couleur principale</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="color"
              value={data.color || "#D94F3D"}
              onChange={(e) => setData({ ...data, color: e.target.value })}
              style={{
                width: 40,
                height: 40,
                padding: 2,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                cursor: "pointer",
              }}
            />
            <input
              value={data.color || "#D94F3D"}
              onChange={(e) => setData({ ...data, color: e.target.value })}
              className="input"
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="label">Description</label>
          <input
            value={data.description || ""}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            className="input"
            placeholder="Connecteur ERP…"
          />
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${INTEGRATION_COLORS.g100}`, paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: INTEGRATION_COLORS.g700,
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Settings2 size={13} color={INTEGRATION_COLORS.red} /> Authentification — JWT signé (clé
          publique)
        </div>
        <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400, marginBottom: 10 }}>
          Collez la clé publique de l'ERP externe. Elle sera utilisée pour vérifier les JWT signés
          par cet ERP.
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="label">
            Clé publique (PEM) <span style={{ color: INTEGRATION_COLORS.red }}>*</span>
          </label>
          <textarea
            value={data.publicKey || ""}
            onChange={(e) => setData({ ...data, publicKey: e.target.value })}
            className="input"
            rows={6}
            autoComplete="off"
            spellCheck={false}
            placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"}
            style={{
              resize: "vertical",
              height: 120,
              fontFamily: "inherit",
              fontSize: 11,
            }}
          />
          {pem && !pemValid && (
            <div style={{ fontSize: 10, color: INTEGRATION_COLORS.red, marginTop: 4 }}>
              Format PEM invalide — attendu : -----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----
            </div>
          )}
          {pemValid && (
            <div
              style={{
                fontSize: 10,
                color: INTEGRATION_COLORS.success,
                marginTop: 4,
              }}
            >
              ✓ Clé publique valide
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Issuer (optionnel)</label>
            <input
              value={data.issuer || ""}
              onChange={(e) => setData({ ...data, issuer: e.target.value })}
              className="input"
              placeholder="ex: askgo"
            />
          </div>
          <div>
            <label className="label">Audience (optionnel)</label>
            <input
              value={data.audience || ""}
              onChange={(e) => setData({ ...data, audience: e.target.value })}
              className="input"
              placeholder="ex: anomalyiq-widgets"
            />
          </div>
          <div>
            <label className="label">Key ID / kid (optionnel)</label>
            <input
              value={data.kid || ""}
              onChange={(e) => setData({ ...data, kid: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Algorithme</label>
            <select
              value={data.algorithm || "RS256"}
              onChange={(e) => setData({ ...data, algorithm: e.target.value })}
              className="select"
            >
              <option>RS256</option>
              <option>RS384</option>
              <option>RS512</option>
              <option>ES256</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConnectionStep({ data, setData, schema, onTestConnection, onDiscoverSchema }) {
  const [testState, setTestState] = useState(null);
  const [testMessage, setTestMessage] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const iconByName = { Database, Network, Layers };
  const connTypes = INTEGRATION_CONNECTION_TYPES.map((type) => ({
    ...type,
    Icon: iconByName[type.icon],
  }));
  const allTables = schema?.tables || [];
  const selectedTables = data.selectedTables || [];
  const toggleTable = (name) =>
    setData({
      ...data,
      selectedTables: selectedTables.includes(name)
        ? selectedTables.filter((t) => t !== name)
        : [...selectedTables, name],
    });
  // Search + render cap keep the table list fluid even for very large schemas
  // (e.g. 900 tables): filter by name, render at most TABLE_RENDER_CAP rows.
  // Selections that scroll out of the filter remain selected.
  const tableQuery = tableSearch.trim().toLowerCase();
  const filteredTables = tableQuery
    ? allTables.filter((t) => t.name.toLowerCase().includes(tableQuery))
    : allTables;
  const TABLE_RENDER_CAP = 300;
  const shownTables = filteredTables.slice(0, TABLE_RENDER_CAP);
  const csvFiles = data.csvFiles || [];
  const apiResources = data.apiResources || [];
  const parseCsvFiles = async (files) => {
    const parsed = await Promise.all(
      Array.from(files || []).map(async (file) => {
        const text = await file.text();
        const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
        const delimiter = firstLine.includes(";") ? ";" : ",";
        const cols = firstLine
          .split(delimiter)
          .map((col) => col.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        const rowCount = Math.max(0, text.split(/\r?\n/).filter((line) => line.trim()).length - 1);
        return { name: file.name, tableName: normalizeTableName(file.name), cols, rowCount };
      }),
    );
    const nextFiles = [...csvFiles, ...parsed];
    const nextSchema = buildCsvSchema(nextFiles);
    setData({
      ...data,
      connectionType: "csv",
      csvFiles: nextFiles,
      selectedTables: nextSchema.tables.map((t) => t.name),
    });
  };
  const addCsvPreset = (preset) => {
    const exists = csvFiles.some((file) => file.name === preset.name);
    const nextFiles = exists
      ? csvFiles.filter((file) => file.name !== preset.name)
      : [...csvFiles, preset];
    const nextSchema = buildCsvSchema(nextFiles);
    setData({
      ...data,
      connectionType: "csv",
      csvFiles: nextFiles,
      selectedTables: nextSchema.tables.map((t) => t.name),
    });
  };
  const removeCsvFile = (name) => {
    const nextFiles = csvFiles.filter((file) => file.name !== name);
    const nextSchema = buildCsvSchema(nextFiles);
    setData({
      ...data,
      csvFiles: nextFiles,
      selectedTables: (data.selectedTables || []).filter((t) =>
        nextSchema.tables.some((table) => table.name === t),
      ),
    });
  };
  const updateApiResource = (index, patch) => {
    const next = apiResources.map((resource, i) =>
      i === index ? { ...resource, ...patch } : resource,
    );
    const nextSchema = buildApiSchema(next);
    setData({ ...data, apiResources: next, selectedTables: nextSchema.tables.map((t) => t.name) });
  };
  const addApiResource = () => {
    const next = [
      ...apiResources,
      {
        ...DEFAULT_API_RESOURCE,
        name: `resource_${apiResources.length + 1}`,
        path: data.apiEndpoint || DEFAULT_API_RESOURCE.path,
      },
    ];
    const nextSchema = buildApiSchema(next);
    setData({
      ...data,
      connectionType: "api",
      apiResources: next,
      selectedTables: nextSchema.tables.map((t) => t.name),
    });
  };
  const removeApiResource = (index) => {
    const next = apiResources.filter((_, i) => i !== index);
    const nextSchema = buildApiSchema(next);
    setData({
      ...data,
      apiResources: next,
      selectedTables: (data.selectedTables || []).filter((t) =>
        nextSchema.tables.some((table) => table.name === t),
      ),
    });
  };
  const runConnectionTest = async () => {
    setTestState("testing");
    setTestMessage("");
    try {
      const res = await onTestConnection?.();
      if (res?.status === "error") throw new Error(res.message || "Connexion échouée");
      setTestState("ok");
      setTestMessage(res?.message || "Connexion réussie");
      await onDiscoverSchema?.();
    } catch (err) {
      setTestState("error");
      setTestMessage(err.message || "Connexion échouée");
    }
  };
  return (
    <div className={styles.stepStack}>
      <div>
        <label className="label" style={{ marginBottom: 8 }}>
          Type de connexion
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {connTypes.map((t) => (
            <div
              key={t.id}
              onClick={() => setData({ ...data, connectionType: t.id })}
              style={{
                flex: 1,
                padding: "12px 10px",
                borderRadius: 12,
                cursor: "pointer",
                textAlign: "center",
                background:
                  data.connectionType === t.id ? "rgba(217,79,61,.08)" : "rgba(248,247,245,.8)",
                border: `1.5px solid ${data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g200}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                <t.Icon
                  size={22}
                  color={
                    data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g400
                  }
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g700,
                }}
              >
                {t.label}
              </div>
              <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 2 }}>
                {t.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
      {data.connectionType === "jdbc" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="label">URL JDBC</label>
            <input
              value={data.jdbcUrl || ""}
              onChange={(e) => setData({ ...data, jdbcUrl: e.target.value })}
              className="input mono"
              placeholder="jdbc:postgresql://host:5432/erp_db"
              style={{ fontSize: 11 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Utilisateur</label>
              <input
                value={data.jdbcUsername || ""}
                onChange={(e) => setData({ ...data, jdbcUsername: e.target.value })}
                className="input"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Mot de passe</label>
              <input
                type="password"
                value={data.jdbcPassword || ""}
                onChange={(e) => setData({ ...data, jdbcPassword: e.target.value })}
                className="input"
              />
            </div>
          </div>
        </div>
      )}
      {data.connectionType === "csv" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              padding: "14px",
              borderRadius: 12,
              border: `1.5px dashed ${INTEGRATION_COLORS.g300}`,
              background: "rgba(248,247,245,.65)",
            }}
          >
            <label className="label">Sources CSV de test</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                marginTop: 8,
              }}
            >
              {CSV_SOURCE_PRESETS.map((preset) => {
                const selected = csvFiles.some((file) => file.name === preset.name);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => addCsvPreset(preset)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 11,
                      cursor: "pointer",
                      background: selected ? "rgba(217,79,61,.08)" : "#fff",
                      border: `1.5px solid ${selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g200}`,
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginBottom: 5,
                      }}
                    >
                      <FileText
                        size={13}
                        color={selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g400}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g800,
                        }}
                      >
                        {preset.label}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: INTEGRATION_COLORS.g500 }}>
                      {normalizeTableName(preset.tableName)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: INTEGRATION_COLORS.g400,
                        marginTop: 3,
                      }}
                    >
                      {preset.cols.length} colonnes · {preset.rowCount} lignes
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 8 }}>
              Sélectionnez une ou plusieurs sources mock pour tester Facture, Commande et Budget
              sans backend.
            </div>
          </div>
          <div
            style={{
              padding: "14px",
              borderRadius: 12,
              border: `1.5px dashed ${INTEGRATION_COLORS.g300}`,
              background: "rgba(248,247,245,.65)",
            }}
          >
            <label className="label">Importer vos propres fichiers CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => parseCsvFiles(e.target.files)}
              className="input"
              style={{ marginTop: 6 }}
            />
            <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 6 }}>
              Chaque fichier est traité comme une table importable.
            </div>
          </div>
          {csvFiles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {csvFiles.map((file) => (
                <div
                  key={file.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: `1px solid ${INTEGRATION_COLORS.g200}`,
                    background: "#fff",
                  }}
                >
                  <FileText size={13} color={INTEGRATION_COLORS.red} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: INTEGRATION_COLORS.g800,
                      }}
                    >
                      {normalizeTableName(file.tableName || file.name)}
                    </div>
                    <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400 }}>
                      {file.type ? `${file.type} · ` : ""}
                      {file.name} · {(file.cols || []).length} colonnes · {file.rowCount || 0}{" "}
                      lignes
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removeCsvFile(file.name)}
                    style={{ fontSize: 10, padding: "4px 8px" }}
                  >
                    <X size={11} /> Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {data.connectionType === "api" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="label">Endpoint de base</label>
            <input
              value={data.apiEndpoint || ""}
              onChange={(e) => setData({ ...data, apiEndpoint: e.target.value })}
              className="input mono"
              placeholder="https://api.exemple.com"
            />
          </div>
          <div>
            <label className="label">Token API</label>
            <input
              value={data.apiAuthToken || ""}
              onChange={(e) => setData({ ...data, apiAuthToken: e.target.value })}
              className="input"
              placeholder="Bearer / API key"
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <label className="label" style={{ marginBottom: 2 }}>
                Ressources API
              </label>
              <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400 }}>
                Chaque ressource est considérée comme une table.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={addApiResource}
              style={{ fontSize: 11 }}
            >
              <Plus size={12} /> Ressource
            </button>
          </div>
          {apiResources.map((resource, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.4fr 1.2fr 32px",
                gap: 8,
                alignItems: "center",
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${INTEGRATION_COLORS.g200}`,
                background: "#fff",
              }}
            >
              <input
                className="input mono"
                value={resource.name || ""}
                onChange={(e) => updateApiResource(index, { name: e.target.value })}
                placeholder="factures"
              />
              <input
                className="input mono"
                value={resource.path || ""}
                onChange={(e) => updateApiResource(index, { path: e.target.value })}
                placeholder="/factures"
              />
              <input
                className="input mono"
                value={(resource.cols || []).join(", ")}
                onChange={(e) =>
                  updateApiResource(index, {
                    cols: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="id, date, amount"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeApiResource(index)}
                style={{ padding: 6 }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {data.connectionType !== "csv" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost" onClick={runConnectionTest} style={{ fontSize: 11 }}>
            {testState === "testing" ? <RefreshCw size={12} className="spin" /> : <Zap size={12} />}{" "}
            Tester la connexion
          </button>
          {testState === "ok" && (
            <span
              style={{
                fontSize: 11,
                color: INTEGRATION_COLORS.success,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckCircle2 size={13} /> {testMessage || "Connexion réussie"}
            </span>
          )}
          {testState === "error" && (
            <span
              style={{
                fontSize: 11,
                color: INTEGRATION_COLORS.red,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <AlertCircle size={13} /> {testMessage}
            </span>
          )}
        </div>
      )}
      {allTables.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div>
              <label className="label" style={{ marginBottom: 2 }}>
                Tables disponibles
              </label>
              <div style={{ fontSize: 10, color: INTEGRATION_COLORS.g400 }}>
                {allTables.length} tables détectées
                {tableQuery ? ` · ${filteredTables.length} filtrée(s)` : ""} ·{" "}
                {selectedTables.length} sélectionnée(s)
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setData({
                    ...data,
                    selectedTables: Array.from(
                      new Set([...selectedTables, ...filteredTables.map((t) => t.name)]),
                    ),
                  })
                }
                style={{ fontSize: 10, padding: "4px 10px" }}
              >
                {tableQuery ? "Tout (filtré)" : "Tout"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setData({ ...data, selectedTables: [] })}
                style={{ fontSize: 10, padding: "4px 10px" }}
              >
                Effacer
              </button>
            </div>
          </div>
          <input
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="input"
            placeholder="Rechercher une table par nom…"
            style={{ fontSize: 11, marginBottom: 8 }}
          />
          <div
            className="scroll"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {shownTables.length === 0 && (
              <div
                style={{
                  padding: "14px",
                  fontSize: 11,
                  color: INTEGRATION_COLORS.g400,
                }}
              >
                Aucune table ne correspond à « {tableSearch} ».
              </div>
            )}
            {shownTables.map((t, i) => {
              const sel = selectedTables.includes(t.name);
              return (
                <div
                  key={t.name}
                  onClick={() => toggleTable(t.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    cursor: "pointer",
                    background: sel
                      ? "rgba(217,79,61,.04)"
                      : i % 2 === 0
                        ? "rgba(248,247,245,.5)"
                        : "#fff",
                    borderBottom: i < shownTables.length - 1 ? "1px solid rgba(0,0,0,.04)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `2px solid ${sel ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g300}`,
                      background: sel ? INTEGRATION_COLORS.red : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {sel && <CheckCircle2 size={11} color="#fff" />}
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: sel ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g700,
                      flex: 1,
                    }}
                  >
                    {t.name}
                  </span>
                  <span style={{ fontSize: 10, color: INTEGRATION_COLORS.g400 }}>
                    {t.cols.length} cols · {t.rowCount.toLocaleString()} lignes
                  </span>
                </div>
              );
            })}
            {filteredTables.length > shownTables.length && (
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: 10,
                  color: INTEGRATION_COLORS.g400,
                  textAlign: "center",
                  background: "rgba(248,247,245,.5)",
                }}
              >
                … {filteredTables.length - shownTables.length} autres tables — affinez la recherche
                pour les afficher
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── DATA PREVIEW STEP ─────────────────────────────────────── */
export function DataPreviewStep({ data, setData, schema }) {
  const customPipelines = data.customPipelines || [];
  const allTabs = [
    { key: "facture", label: "Factures", Icon: Database, color: PIPELINE_DEFS.facture.color },
    { key: "commande", label: "Commandes", Icon: Layers, color: PIPELINE_DEFS.commande.color },
    ...customPipelines.map((cp) => ({
      key: cp.id,
      label: cp.label,
      Icon: Settings2,
      color: cp.color,
    })),
  ];

  const [activeTab, setActiveTab] = useState("facture");
  const [genData, setGenData] = useState(data.generatedData || {});
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const selectedTables = data.selectedTables || [];
  const activeTables = (schema?.tables || []).filter((t) => selectedTables.includes(t.name));
  const pipelines = data.pipelines || {};
  const pl = pipelines[activeTab] || {};
  const plTables = activeTables.filter((t) => (pl.tables || []).includes(t.name));
  const preferredPreviewTable =
    activeTab === "facture" ? "factures" : activeTab === "commande" ? "commandes" : null;
  const previewTable =
    (preferredPreviewTable && plTables.find((t) => t.name === preferredPreviewTable)?.name) ||
    plTables.find((t) => /facture|commande|budget/i.test(t.name))?.name ||
    plTables[0]?.name ||
    activeTables[0]?.name ||
    selectedTables[0] ||
    "";

  const generate = async () => {
    if (!previewTable) {
      setPreviewError("Sélectionnez au moins une table source dans le pipeline.");
      return;
    }
    setLoading(true);
    setPreviewError("");
    try {
      const payload = toConnectorApiPayload(data);
      const res = data.id
        ? await previewConnectorTable(data.id, { table: previewTable, limit: 10 })
        : await previewUnsavedConnectorTable(previewTable, 10, payload);
      if (res?.status === "error") throw new Error(res.message || "Prévisualisation impossible");
      const rows = res?.sample || res?.rows || [];
      const next = { ...genData, [activeTab]: rows };
      setGenData(next);
      setData({ ...data, generatedData: next });
      if (!rows.length)
        setPreviewError(`La table ${previewTable} ne contient aucune ligne à afficher.`);
    } catch (err) {
      setPreviewError(err.message || "Prévisualisation impossible");
    } finally {
      setLoading(false);
    }
  };
  const activeRows = genData[activeTab] || [];

  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.info}>
        Utilisez la prévisualisation de table backend pour valider les données réelles.
      </InfoBox>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {allTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 10,
              border: `1.5px solid ${activeTab === t.key ? t.color : "transparent"}`,
              background: activeTab === t.key ? `${t.color}12` : "transparent",
              color: activeTab === t.key ? t.color : INTEGRATION_COLORS.g500,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <t.Icon size={13} /> {t.label}
            {genData[t.key] && (
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 99,
                  background: INTEGRATION_COLORS.successLight,
                  color: "#15803d",
                }}
              >
                <CheckCircle2 size={8} />
              </span>
            )}
          </button>
        ))}
      </div>
      <button className="btn btn-primary" onClick={generate} disabled={loading || !previewTable}>
        {loading ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />} Préparer
        aperçu{previewTable ? ` (${previewTable})` : ""}
      </button>
      {previewError && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(217,79,61,.08)",
            border: "1px solid rgba(217,79,61,.22)",
            color: INTEGRATION_COLORS.red,
            fontSize: 12,
          }}
        >
          {previewError}
        </div>
      )}
      {activeRows.length > 0 ? (
        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${INTEGRATION_COLORS.g200}`,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table className="gen-table">
              <thead>
                <tr>
                  {Object.keys(activeRows[0]).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} title={String(v)}>
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: INTEGRATION_COLORS.g400,
            background: INTEGRATION_COLORS.g50,
            borderRadius: 12,
            border: `1px dashed ${INTEGRATION_COLORS.g200}`,
          }}
        >
          <Sparkles size={32} style={{ display: "block", margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 13 }}>
            Aucune donnée locale générée. Les aperçus doivent venir du serveur.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── SUMMARY STEP ──────────────────────────────────────────── */
export function SummaryStep({ data, onSave, onDelete, initialData }) {
  const tenants = data.tenants || [];
  const customPipelines = data.customPipelines || [];
  const pipelines = data.pipelines || {};
  const enabledPl = [
    ...["facture", "commande"]
      .filter((k) => (pipelines[k] || {}).enabled !== false)
      .map((k) => PIPELINE_DEFS[k].label),
    ...customPipelines
      .filter((cp) => (pipelines[cp.id] || {}).enabled !== false)
      .map((cp) => cp.label),
  ];

  const groupByErrors = getPipelineGroupByErrors(data);
  const isValid = data.name && (data.selectedTables || []).length > 0 && groupByErrors.length === 0;
  const connectionDetail =
    data.connectionType === "csv"
      ? `${(data.csvFiles || []).length} fichier(s) CSV`
      : data.connectionType === "api"
        ? `${(data.apiResources || []).length} ressource(s) API`
        : data.jdbcUrl || "—";
  const rows = [
    ["Nom", data.name || "—"],
    ["Type", data.connectorType || "—"],
    [
      "Auth",
      `JWT clé publique · ${data.algorithm || "RS256"} · clé ${(data.publicKey || "").includes("BEGIN") ? "présente" : "absente"}`,
    ],
    ["Connexion", `${(data.connectionType || "jdbc").toUpperCase()} · ${connectionDetail}`],
    ["Tables", (data.selectedTables || []).length + " table(s)"],
    ["Pipelines", enabledPl.join(" · ") || "—"],
    [
      "Tenants",
      `${tenants.length} tenant(s)${tenants.filter((t) => t.platformTenantId).length > 0 ? " · " + tenants.filter((t) => t.platformTenantId).length + " lié(s)" : ""}${tenants.filter((t) => t.storageMode === "isolated").length > 0 ? " · " + tenants.filter((t) => t.storageMode === "isolated").length + " DB isolée(s)" : ""}`,
    ],
    ["Tenants actifs", `${tenants.filter((t) => t.active).length} / ${tenants.length}`],
    [
      "Données test",
      data.generatedData && Object.keys(data.generatedData).length > 0
        ? "✓ Générées"
        : "Non générées",
    ],
    [
      "Budget",
      data.budgetTemplate?.budgetSource?.table || data.budgetFormula?.length > 0
        ? "✓ Configuré"
        : "Non configuré",
    ],
  ];

  return (
    <div className={styles.summaryStack}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          borderRadius: 14,
          background: isValid ? INTEGRATION_COLORS.successLight : INTEGRATION_COLORS.warningLight,
          border: `1px solid ${isValid ? INTEGRATION_COLORS.successBorder : "rgba(245,158,11,.3)"}`,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: isValid ? "rgba(34,197,94,.15)" : "rgba(245,158,11,.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isValid ? (
            <CheckCircle2 size={22} color={INTEGRATION_COLORS.success} />
          ) : (
            <AlertCircle size={22} color={INTEGRATION_COLORS.warning} />
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: isValid ? "#15803d" : "#92400e",
            }}
          >
            {isValid ? "Connecteur prêt à créer" : "Configuration incomplète"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: isValid ? "#16a34a" : "#b45309",
              marginTop: 2,
            }}
          >
            {isValid
              ? "Toutes les étapes critiques sont complètes."
              : groupByErrors.length > 0
                ? groupByErrors
                    .map((e) =>
                      e.type === "unmapped"
                        ? `${e.label}: champ(s) de regroupement non mappé(s) (${e.fields.join(", ")})`
                        : `${e.label}: regroupement requis`,
                    )
                    .join(" · ")
                : "Vérifiez le nom et la sélection de tables."}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: `1px solid ${INTEGRATION_COLORS.g200}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {rows.map(([k, v], i) => (
          <div
            key={k}
            style={{
              display: "flex",
              padding: "10px 16px",
              borderBottom: i < rows.length - 1 ? `1px solid ${INTEGRATION_COLORS.g100}` : "none",
              background: i % 2 === 0 ? "transparent" : "rgba(248,247,245,.4)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: INTEGRATION_COLORS.g400,
                flex: "0 0 160px",
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontSize: 11,
                color: String(v).startsWith("✓")
                  ? INTEGRATION_COLORS.success
                  : INTEGRATION_COLORS.g900,
                fontWeight: 600,
              }}
            >
              {String(v)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={!isValid}
          style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: 10 }}
        >
          {initialData?.id ? (
            <>
              <RefreshCw size={14} /> Enregistrer
            </>
          ) : (
            <>
              <Sparkles size={14} /> Créer le connecteur
            </>
          )}
        </button>
        {initialData?.id && onDelete && (
          <button className="btn btn-danger" onClick={onDelete}>
            <X size={14} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
