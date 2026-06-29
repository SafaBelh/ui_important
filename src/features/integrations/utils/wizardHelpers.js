/**
 * Pure helpers for the IntegrationsView connector wizard: the report/score builders,
 * the pipeline-template preparation, and the guided Q&A flow configuration. No React
 * and no component state — extracted so the view file stays focused on UI.
 */
import {
  buildWizardDataFromAnswers,
  PIPELINE_DEFS,
  TENANT_IDS_PLACEHOLDER,
  TABLE_PALETTE,
  normalizePipelineEnabledChecks,
  normalizePipelineRecordType,
} from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";

export function buildReport(a) {
  const d = buildWizardDataFromAnswers(a);
  const authDetails = {};
  [
    "username",
    "apiKey",
    "apiKeyHeader",
    "clientId",
    "tokenUrl",
    "scopes",
    "publicKey",
    "issuer",
    "audience",
    "algorithm",
    "entityId",
    "ssoUrl",
  ].forEach((k) => {
    if (d[k]) authDetails[k] = d[k];
  });
  return {
    identity: {
      name: d.name,
      connectorType: d.connectorType,
      authType: d.authType,
      logo: d.logo,
      color: d.color,
      description: d.description,
    },
    authentication: authDetails,
    connection: {
      type: d.connectionType,
      jdbcUrl: d.jdbcUrl,
      jdbcUsername: d.jdbcUsername,
      jdbcPassword: d.jdbcPassword ? "***" : "",
      apiEndpoint: d.apiEndpoint,
      apiResources: d.apiResources || [],
      csvFiles: d.csvFiles || [],
    },
    tables: { selected: d.selectedTables, budgetSources: d.budgetSourceTables },
    pipelines: {
      factures: {
        enabled: true,
        sourceTables: d.pipelines.facture.tables,
        fieldMappings: d.pipelines.facture.fieldMappings,
        groupBy: effectivePipelineGroupBy("facture", d.pipelines.facture),
      },
      commandes: {
        enabled: true,
        sourceTables: d.pipelines.commande.tables,
        groupBy: effectivePipelineGroupBy("commande", d.pipelines.commande),
      },
    },
    budget: { allocationSources: d.budgetSourceTables },
    tenants: d.tenants.map((t) => t.id),
  };
}

function effectivePipelineGroupBy(key, pipeline = {}) {
  const explicit = Array.isArray(pipeline.groupByCols) ? pipeline.groupByCols.filter(Boolean) : [];
  if (key === "commande") {
    const valid = explicit.filter((col) => !/supplier|fournisseur/i.test(String(col)));
    return valid.length > 0 ? valid : PIPELINE_DEFS.commande.defaultGroupByCols;
  }
  if (explicit.length > 0) return explicit;
  return key === "facture" ? PIPELINE_DEFS.facture.defaultGroupByCols : [];
}

// Standard mapping keys handled by FieldMappingDTO server-side; anything else
// must travel as an extraField {column, alias} to be selected and grouped on.
const STANDARD_FIELD_KEYS = new Set([
  "supplier",
  "supplierName",
  "amount",
  "date",
  "invoiceDate",
  "label",
  "status",
  "commandeRef",
  "commandeDate",
  "budgetCode",
  "category",
]);

export function preparePipelineTemplates(pipelines = {}) {
  return Object.fromEntries(
    Object.entries(pipelines).map(([key, pipeline]) => {
      const fm = pipeline?.fieldMappings || {};
      const userFields = pipeline?.userFields || [];
      const existingExtras = pipeline?.extraFields || [];
      const extraAliases = new Set(existingExtras.map((e) => e.alias));
      // Custom fields ("Champs additionnels" + group-by columns) become
      // extraFields so the backend selects, normalizes and can group on them.
      const derivedExtras = userFields
        .filter(
          (f) => f.key && fm[f.key] && !STANDARD_FIELD_KEYS.has(f.key) && !extraAliases.has(f.key),
        )
        .map((f) => ({ column: fm[f.key], alias: f.key }));
      return [
        key,
        {
          ...pipeline,
          recordType: normalizePipelineRecordType(
            pipeline.recordType,
            key,
            key === "facture" || key === "commande" ? "INVOICE" : "OTHER",
          ),
          enabledChecks: normalizePipelineEnabledChecks(pipeline.enabledChecks),
          extraFields: [...existingExtras, ...derivedExtras],
          groupByCols: effectivePipelineGroupBy(key, pipeline),
        },
      ];
    }),
  );
}

export function computeScore(report) {
  let s = 0;
  if (report?.identity?.name) s += 15;
  if (report?.connection?.jdbcUrl) s += 15;
  if ((report?.tables?.selected || []).length > 0) s += 20;
  if ((report?.tables?.budgetSources || []).length > 0) s += 10;
  if ((report?.tenants || []).length > 0) s += 15;
  if (report?.authentication && Object.keys(report.authentication).length > 0) s += 10;
  if ((report?.pipelines?.factures?.sourceTables || []).length > 0) s += 10;
  if ((report?.pipelines?.commandes?.sourceTables || []).length > 0) s += 5;
  return Math.min(100, s);
}

/* (the old processing-log simulation was removed: the connector report now
   reads the real activation state from /admin/tenant-activations/status) */

/* ─── Q&A FLOW ─────────────────────────────────────────────── */
const AUTH_DETAIL_QUESTIONS = {
  BASIC: [
    {
      id: "qa_basic_user",
      type: "text",
      key: "username",
      bot: () => "Quel est le nom d'utilisateur ?",
      placeholder: "ex: erp_user",
      next: "qa_basic_pw",
    },
    {
      id: "qa_basic_pw",
      type: "text",
      key: "password",
      bot: () => "Mot de passe ?",
      placeholder: "••••••••",
      next: "q_conn",
    },
  ],
  API_KEY: [
    {
      id: "qa_apikey",
      type: "text",
      key: "apiKey",
      bot: () => "Quelle est votre clé API ?",
      placeholder: "sk-xxxx...",
      next: "qa_apikey_header",
    },
    {
      id: "qa_apikey_header",
      type: "text",
      key: "apiKeyHeader",
      bot: () => "Nom du header HTTP pour la clé ? (ex: X-API-Key)",
      placeholder: "X-API-Key",
      next: "q_conn",
    },
  ],
  OAUTH2: [
    {
      id: "qa_oauth_id",
      type: "text",
      key: "clientId",
      bot: () => "Client ID OAuth2 ?",
      placeholder: "client_id_xxx",
      next: "qa_oauth_secret",
    },
    {
      id: "qa_oauth_secret",
      type: "text",
      key: "clientSecret",
      bot: () => "Client Secret ?",
      placeholder: "••••••••",
      next: "qa_oauth_url",
    },
    {
      id: "qa_oauth_url",
      type: "text",
      key: "tokenUrl",
      bot: () => "URL du token endpoint ?",
      placeholder: "https://auth.example.com/oauth/token",
      next: "q_conn",
    },
  ],
  JWT_SIGNED: [
    {
      id: "qa_jwt_key",
      type: "text",
      key: "publicKey",
      bot: () => "Clé publique PEM :",
      placeholder: "-----BEGIN PUBLIC KEY-----",
      next: "qa_jwt_issuer",
    },
    {
      id: "qa_jwt_issuer",
      type: "text",
      key: "issuer",
      bot: () => "Issuer JWT ?",
      placeholder: "https://your-domain.com",
      next: "qa_jwt_algo",
    },
    {
      id: "qa_jwt_algo",
      type: "choice",
      key: "algorithm",
      bot: () => "Algorithme de signature ?",
      options: [
        { label: "RS256", value: "RS256" },
        { label: "RS512", value: "RS512" },
        { label: "ES256", value: "ES256" },
        { label: "HS256", value: "HS256" },
      ],
      next: "q_conn",
    },
  ],
  SAML: [
    {
      id: "qa_saml_entity",
      type: "text",
      key: "entityId",
      bot: () => "Entity ID SAML ?",
      placeholder: "https://erp.example.com/saml/metadata",
      next: "qa_saml_sso",
    },
    {
      id: "qa_saml_sso",
      type: "text",
      key: "ssoUrl",
      bot: () => "URL SSO SAML ?",
      placeholder: "https://idp.example.com/sso",
      next: "q_conn",
    },
  ],
  NONE: [],
};

function buildQAFlow() {
  const base = [
    {
      id: "start",
      type: "mode_pick",
      bot: "Bonjour, je suis votre assistant ERP. Comment souhaitez-vous configurer ce connecteur ?",
      options: [
        {
          label: "Questions / Réponses guidées",
          desc: "Je vous guide étape par étape",
          value: "qa",
        },
        { label: "Formulaire structuré", desc: "Toutes les sections en une page", value: "form" },
        { label: "Import JSON", desc: "Collez votre config JSON existante", value: "json" },
      ],
    },
    {
      id: "q_name",
      type: "text",
      key: "name",
      bot: "Quel est le nom de ce connecteur ERP ?",
      placeholder: "ex: SAP Production France",
      next: "q_type",
    },
    {
      id: "q_type",
      type: "choice",
      key: "connectorType",
      bot: (a) => `Super, «${a.name || "ce système"}». Quel type ?`,
      options: [
        { label: "🏭 ERP (SAP, Sage, Odoo…)", value: "ERP" },
        { label: "🗄️ Source de données SQL", value: "DATA_SOURCE" },
        { label: "📊 Comptabilité standalone", value: "ACCOUNTING" },
      ],
      next: "q_auth",
    },
    {
      id: "q_auth",
      type: "choice",
      key: "authType",
      bot: () => "Quel mode d'authentification utilise ce système ?",
      options: [
        { label: "👤 Basic (user / mot de passe)", value: "BASIC" },
        { label: "🔑 API Key", value: "API_KEY" },
        { label: "🔐 OAuth 2.0", value: "OAUTH2" },
        { label: "📜 JWT Signé", value: "JWT_SIGNED" },
        { label: "🔏 SAML 2.0", value: "SAML" },
        { label: "🚫 Aucune", value: "NONE" },
      ],
      nextFn: (val) => {
        const d = AUTH_DETAIL_QUESTIONS[val] || [];
        return d.length > 0 ? d[0].id : "q_conn";
      },
    },
    ...AUTH_DETAIL_QUESTIONS.BASIC,
    ...AUTH_DETAIL_QUESTIONS.API_KEY,
    ...AUTH_DETAIL_QUESTIONS.OAUTH2,
    ...AUTH_DETAIL_QUESTIONS.JWT_SIGNED,
    ...AUTH_DETAIL_QUESTIONS.SAML,
    {
      id: "q_conn",
      type: "choice",
      key: "connectionType",
      bot: () => "Comment se connecter à la base de données ?",
      options: [
        { label: "🔗 JDBC (base SQL directe)", value: "jdbc" },
        { label: "🌐 API REST", value: "api" },
        { label: "📁 Fichier CSV / Excel", value: "csv" },
      ],
      next: "q_jdbc",
    },
    {
      id: "q_jdbc",
      type: "text",
      key: "jdbcUrl",
      bot: () => "URL JDBC de connexion ?",
      placeholder: "jdbc:postgresql://host:5432/erp_db",
      condition: (d) => d.connectionType === "jdbc",
      next: "q_tables",
    },
    {
      id: "q_tables",
      type: "multi_schema",
      key: "selectedTables",
      bot: (a, s) =>
        s
          ? `Quelles tables importer ? (${s.tables.length} disponibles)`
          : "Listez les tables séparées par des virgules.",
      next: "q_pl_facture",
    },
    {
      id: "q_pl_facture",
      type: "pipeline_facture",
      key: "factureMappings",
      bot: () => "Configurons le pipeline Factures. Mappez les colonnes requises :",
      next: "q_pl_commande",
    },
    {
      id: "q_pl_commande",
      type: "pipeline_commande",
      key: "commandeGroupBy",
      bot: () => "Pipeline Commandes : quelles colonnes pour le Group By ? (optionnel)",
      next: "q_budget_tables",
    },
    {
      id: "q_budget_tables",
      type: "choice_dynamic",
      key: "budgetSourceTables",
      bot: () => "Quelle table contient les allocations budgétaires ?",
      next: "q_tenants",
    },
    {
      id: "q_tenants",
      type: "text",
      key: "_tenantsRaw",
      bot: () => "IDs tenants (clients) séparés par des virgules :",
      placeholder: TENANT_IDS_PLACEHOLDER,
      next: "q_done",
    },
    {
      id: "q_done",
      type: "done",
      bot: (a) =>
        `✅ Configuration complète pour «${a.name || "votre ERP"}» ! Cliquez pour voir le rapport JSON.`,
    },
  ];
  return base;
}

export const QA_FLOW = buildQAFlow();
// Must mirror the real QA_FLOW step ids — a non-existent id (e.g. the old "q_alerts")
// resolves to findIndex === -1 and renders as permanently "done" (green).
export const QA_SIDEBAR_STEPS = [
  { id: "q_name", label: "Nom" },
  { id: "q_type", label: "Type" },
  { id: "q_auth", label: "Authentification" },
  { id: "q_conn", label: "Connexion" },
  { id: "q_jdbc", label: "URL JDBC" },
  { id: "q_tables", label: "Tables" },
  { id: "q_pl_facture", label: "Pipeline Factures" },
  { id: "q_pl_commande", label: "Pipeline Commandes" },
  { id: "q_budget_tables", label: "Budget" },
  { id: "q_tenants", label: "Tenants" },
  { id: "q_done", label: "Rapport" },
];

// ── Field + table-colour helpers (shared across the wizard steps) ──
const fallbackTableColor = { fill: INTEGRATION_COLORS.red, light: "#fca5a5", dark: "#b33b2d" };
export const getTableColor = (index = 0) => {
  const raw = TABLE_PALETTE[index % Math.max(TABLE_PALETTE.length, 1)] || fallbackTableColor.fill;
  if (typeof raw === "string") return { fill: raw, light: raw, dark: raw };
  return {
    fill: raw?.fill || raw?.color || fallbackTableColor.fill,
    light: raw?.light || raw?.fill || raw?.color || fallbackTableColor.light,
    dark: raw?.dark || raw?.fill || raw?.color || fallbackTableColor.dark,
  };
};

export const formatFieldLabel = (key = "") =>
  String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
export const normalizePipelineField = (field) => {
  if (typeof field === "string") return { key: field, label: formatFieldLabel(field) };
  const key = field?.key || "";
  return { ...field, key, label: field?.label || formatFieldLabel(key) };
};

// ── Join helper: derive an ON condition from inferred foreign-key relations ──
export function suggestJoinOn(base, joinTable, rels = []) {
  for (const r of rels || []) {
    if (r.from === base && r.to === joinTable)
      return `${base}.${r.col} = ${joinTable}.${r.toCol || r.col}`;
    if (r.from === joinTable && r.to === base)
      return `${base}.${r.toCol || r.col} = ${joinTable}.${r.col}`;
  }
  return null;
}
