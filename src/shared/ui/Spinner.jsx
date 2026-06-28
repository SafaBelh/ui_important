import { memo } from "react";
import { COLORS } from "@/constants/colors";

export const Spinner = memo(function Spinner({ size = 20, color = COLORS.red }) {
  return (
  <svg
    className="spinner"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle cx="12" cy="12" r="10" stroke={`${color}30`} strokeWidth="3" />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
  );
});
