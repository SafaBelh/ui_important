// Pure helpers + the SeriesView local palette (T). Extracted from SeriesView.
import { COLORS } from "@/constants/colors";
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function rhythmLabel(days) {
  if (days >= 350) return "Annuel";
  if (days >= 80) return "Trimestriel";
  if (days >= 25) return "Mensuel";
  if (days >= 12) return "Bimensuel";
  return "Hebdomadaire";
}

export function isCommandePipeline(pipeline) {
  const key = String(pipeline?.templateKey || pipeline?.pipelineType || "").toLowerCase();
  const name = String(pipeline?.name || "").toLowerCase();
  return key === "commande" || name.includes("commande");
}

/* ─── Design tokens (kept in sync with COLORS.* palette) ────────────────── */
export const T = {
  // surfaces
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F4F1",
  // borders
  border: "rgba(0,0,0,.07)",
  borderMid: "rgba(0,0,0,.11)",
  // text
  ink900: "#111111",
  ink700: "#3A3A3A",
  ink500: "#707070",
  ink400: "#9A9A9A",
  ink300: "#BFBFBF",
  // accent
  red: COLORS.red || "#D94F3D",
  success: COLORS.success || "#22C55E",
  info: COLORS.info || "#3B82F6",
  warning: COLORS.warning || "#D8A444",
  // mono
  mono: "inherit",
  // serif
  serif: "var(--font-sans)",
};

/* ─── Toggle ────────────────────────────────────────────────────────── */
