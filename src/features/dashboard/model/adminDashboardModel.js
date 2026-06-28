import { BarChart2, GitBranch, TriangleAlert, Users } from "lucide-react";

export const ADMIN_SECTIONS = [
  { id: "overview", label: "Vue générale", LucideComp: BarChart2 },
  { id: "tenants", label: "Tenants", LucideComp: Users },
  { id: "pipelines", label: "Pipelines", LucideComp: GitBranch },
  { id: "anomalies", label: "Anomalies", LucideComp: TriangleAlert },
];

export function normalizeAnomalyType(value) {
  const raw = String(value || "autre").toLowerCase();
  if (raw === "amount_spike" || raw === "montant") return "montant";
  if (raw === "duplicate" || raw === "doublon") return "doublon";
  if (raw === "frequency" || raw === "fréquence" || raw === "frequence") return "fréquence";
  return raw;
}
