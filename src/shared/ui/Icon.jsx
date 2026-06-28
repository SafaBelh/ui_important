import { memo } from "react";
import { ArrowUpRight, BarChart3, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Eye, EyeOff, FileText, GitBranch, KeyRound, LayoutDashboard, Link2, LogOut, Pause, PauseCircle, Pencil, Play, Plug, Plus, PowerOff, RefreshCw, Search, Settings, Settings2, ShieldAlert, Sparkles, Trash2, TriangleAlert, Users, X as LucideX, Zap } from "lucide-react";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  pipelines: GitBranch,
  explorer: Search,
  anomalies: TriangleAlert,
  alerts: Bell,
  integrations: Link2,
  tenants: Users,
  settings: Settings,
  logout: LogOut,
  collapse: ChevronLeft,
  expand: ChevronRight,
  gear: Settings2,
  sparkle: Sparkles,
  pause: Pause,
  play: Play,
  x: LucideX,
  search: Search,
  bell: Bell,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronUp: ChevronUp,
  triangle: TriangleAlert,
  chart: BarChart3,
  eye: Eye,
  eyeOff: EyeOff,
  copy: Copy,
  check: Check,
  plus: Plus,
  plug: Plug,
  bolt: Zap,
  refresh: RefreshCw,
  edit: Pencil,
  trash: Trash2,
  trash2: Trash2,
  key: KeyRound,
  arrowUpRight: ArrowUpRight,
  fileText: FileText,
  pauseCircle: PauseCircle,
  powerOff: PowerOff,
  shield: ShieldAlert,
};

export const Icon = memo(function Icon({ name, size = 16, color = "currentColor", className, ...props }) {
  const LucideIcon = ICON_MAP[name];
  if (!LucideIcon) return null;
  return <LucideIcon {...props} size={size} color={color} className={className} strokeWidth={2} />;
});
