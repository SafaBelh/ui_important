export const ALERT_TABS = [
  { id: "toutes", label: "Toutes" },
  { id: "en_attente", label: "En attente" },
  { id: "anomaly", label: "Anomalies" },
  { id: "pipeline", label: "Pipelines" },
  { id: "system", label: "Système" },
];

export const PIPELINE_DASHBOARD_RADAR_METRICS = [
  { metric: "Volume (factures)", fullMark: 100 },
  { metric: "Stabilité (CV)", fullMark: 100 },
  { metric: "Alertes actives", fullMark: 100 },
  { metric: "Taille série", fullMark: 100 },
  { metric: "Tolérance", fullMark: 100 },
];

export const WS_MAPPING_CORE_FIELDS = [
  { k: "amount", lbl: "Montant", req: true, hint: "Valeur numérique de la facture" },
  { k: "date", lbl: "Date facture", req: true, hint: "Date d'émission ou de comptabilisation" },
  { k: "supplier", lbl: "Fournisseur", req: true, hint: "Code ou nom du tiers / fournisseur" },
  { k: "label", lbl: "Libellé / Service", req: false, hint: "Sous-catégorie, service ou description" },
  { k: "tenant", lbl: "Entité / Société", req: false, hint: "Code société ou entité juridique" },
  { k: "status", lbl: "Statut", req: false, hint: "Statut de la pièce" },
  { k: "docref", lbl: "Réf. document", req: false, hint: "Numéro ou référence de la pièce" },
];

export const WS_MAPPING_DEFAULT_COLUMNS = [];

export const ML_RADAR_METRICS = [
  { metric: "Volume", fullMark: 100 },
  { metric: "Stabilité CV", fullMark: 100 },
  { metric: "Taille série", fullMark: 100 },
  { metric: "Tolérance", fullMark: 100 },
  { metric: "Score anomalie", fullMark: 100 },
];

export const ADMIN_PIPELINE_STATUS_DEFS = [
  { status: "Actif", matches: ["actif"], colorKey: "success" },
  { status: "Warning", matches: ["warning"], colorKey: "warning" },
  { status: "Paused", matches: ["draft", "paused"], colorKey: "grey400" },
];

export const ADMIN_RADAR_METRICS = ["Factures", "Anomalies", "Pipelines", "Alertes", "Taux"];

export const CONNECTOR_LABELS = {};

export const CSV_IMPORT_SEQUENCE = [
  { delay: 0, text: "$ anomalyiq import --source csv --validate", color: "#a8d8a8" },
  { delay: 320, text: "  Lecture du fichier…", color: "#94a3b8" },
  { delay: 700, text: "  Parsing en-têtes CSV…", color: "#94a3b8" },
  { delay: 1100, text: "  En-têtes détectés :", color: "#4ade80" },
  { delay: 1350, text: "__FIELDS__", color: "#60a5fa" },
  { delay: 1700, text: "  Validation des types…", color: "#94a3b8" },
  { delay: 2100, text: "  Colonnes montant   → numeric", color: "#4ade80" },
  { delay: 2400, text: "  Colonnes date      → datetime", color: "#4ade80" },
  { delay: 2700, text: "  Colonnes fournisseur → string", color: "#4ade80" },
  { delay: 3000, text: "  Chargement dans la mémoire pipeline…", color: "#94a3b8" },
  { delay: 3400, text: "__ROWS__", color: "#f9a8d4" },
  { delay: 3800, text: "  Import terminé", color: "#4ade80" },
];
