// Shared constants + input/label styles for the TenantsView forms. Extracted from TenantsView.
import { COLORS } from "@/constants/colors";

export const COLORS_PALETTE = [
  "#D94F3D",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#EC4899",
  "#84CC16",
  "#14B8A6",
];

// ── Shared input style helper ──────────────────────────────────────────────────
export const inputStyle = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  border: `1.5px solid rgba(107,114,128,.18)`,
  background: "rgba(255,255,255,.7)",
  fontSize: 12,
  color: COLORS.grey900,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color .15s",
};

export const labelStyle = {
  fontSize: 9,
  fontWeight: 700,
  color: COLORS.grey500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 5,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

export const softColor = (hex, alpha = "14") => `${hex}${alpha}`;

export function _generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "@$!%*?&";
  const all = upper + lower + digits + special;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}
