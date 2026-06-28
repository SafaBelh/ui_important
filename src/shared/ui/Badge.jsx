import { memo } from "react";

export const Badge = memo(function Badge({ children, type = "mute" }) {
  return (
  <span className={`badge badge-${type}`}>{children}</span>
  );
});
