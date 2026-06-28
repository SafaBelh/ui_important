/**
 * The smaller connector-wizard steps (Exploration, Identity, Connection, DataPreview,
 * Summary) plus the schema visualisations (SchemaERD, SchemaForceGraph) they use.
 * Extracted from IntegrationsView; the wizard shell mounts the five exported steps.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AlertCircle, CheckCircle2, Database, FileText, Layers, Link2, Maximize2, Minimize2, Network, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Search, Settings2, Sparkles, Table2, X, Zap } from "lucide-react";
import { CARD_W, MAX_COLS, PAD, ERD_OFFSETS, TABLE_PALETTE, PIPELINE_DEFS, INTEGRATION_CONNECTION_TYPES, CSV_SOURCE_PRESETS, DEFAULT_API_RESOURCE, buildApiSchema, buildCsvSchema, inferColType, normalizeTableName } from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { getTableColor } from "@/features/integrations/utils/wizardHelpers";
import { getPipelineGroupByErrors } from "@/features/integrations/model/PipelineValidation";
import { toConnectorApiPayload } from "@/features/integrations/api/connectorApi";
import { previewConnectorTable, previewUnsavedConnectorTable } from "@/features/integrations/api/IntegrationAdminApi";
import { InfoBox } from "@/features/integrations/components/WizardUiPrimitives";
import styles from "./WizardSteps.module.css";

const UNITLESS_STYLE_PROPS = new Set(["animationIterationCount", "aspectRatio", "borderImageOutset", "borderImageSlice", "borderImageWidth", "boxFlex", "boxFlexGroup", "boxOrdinalGroup", "columnCount", "columns", "flex", "flexGrow", "flexPositive", "flexShrink", "flexNegative", "flexOrder", "gridArea", "gridRow", "gridRowEnd", "gridRowSpan", "gridRowStart", "gridColumn", "gridColumnEnd", "gridColumnSpan", "gridColumnStart", "fontWeight", "lineClamp", "lineHeight", "opacity", "order", "orphans", "tabSize", "widows", "zIndex", "zoom"]);
const setRefNode = (ref, node) => {if (typeof ref === "function") ref(node);else if (ref) ref.current = node;};
const applyNodeStyle = (node, styles) => {if (!node || !styles) return;Object.entries(styles).forEach(([key, value]) => {if (value == null || value === false) {node.style[key] = "";return;}node.style[key] = typeof value === "number" && !UNITLESS_STYLE_PROPS.has(key) ? value + "px" : String(value);});};
function SchemaERD({ schema, tableRoles: _tableRoles, onSelectTable, selectedTable, height = 480, fullscreen = false }) {
  const [search, setSearch] = useState("");
  const [selectedRel, setSelectedRel] = useState(null);
  const [hoveredTable, setHoveredTable] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const viewportRef = useRef();
  const panRef = useRef({ isPanning: false, startX: 0, startY: 0, camX: 0, camY: 0 });
  const cardDragRef = useRef(null);
  const skipCardClickRef = useRef(false);
  const [cam, setCam] = useState({ x: 30, y: 30, scale: 0.88 });
  const tableNames = useMemo(() => schema?.tables?.map((t) => t.name) || [], [schema?.tables]);
  const tables = useMemo(() => {
    const next = {};
    schema?.tables?.forEach((t) => {next[t.name] = t;});
    return next;
  }, [schema?.tables]);
  const relationships = useMemo(() => schema?.rels || [], [schema?.rels]);
  const highlighted = useMemo(() => {if (!search) return new Set();const q = search.toLowerCase();return new Set(tableNames.filter((n) => n.toLowerCase().includes(q)));}, [search, tableNames]);
  const initialCardPositions = useMemo(() => Object.fromEntries(tableNames.map((name, i) => {const off = ERD_OFFSETS[i] || { x: i % 4 * 220, y: Math.floor(i / 4) * 290 };return [name, { x: PAD + off.x, y: PAD + off.y }];})), [tableNames]);
  const [cardPositions, setCardPositions] = useState(initialCardPositions);
  useEffect(() => {setCardPositions(initialCardPositions);}, [initialCardPositions]);
  const cardHeight = (name) => {const t = tables[name];if (!t) return 80;return 36 + Math.min(t.cols.length, MAX_COLS) * 20 + (t.cols.length > MAX_COLS ? 18 : 4);};
  const canvasW = Math.max(...(tableNames.length ? tableNames.map((_, i) => {const off = ERD_OFFSETS[i] || { x: i % 4 * 220, y: 0 };return PAD + off.x + CARD_W + PAD * 3;}) : [900]), 900);
  const canvasH = Math.max(...(tableNames.length ? tableNames.map((name, i) => {const off = ERD_OFFSETS[i] || { x: 0, y: Math.floor(i / 4) * 290 };return PAD + off.y + cardHeight(name) + PAD * 3;}) : [600]), 600);
  const fitView = useCallback(() => {const vp = viewportRef.current;if (!vp) return;const W = vp.clientWidth,H = vp.clientHeight;if (fullscreen) {setCam({ scale: 1, x: 28, y: 42 });return;}const scale = Math.min((W - 60) / canvasW, (H - 60) / canvasH, 1);setCam({ scale, x: (W - canvasW * scale) / 2, y: (H - canvasH * scale) / 2 });}, [canvasW, canvasH, fullscreen]);
  useEffect(() => {fitView();}, [tableNames.length, fullscreen, fitView]);
  const onMouseDown = useCallback((e) => {if (e.target.closest(".erd-table-card")) return;panRef.current = { isPanning: true, startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };viewportRef.current.style.cursor = "grabbing";e.preventDefault();}, [cam]);
  const onMouseMove = useCallback((e) => {if (cardDragRef.current) {const drag = cardDragRef.current;const dx = (e.clientX - drag.startX) / cam.scale;const dy = (e.clientY - drag.startY) / cam.scale;if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;setCardPositions((prev) => ({ ...prev, [drag.name]: { x: drag.posX + dx, y: drag.posY + dy } }));return;}if (!panRef.current.isPanning) return;setCam((c) => ({ ...c, x: panRef.current.camX + (e.clientX - panRef.current.startX), y: panRef.current.camY + (e.clientY - panRef.current.startY) }));}, [cam.scale]);
  const onMouseUp = useCallback(() => {if (cardDragRef.current?.moved) skipCardClickRef.current = true;cardDragRef.current = null;panRef.current.isPanning = false;if (viewportRef.current) viewportRef.current.style.cursor = "grab";}, []);
  const onWheel = useCallback((e) => {e.preventDefault();const rect = viewportRef.current.getBoundingClientRect();const mx = e.clientX - rect.left,my = e.clientY - rect.top,delta = e.deltaY > 0 ? 0.9 : 1.11;setCam((c) => {const ns = Math.max(0.25, Math.min(2.5, c.scale * delta));const wx = (mx - c.x) / c.scale,wy = (my - c.y) / c.scale;return { scale: ns, x: mx - wx * ns, y: my - wy * ns };});}, []);
  useEffect(() => {const el = viewportRef.current;if (!el) return;el.addEventListener("wheel", onWheel, { passive: false });return () => el.removeEventListener("wheel", onWheel);}, [onWheel]);
  if (!schema || !tableNames.length) return <div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", justifyContent: "center", height, background: INTEGRATION_COLORS.canvas, borderRadius: 14, color: "rgba(255,255,255,.18)", fontSize: 13, flexDirection: "column", gap: 10 })}><Database size={32} ref={(el) => applyNodeStyle(el, { opacity: .2 })} /><span>Aucune table sélectionnée</span></div>;
  return (
    <div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 0, position: "relative", background: INTEGRATION_COLORS.canvas, borderRadius: fullscreen ? 0 : "0 0 14px 14px", overflow: "hidden" })}>
      <div ref={(el) => applyNodeStyle(el, { flex: 1, background: INTEGRATION_COLORS.canvas, borderRadius: fullscreen ? 0 : "0 0 14px 14px", overflow: "hidden", position: "relative", minHeight: height })}>
        <div ref={(el) => {setRefNode(viewportRef, el);applyNodeStyle(el, { height, overflow: "hidden", cursor: "grab", position: "relative", userSelect: "none" });}} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <div ref={(el) => applyNodeStyle(el, { position: "absolute", transformOrigin: "0 0", willChange: "transform", transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.scale})`, width: canvasW, height: canvasH })}>
            <svg ref={(el) => applyNodeStyle(el, { position: "absolute", inset: 0, width: canvasW, height: canvasH, pointerEvents: "auto", overflow: "visible", zIndex: 2 })}>
              <defs><marker id="erd-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="rgba(217,79,61,.55)" /></marker><marker id="erd-arr-act" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#D94F3D" /></marker></defs>
              {relationships.map((rel, i) => {const isActive = selectedRel === i || hoveredTable && (hoveredTable === rel.from || hoveredTable === rel.to);const fp = cardPositions[rel.from],tp = cardPositions[rel.to];if (!fp || !tp) return null;const fr = fp.x < tp.x,fh = cardHeight(rel.from),th = cardHeight(rel.to);const ax1 = fp.x + (fr ? CARD_W : 0),ay1 = fp.y + fh / 2,ax2 = tp.x + (fr ? 0 : CARD_W),ay2 = tp.y + th / 2;const cp = Math.abs(ax2 - ax1) * 0.42;const d = `M${ax1} ${ay1} C${ax1 + (fr ? cp : -cp)} ${ay1},${ax2 + (fr ? -cp : cp)} ${ay2},${ax2} ${ay2}`;return <g key={i} onClick={() => setSelectedRel(selectedRel === i ? null : i)} ref={(el) => applyNodeStyle(el, { pointerEvents: "all", cursor: "pointer" })}><path d={d} fill="none" stroke="transparent" strokeWidth={10} />{isActive && <path d={d} fill="none" stroke="rgba(217,79,61,.15)" strokeWidth={5} />}<path d={d} fill="none" stroke={isActive ? "#D94F3D" : "rgba(217,79,61,.38)"} strokeWidth={isActive ? 1.8 : 1.1} markerEnd={`url(#${isActive ? "erd-arr-act" : "erd-arr"})`} />{isActive && (() => {const mx = (ax1 + ax2) / 2,my = (ay1 + ay2) / 2 - 2,lw = rel.col.length * 5 + 16;return <g><rect x={mx - lw / 2} y={my - 8} width={lw} height={15} rx={4} fill="rgba(10,10,14,.94)" stroke="rgba(217,79,61,.3)" strokeWidth={0.7} /><text x={mx} y={my + 4} textAnchor="middle" fill="#fca5a5" fontSize={8} fontFamily="inherit">{rel.col}</text></g>;})()}</g>;})}
            </svg>
            <div ref={(el) => applyNodeStyle(el, { position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle,rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none", zIndex: 1 })} />
            {tableNames.map((name, i) => {const pos = cardPositions[name],color = TABLE_PALETTE[i % TABLE_PALETTE.length],t = tables[name];const isHl = highlighted.has(name) || hoveredTable === name || selectedRel !== null && (relationships[selectedRel]?.from === name || relationships[selectedRel]?.to === name) || selectedTable === name;return <div key={name} className={`erd-table-card${isHl ? " highlighted" : ""}`} onMouseDown={(e) => {e.stopPropagation();cardDragRef.current = { name, startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y, moved: false };}} onMouseEnter={() => setHoveredTable(name)} onMouseLeave={() => setHoveredTable(null)} onClick={() => {if (skipCardClickRef.current) {skipCardClickRef.current = false;return;}onSelectTable(selectedTable === name ? null : name);}} ref={(el) => applyNodeStyle(el, { left: pos.x, top: pos.y })}><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderBottom: `1px solid ${color.fill}40` })}><div ref={(el) => applyNodeStyle(el, { width: 20, height: 20, borderRadius: 5, background: color.dark, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 })}><Database size={10} color="#fff" /></div><div ref={(el) => applyNodeStyle(el, { fontSize: 10, fontWeight: 600, color: "#e4e4e7", fontFamily: "inherit", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{name}</div><div ref={(el) => applyNodeStyle(el, { fontSize: 9, color: "#52525b", fontFamily: "inherit" })}>{t.rowCount > 1000 ? (t.rowCount / 1000).toFixed(0) + "k" : t.rowCount}</div></div>{t.cols.slice(0, MAX_COLS).map((col) => {const ct = inferColType(col);const isLinked = relationships.some((r) => r.col === col && (r.from === name || r.to === name));return <div key={col} ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 5, padding: "3.5px 10px", fontSize: 9, borderBottom: "1px solid rgba(255,255,255,.025)" })}>{ct === "pk" ? <span ref={(el) => applyNodeStyle(el, { fontSize: 9 })}>🔑</span> : isLinked ? <Link2 size={8} color="#5eead4" ref={(el) => applyNodeStyle(el, { flexShrink: 0 })} /> : <span ref={(el) => applyNodeStyle(el, { width: 7, height: 7, borderRadius: 2, border: "1px solid rgba(255,255,255,.1)", display: "inline-block", flexShrink: 0 })} />}<span ref={(el) => applyNodeStyle(el, { fontFamily: "inherit", color: ct === "pk" ? "#fcd34d" : isLinked ? "#5eead4" : "#a1a1aa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9 })}>{col}</span></div>;})}{t.cols.length > MAX_COLS && <div ref={(el) => applyNodeStyle(el, { padding: "2px 10px 4px", fontSize: 8, color: "#52525b" })}>+{t.cols.length - MAX_COLS} more</div>}</div>;})}
          </div>
        </div>
        <div className="erd-search-bar"><Search size={11} color="#52525b" /><input className="erd-search-input" placeholder="Rechercher table…" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button onClick={() => setSearch("")} ref={(el) => applyNodeStyle(el, { background: "none", border: "none", color: "#71717a", cursor: "pointer" })}><X size={10} /></button>}</div>
        <div className="erd-zoom-controls"><button className="erd-zoom-btn" onClick={() => setCam((c) => ({ ...c, scale: Math.min(2.5, c.scale * 1.2) }))}>+</button><button className="erd-zoom-btn" onClick={fitView} ref={(el) => applyNodeStyle(el, { fontSize: 10 })}>⊡</button><button className="erd-zoom-btn" onClick={() => setCam((c) => ({ ...c, scale: Math.max(0.25, c.scale * 0.85) }))}>−</button></div>
        <button className="erd-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)}>{sidebarOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}</button>
      </div>
      <div className={`erd-sidebar-wrap ${sidebarOpen ? "open" : "closed"}`}>
        <div ref={(el) => applyNodeStyle(el, { width: 260, display: "flex", flexDirection: "column" })}>
          <div className="rel-sidebar" ref={(el) => applyNodeStyle(el, { maxHeight: height, overflowY: "auto" })}>
            <div className="rel-sidebar-header"><span>Relations</span><span className="rel-sidebar-count">{relationships.length}</span></div>
            {relationships.length === 0 ? <div ref={(el) => applyNodeStyle(el, { padding: 14, fontSize: 11, color: "#71717a" })}>Aucune relation détectée.</div> : relationships.map((rel, i) => <div key={`${rel.from}-${rel.to}-${i}`} className={`rel-sidebar-item${selectedRel === i ? " active" : ""}`} onClick={() => setSelectedRel(selectedRel === i ? null : i)}><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 })}><span ref={(el) => applyNodeStyle(el, { fontSize: 9, textTransform: "uppercase", letterSpacing: ".07em", color: "#71717a" })}>{rel.type || "N:1"}</span><span ref={(el) => applyNodeStyle(el, { fontSize: 10, fontFamily: "inherit", color: INTEGRATION_COLORS.red, fontWeight: 700 })}>{rel.col}</span></div><div ref={(el) => applyNodeStyle(el, { fontFamily: "inherit", fontSize: 10.5 })}><div ref={(el) => applyNodeStyle(el, { color: "#5eead4" })}>{rel.from}</div><div ref={(el) => applyNodeStyle(el, { color: "#71717a", marginTop: 1 })}>→ <span ref={(el) => applyNodeStyle(el, { color: "#fca5a5" })}>{rel.to}</span></div></div></div>)}
          </div>
        </div>
      </div>
    </div>);

}

function SchemaForceGraph({ schema, onSelectTable, selectedTable, height = 460, fullscreen = false }) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const stateRef = useRef({ nodes: [], edges: [], cam: { x: 0, y: 0, scale: 1 }, drag: null, hover: null, selected: null, panStart: null, panCam: null, physicsOn: true, showLabels: false, tick: 0, particles: [], raf: null, W: 0, H: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [physicsOn, setPhysicsOn] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const tables = useMemo(() => schema?.tables || [], [schema?.tables]);
  const rels = useMemo(() => schema?.rels || [], [schema?.rels]);
  const fitView = useCallback(() => {const s = stateRef.current;const canvas = canvasRef.current;if (!canvas || !s.nodes.length) return;const xs = s.nodes.map((n) => n.x),ys = s.nodes.map((n) => n.y);const minX = Math.min(...xs) - 130,maxX = Math.max(...xs) + 130;const minY = Math.min(...ys) - 130,maxY = Math.max(...ys) + 130;const scale = Math.min(canvas.clientWidth * .85 / Math.max(1, maxX - minX), canvas.clientHeight * .8 / Math.max(1, maxY - minY), 1.6);s.cam.scale = scale;s.cam.x = canvas.clientWidth / 2 - (minX + maxX) / 2 * scale;s.cam.y = canvas.clientHeight / 2 - (minY + maxY) / 2 * scale;}, []);
  useEffect(() => {stateRef.current.physicsOn = physicsOn;}, [physicsOn]);
  useEffect(() => {stateRef.current.showLabels = showLabels;}, [showLabels]);
  useEffect(() => {const canvas = canvasRef.current;if (!canvas || !tables.length) return;const rect = canvas.parentElement.getBoundingClientRect();const cx = rect.width / 2,cy = Math.max(480, rect.height - 52) / 2;const r = Math.min(rect.width, Math.max(480, rect.height - 52)) * .38;const s = stateRef.current;s.nodes = tables.map((table, i) => {const angle = tables.length <= 1 ? -Math.PI / 2 : i / tables.length * Math.PI * 2 - Math.PI / 2;return { id: table.name, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0, fx: 0, fy: 0, headers: table.cols || [], rowCount: table.rowCount || 0, color: getTableColor(i), r: 58 };});s.edges = rels.map((rel) => ({ from: rel.from, to: rel.to, column: rel.col, type: rel.type || "N:1", fromN: s.nodes.find((n) => n.id === rel.from), toN: s.nodes.find((n) => n.id === rel.to) })).filter((e) => e.fromN && e.toN);s.selected = selectedTable ? s.nodes.find((n) => n.id === selectedTable) || null : null;setSelectedNode(s.selected);setPanelOpen(!!s.selected);fitView();}, [tables, rels, schema, selectedTable, fitView]);
  useEffect(() => {
    const canvas = canvasRef.current,minimap = minimapRef.current;
    if (!canvas || !minimap) return;
    const ctx = canvas.getContext("2d"),mctx = minimap.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const s = stateRef.current;
    const resize = () => {const rect = canvas.parentElement.getBoundingClientRect();s.W = rect.width;s.H = Math.max(480, rect.height - 52);canvas.width = s.W * dpr;canvas.height = s.H * dpr;canvas.style.width = s.W + "px";canvas.style.height = s.H + "px";ctx.setTransform(dpr, 0, 0, dpr, 0, 0);minimap.width = 96 * dpr;minimap.height = 66 * dpr;minimap.style.width = "96px";minimap.style.height = "66px";mctx.setTransform(dpr, 0, 0, dpr, 0, 0);};
    const roundRect = (x, y, w, h, radius) => {ctx.beginPath();ctx.moveTo(x + radius, y);ctx.lineTo(x + w - radius, y);ctx.quadraticCurveTo(x + w, y, x + w, y + radius);ctx.lineTo(x + w, y + h - radius);ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);ctx.lineTo(x + radius, y + h);ctx.quadraticCurveTo(x, y + h, x, y + h - radius);ctx.lineTo(x, y + radius);ctx.quadraticCurveTo(x, y, x + radius, y);ctx.closePath();};
    const applyPhysics = () => {if (!s.physicsOn) return;const repulse = 22000,springK = .022,damping = .88,centerK = .002;const totalKE = s.nodes.reduce((sum, n) => sum + n.vx * n.vx + n.vy * n.vy, 0);if (totalKE < .08 && s.tick > 120) {s.physicsOn = false;return;}s.nodes.forEach((n, i) => {let fx = 0,fy = 0;s.nodes.forEach((o, j) => {if (i === j) return;const dx = n.x - o.x,dy = n.y - o.y,d = Math.sqrt(dx * dx + dy * dy) || 1;const f = d < n.r + o.r + 120 ? repulse * 2 / (d * d) : repulse / (d * d);fx += dx / d * f;fy += dy / d * f;});n.fx = fx + (s.W / 2 - n.x) * centerK;n.fy = fy + (s.H / 2 - n.y) * centerK;});s.edges.forEach((e) => {const dx = e.toN.x - e.fromN.x,dy = e.toN.y - e.fromN.y,d = Math.sqrt(dx * dx + dy * dy) || 1;const f = (d - 300) * springK,efx = dx / d * f,efy = dy / d * f;e.fromN.fx += efx;e.fromN.fy += efy;e.toN.fx -= efx;e.toN.fy -= efy;});s.nodes.forEach((n) => {if (n === s.drag) return;n.vx = Math.max(-6, Math.min(6, (n.vx + n.fx) * damping));n.vy = Math.max(-6, Math.min(6, (n.vy + n.fy) * damping));n.x += n.vx;n.y += n.vy;});};
    const draw = () => {
      ctx.clearRect(0, 0, s.W, s.H);ctx.save();ctx.translate(s.cam.x, s.cam.y);ctx.scale(s.cam.scale, s.cam.scale);
      const gs = 56,ox = -s.cam.x / s.cam.scale,oy = -s.cam.y / s.cam.scale,vw = s.W / s.cam.scale,vh = s.H / s.cam.scale;
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let gx = Math.floor(ox / gs) * gs; gx < ox + vw + gs; gx += gs) for (let gy = Math.floor(oy / gs) * gs; gy < oy + vh + gs; gy += gs) {ctx.beginPath();ctx.arc(gx, gy, 1, 0, Math.PI * 2);ctx.fill();}
      s.edges.forEach((e) => {const f = e.fromN,t = e.toN,dx = t.x - f.x,dy = t.y - f.y,d = Math.sqrt(dx * dx + dy * dy) || 1,nx = dx / d,ny = dy / d;const x1 = f.x + nx * f.r,y1 = f.y + ny * f.r,x2 = t.x - nx * t.r - nx * 8,y2 = t.y - ny * t.r - ny * 8;const active = s.selected && (s.selected.id === f.id || s.selected.id === t.id);if (active) {ctx.beginPath();ctx.moveTo(x1, y1);ctx.lineTo(x2, y2);ctx.strokeStyle = f.color.fill + "44";ctx.lineWidth = 6;ctx.stroke();}ctx.setLineDash(e.type === "N:M" ? [6, 4] : []);ctx.beginPath();ctx.moveTo(x1, y1);ctx.lineTo(x2, y2);ctx.strokeStyle = active ? f.color.fill : "rgba(217,79,61,.34)";ctx.lineWidth = active ? 1.8 : 1;ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x2, y2);ctx.lineTo(x2 - nx * 9 - ny * 4.5, y2 - ny * 9 + nx * 4.5);ctx.lineTo(x2 - nx * 9 + ny * 4.5, y2 - ny * 9 - nx * 4.5);ctx.closePath();ctx.fillStyle = active ? f.color.fill : "rgba(217,79,61,.50)";ctx.fill();{const mx = (x1 + x2) / 2,my = (y1 + y2) / 2,off = active ? 0 : 8,lx = mx - ny * off,ly = my + nx * off;ctx.font = `${active ? 600 : 500} ${active ? 10 : 9}px inherit`;const tw = ctx.measureText(e.column).width + 16;ctx.fillStyle = active ? "rgba(10,10,14,.92)" : "rgba(10,10,14,.72)";roundRect(lx - tw / 2, ly - 10, tw, 18, 5);ctx.fill();ctx.strokeStyle = active ? f.color.fill + "66" : "rgba(217,79,61,.22)";ctx.lineWidth = .8;ctx.stroke();ctx.fillStyle = active ? f.color.light : "rgba(252,165,165,.72)";ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.fillText(e.column, lx, ly);}});
      s.nodes.forEach((n) => {const active = s.selected === n,hover = s.hover === n;ctx.save();ctx.translate(n.x, n.y);if (active || hover) {const g = ctx.createRadialGradient(0, 0, n.r * .6, 0, 0, n.r * 2.2);g.addColorStop(0, n.color.fill + (active ? "50" : "30"));g.addColorStop(1, "transparent");ctx.beginPath();ctx.arc(0, 0, n.r * 2.2, 0, Math.PI * 2);ctx.fillStyle = g;ctx.fill();}const phase = (s.tick * .018 + s.nodes.indexOf(n) * 1.1) % (Math.PI * 2);ctx.beginPath();ctx.arc(0, 0, n.r + 6 + Math.sin(phase) * 3, 0, Math.PI * 2);ctx.strokeStyle = n.color.fill;ctx.lineWidth = .7;ctx.globalAlpha = .18 + Math.sin(phase) * .08;ctx.stroke();ctx.globalAlpha = 1;ctx.beginPath();ctx.arc(0, 0, n.r, 0, Math.PI * 2);const grad = ctx.createRadialGradient(-n.r * .25, -n.r * .25, 0, 0, 0, n.r);grad.addColorStop(0, n.color.fill + "2a");grad.addColorStop(1, "#0a0a12");ctx.fillStyle = grad;ctx.fill();ctx.strokeStyle = n.color.fill;ctx.lineWidth = active ? 2 : 1.5;ctx.globalAlpha = active ? 1 : .75;ctx.stroke();ctx.globalAlpha = 1;ctx.beginPath();ctx.arc(0, 0, 4, 0, Math.PI * 2);ctx.fillStyle = n.color.fill + "cc";ctx.fill();ctx.font = "600 11px 'DM Sans',sans-serif";ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.fillStyle = n.color.light;const words = n.id.replace(/_/g, " ").split(" ");if (words.length > 1) {ctx.fillText(words[0], 0, -12);ctx.fillText(words.slice(1).join(" "), 0, 4);} else ctx.fillText(n.id, 0, -7);ctx.font = "500 9px inherit";ctx.fillStyle = "rgba(255,255,255,.48)";ctx.fillText(`${n.rowCount} lignes`, 0, 18);if (s.showLabels) {const linked = new Set(s.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => e.column));const labelFont = Math.max(10, Math.min(15, 10 + s.cam.scale * 2.5));n.headers.slice(0, 7).forEach((col, ci, cols) => {const a = -Math.PI * .7 + ci * (Math.PI * 1.4 / Math.max(cols.length - 1, 1)),cr = n.r + 58,x = Math.cos(a) * cr,y = Math.sin(a) * cr,isLink = linked.has(col);ctx.beginPath();ctx.moveTo(Math.cos(a) * n.r, Math.sin(a) * n.r);ctx.lineTo(x, y);ctx.strokeStyle = isLink ? "#34d399" : "rgba(255,255,255,.12)";ctx.stroke();ctx.beginPath();ctx.arc(x, y, isLink ? 4 : 3, 0, Math.PI * 2);ctx.fillStyle = isLink ? "#34d399" : "rgba(255,255,255,.2)";ctx.fill();ctx.font = `500 ${labelFont}px inherit`;ctx.fillStyle = isLink ? "#6ee7b7" : "rgba(255,255,255,.48)";ctx.textAlign = Math.cos(a) > .1 ? "left" : Math.cos(a) < -.1 ? "right" : "center";ctx.fillText(col.length > 18 ? col.slice(0, 18) + "..." : col, x + Math.cos(a) * 8, y + Math.sin(a) * 8);});}ctx.restore();});
      ctx.restore();
      mctx.clearRect(0, 0, 96, 66);mctx.fillStyle = "rgba(13,13,18,.72)";mctx.fillRect(0, 0, 96, 66);
      if (s.nodes.length) {const xs = s.nodes.map((n) => n.x),ys = s.nodes.map((n) => n.y),minX = Math.min(...xs) - 70,maxX = Math.max(...xs) + 70,minY = Math.min(...ys) - 70,maxY = Math.max(...ys) + 70,ms = Math.min(86 / Math.max(1, maxX - minX), 58 / Math.max(1, maxY - minY));s.edges.forEach((e) => {mctx.beginPath();mctx.moveTo(5 + (e.fromN.x - minX) * ms, 4 + (e.fromN.y - minY) * ms);mctx.lineTo(5 + (e.toN.x - minX) * ms, 4 + (e.toN.y - minY) * ms);mctx.strokeStyle = "rgba(217,79,61,.35)";mctx.stroke();});s.nodes.forEach((n) => {mctx.beginPath();mctx.arc(5 + (n.x - minX) * ms, 4 + (n.y - minY) * ms, 4, 0, Math.PI * 2);mctx.fillStyle = n.color.fill;mctx.fill();});}
    };
    const loop = () => {s.tick++;applyPhysics();draw();s.raf = requestAnimationFrame(loop);};
    const ro = new ResizeObserver(() => {resize();fitView();});ro.observe(canvas.parentElement);resize();fitView();loop();
    return () => {cancelAnimationFrame(s.raf);ro.disconnect();};
  }, [fitView]);
  const screenToWorld = useCallback((sx, sy) => {const s = stateRef.current;return { x: (sx - s.cam.x) / s.cam.scale, y: (sy - s.cam.y) / s.cam.scale };}, []);
  const nodeAt = useCallback((x, y) => stateRef.current.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 10) || null, []);
  const handleMouseDown = (e) => {const rect = canvasRef.current.getBoundingClientRect(),sx = e.clientX - rect.left,sy = e.clientY - rect.top,w = screenToWorld(sx, sy),n = nodeAt(w.x, w.y),s = stateRef.current;if (n) {s.drag = n;s.dragStart = { x: sx, y: sy };n.vx = 0;n.vy = 0;} else {s.panStart = { x: sx, y: sy };s.panCam = { ...s.cam };}};
  const handleMouseMove = (e) => {const rect = canvasRef.current.getBoundingClientRect(),sx = e.clientX - rect.left,sy = e.clientY - rect.top,w = screenToWorld(sx, sy),s = stateRef.current;if (s.drag) {s.drag.x = w.x;s.drag.y = w.y;return;}if (s.panStart) {s.cam.x = s.panCam.x + sx - s.panStart.x;s.cam.y = s.panCam.y + sy - s.panStart.y;return;}s.hover = nodeAt(w.x, w.y);canvasRef.current.style.cursor = s.hover ? "pointer" : "grab";};
  const handleMouseUp = (e) => {const s = stateRef.current;if (s.drag && s.dragStart) {const rect = canvasRef.current.getBoundingClientRect(),sx = e.clientX - rect.left,sy = e.clientY - rect.top;if (Math.abs(sx - s.dragStart.x) + Math.abs(sy - s.dragStart.y) < 6) {s.selected = s.selected === s.drag ? null : s.drag;setSelectedNode(s.selected);setPanelOpen(!!s.selected);onSelectTable(s.selected?.id || null);}}s.drag = null;s.panStart = null;s.dragStart = null;};
  const handleWheel = useCallback((e) => {e.preventDefault();const rect = canvasRef.current.getBoundingClientRect(),sx = e.clientX - rect.left,sy = e.clientY - rect.top,before = screenToWorld(sx, sy),s = stateRef.current;s.cam.scale = Math.max(.25, Math.min(3.5, s.cam.scale * (e.deltaY < 0 ? 1.12 : .9)));const after = screenToWorld(sx, sy);s.cam.x += (after.x - before.x) * s.cam.scale;s.cam.y += (after.y - before.y) * s.cam.scale;}, [screenToWorld]);
  useEffect(() => {const canvas = canvasRef.current;if (!canvas) return;canvas.addEventListener("wheel", handleWheel, { passive: false });return () => canvas.removeEventListener("wheel", handleWheel);}, [handleWheel]);
  if (!tables.length) return <div ref={(el) => applyNodeStyle(el, { height, background: INTEGRATION_COLORS.canvas, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.28)", flexDirection: "column", gap: 10 })}><Network size={32} ref={(el) => applyNodeStyle(el, { opacity: .3 })} /><span ref={(el) => applyNodeStyle(el, { fontSize: 13 })}>Aucune table à afficher</span></div>;
  const nodeRels = selectedNode ? stateRef.current.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id) : [];
  const linkedCols = new Set(nodeRels.map((e) => e.column));
  return (
    <div className="force-canvas-root" ref={(el) => applyNodeStyle(el, { height, border: "1px solid rgba(255,255,255,.07)", borderTop: 0, borderRadius: fullscreen ? 0 : "0 0 14px 14px" })}>
      <canvas ref={(el) => {setRefNode(canvasRef, el);applyNodeStyle(el, { display: "block", cursor: "grab" });}} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
      <div className={`graph-panel${panelOpen ? "" : " closed"}`}>
        {selectedNode && <><div className="graph-panel-header"><div ref={(el) => applyNodeStyle(el, { width: 10, height: 10, borderRadius: "50%", background: selectedNode.color.fill, flexShrink: 0 })} /><div ref={(el) => applyNodeStyle(el, { fontSize: 12, fontWeight: 700, color: "#e4e4e7", flex: 1, fontFamily: "inherit" })}>{selectedNode.id}</div><button onClick={() => {stateRef.current.selected = null;setSelectedNode(null);setPanelOpen(false);onSelectTable(null);}} ref={(el) => applyNodeStyle(el, { background: "none", border: "none", color: "#71717a", cursor: "pointer" })}><X size={13} /></button></div><div className="graph-panel-body"><div ref={(el) => applyNodeStyle(el, { fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase" })}>Aperçu</div>{[["Colonnes", selectedNode.headers.length], ["Lignes", selectedNode.rowCount.toLocaleString("fr-FR")], ["Relations", nodeRels.length]].map(([k, v]) => <div key={k} ref={(el) => applyNodeStyle(el, { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 12 })}><span ref={(el) => applyNodeStyle(el, { color: "#a1a1aa" })}>{k}</span><span ref={(el) => applyNodeStyle(el, { fontFamily: "inherit", color: "#fca5a5", fontSize: 11 })}>{v}</span></div>)}<div ref={(el) => applyNodeStyle(el, { display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 })}>{selectedNode.headers.map((col) => <span key={col} ref={(el) => applyNodeStyle(el, { padding: "2px 7px", borderRadius: 5, fontSize: 9, fontFamily: "inherit", background: linkedCols.has(col) ? "rgba(52,211,153,.12)" : "rgba(255,255,255,.04)", color: linkedCols.has(col) ? "#34d399" : "#a1a1aa", border: linkedCols.has(col) ? "1px solid rgba(52,211,153,.25)" : "1px solid rgba(255,255,255,.07)" })}>{col.length > 15 ? col.slice(0, 15) + "..." : col}</span>)}</div></div></>}
      </div>
      <div className="graph-legend"><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" })}><div ref={(el) => applyNodeStyle(el, { width: 7, height: 7, borderRadius: "50%", background: INTEGRATION_COLORS.red })} />Table</div><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#71717a" })}><div ref={(el) => applyNodeStyle(el, { width: 7, height: 7, borderRadius: "50%", background: "#34d399" })} />Colonne liée</div><div className="graph-control-cluster"><button className={`graph-btn${physicsOn ? " active" : ""}`} onClick={() => setPhysicsOn((p) => !p)}>Physics</button><button className={`graph-btn${showLabels ? " active" : ""}`} onClick={() => setShowLabels((p) => !p)}>Colonnes</button><button className="graph-btn" onClick={fitView}>Ajuster</button></div></div>
      <canvas ref={minimapRef} className="graph-minimap" />
      <div className="graph-hint">Glisser · molette pour zoomer · clic pour inspecter</div>
    </div>);

}

/* ─── WIZARD STEPS ──────────────────────────────────────────── */
export function ExplorationStep({ data, setData: _setData, schema, selectedTable, setSelectedTable }) {
  const [graphView, setGraphView] = useState("erd");
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  useEffect(() => {document.body.classList.toggle("integration-graph-fullscreen", graphFullscreen);return () => document.body.classList.remove("integration-graph-fullscreen");}, [graphFullscreen]);
  const tableInfo = schema?.tables?.find((t) => t.name === selectedTable);
  const graphHeight = graphFullscreen ? Math.max(window.innerHeight - 43, 520) : 460;
  const graphShellStyle = graphFullscreen ? { position: "fixed", inset: 0, zIndex: 10020, borderRadius: 0, overflow: "hidden", background: INTEGRATION_COLORS.canvas, boxShadow: "none" } : { borderRadius: 14, overflow: "hidden" };
  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.info}>Schéma filtré — <strong>{schema?.tables?.length || 0} tables</strong> · <strong>{schema?.rels?.length || 0} relations</strong></InfoBox>
      <div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 10 })}>
        <div className="tab-bar">
          <button className={`tab${graphView === "erd" ? " active" : ""}`} onClick={() => setGraphView("erd")}><span ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 5 })}><Table2 size={12} /> Vue ERD</span></button>
          <button className={`tab${graphView === "force" ? " active" : ""}`} onClick={() => setGraphView("force")}><span ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 5 })}><Network size={12} /> Force Graph</span></button>
        </div>
      </div>
      {schema ?
      <>
          {graphView === "erd" && <div ref={(el) => applyNodeStyle(el, graphShellStyle)}><div className="schema-toolbar"><div ref={(el) => applyNodeStyle(el, { width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,#D94F3D,#e86b59)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 })}><Table2 size={11} color="#fff" /></div><div ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 600, color: "#e4e4e7" })}>Schéma ERD</div><div ref={(el) => applyNodeStyle(el, { marginLeft: "auto", padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 600, fontFamily: "inherit", background: "rgba(217,79,61,.18)", color: "#fca5a5", border: "1px solid rgba(217,79,61,.3)" })}>{schema?.rels?.length || 0} relations</div><button onClick={() => setGraphFullscreen((v) => !v)} ref={(el) => applyNodeStyle(el, { width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.06)", color: "#d4d4d8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" })}>{graphFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button></div><SchemaERD schema={schema} tableRoles={data.tableRoles || {}} onSelectTable={setSelectedTable} selectedTable={selectedTable} height={graphHeight} fullscreen={graphFullscreen} /></div>}
          {graphView === "force" && <div ref={(el) => applyNodeStyle(el, graphShellStyle)}><div className="schema-toolbar"><div ref={(el) => applyNodeStyle(el, { width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,#3b82f6,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 })}><Network size={11} color="#fff" /></div><div ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 600, color: "#e4e4e7" })}>Force Graph</div><div ref={(el) => applyNodeStyle(el, { marginLeft: "auto", padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 600, fontFamily: "inherit", background: "rgba(59,130,246,.18)", color: "#93c5fd", border: "1px solid rgba(59,130,246,.3)" })}>{schema?.tables?.length || 0} tables</div><button onClick={() => setGraphFullscreen((v) => !v)} ref={(el) => applyNodeStyle(el, { width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.06)", color: "#d4d4d8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" })}>{graphFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button></div><SchemaForceGraph schema={schema} onSelectTable={setSelectedTable} selectedTable={selectedTable} height={graphHeight} fullscreen={graphFullscreen} /></div>}
          {tableInfo && <div className="fade-in" ref={(el) => applyNodeStyle(el, { background: "#fff", border: `1px solid ${INTEGRATION_COLORS.g200}`, borderRadius: 12, padding: "14px 16px" })}><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 })}><span ref={(el) => applyNodeStyle(el, { fontSize: 13, fontWeight: 700, color: INTEGRATION_COLORS.g900, fontFamily: "inherit" })}>{tableInfo.name}</span><span ref={(el) => applyNodeStyle(el, { fontSize: 10, padding: "1px 7px", borderRadius: 99, background: INTEGRATION_COLORS.g100, color: INTEGRATION_COLORS.g500 })}>{tableInfo.rowCount.toLocaleString()} lignes</span></div><div ref={(el) => applyNodeStyle(el, { display: "flex", flexWrap: "wrap", gap: 4 })}>{tableInfo.cols.map((col) => <span key={col} ref={(el) => applyNodeStyle(el, { padding: "2px 8px", borderRadius: 5, background: INTEGRATION_COLORS.g100, border: `1px solid ${INTEGRATION_COLORS.g200}`, fontSize: 10, fontFamily: "inherit", color: INTEGRATION_COLORS.g700 })}>{col}</span>)}</div></div>}
        </> :
      <div ref={(el) => applyNodeStyle(el, { padding: "3rem", textAlign: "center", color: INTEGRATION_COLORS.g400 })}><Database size={36} ref={(el) => applyNodeStyle(el, { display: "block", margin: "0 auto 12px", opacity: .35 })} /><p ref={(el) => applyNodeStyle(el, { fontSize: 13 })}>Connexion requise (étape 2)</p></div>}
    </div>);

}

export function IdentityStep({ data, setData }) {
  // ERP connectors authenticate via JWT signed by the external ERP's public key — one method only.
  useEffect(() => {
    if (data.authType !== "JWT_PUBLIC_KEY") {
      setData((d) => ({ ...d, authType: "JWT_PUBLIC_KEY", algorithm: d.algorithm || "RS256" }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pem = (data.publicKey || "").trim();
  const pemValid = /-----BEGIN [A-Z ]*PUBLIC KEY-----[\s\S]+-----END [A-Z ]*PUBLIC KEY-----/.test(pem);
  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.red}>Définissez l'identité du connecteur ERP et son mode d'authentification.</InfoBox>
      <div ref={(el) => applyNodeStyle(el, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 })}>
        <div ref={(el) => applyNodeStyle(el, { gridColumn: "1/-1" })}><label className="label">Nom du connecteur</label><input value={data.name || ""} onChange={(e) => setData({ ...data, name: e.target.value })} className="input" placeholder="ex: SAP S/4HANA Production" /></div>
        <div><label className="label">Type</label><select value={data.connectorType || "ERP"} onChange={(e) => setData({ ...data, connectorType: e.target.value })} className="select"><option value="ERP">ERP</option><option value="DATA_SOURCE">Source de données</option><option value="ACCOUNTING">Comptabilité</option></select></div>
        <div><label className="label">Authentification</label><select value="JWT_PUBLIC_KEY" disabled className="select"><option value="JWT_PUBLIC_KEY">JWT signé (clé publique)</option></select></div>
        <div><label className="label">Logo (2 lettres)</label><input value={data.logo || ""} maxLength={2} onChange={(e) => setData({ ...data, logo: e.target.value })} className="input" placeholder="SG" /></div>
        <div><label className="label">Couleur principale</label><div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 8 })}><input type="color" value={data.color || "#D94F3D"} onChange={(e) => setData({ ...data, color: e.target.value })} ref={(el) => applyNodeStyle(el, { width: 40, height: 40, padding: 2, border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" })} /><input value={data.color || "#D94F3D"} onChange={(e) => setData({ ...data, color: e.target.value })} className="input" ref={(el) => applyNodeStyle(el, { flex: 1 })} /></div></div>
        <div ref={(el) => applyNodeStyle(el, { gridColumn: "1/-1" })}><label className="label">Description</label><input value={data.description || ""} onChange={(e) => setData({ ...data, description: e.target.value })} className="input" placeholder="Connecteur ERP…" /></div>
      </div>
      <div ref={(el) => applyNodeStyle(el, { borderTop: `1px solid ${INTEGRATION_COLORS.g100}`, paddingTop: 12 })}>
        <div ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 700, color: INTEGRATION_COLORS.g700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 })}><Settings2 size={13} color={INTEGRATION_COLORS.red} /> Authentification — JWT signé (clé publique)</div>
        <div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400, marginBottom: 10 })}>Collez la clé publique de l'ERP externe. Elle sera utilisée pour vérifier les JWT signés par cet ERP.</div>
        <div ref={(el) => applyNodeStyle(el, { marginBottom: 10 })}>
          <label className="label">Clé publique (PEM) <span ref={(el) => applyNodeStyle(el, { color: INTEGRATION_COLORS.red })}>*</span></label>
          <textarea value={data.publicKey || ""} onChange={(e) => setData({ ...data, publicKey: e.target.value })} className="input" rows={6} autoComplete="off" spellCheck={false}
          placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"} ref={(el) => applyNodeStyle(el,
          { resize: "vertical", height: 120, fontFamily: "inherit", fontSize: 11 })} />
          {pem && !pemValid && <div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.red, marginTop: 4 })}>Format PEM invalide — attendu : -----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----</div>}
          {pemValid && <div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.success, marginTop: 4 })}>✓ Clé publique valide</div>}
        </div>
        <div ref={(el) => applyNodeStyle(el, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 })}>
          <div><label className="label">Issuer (optionnel)</label><input value={data.issuer || ""} onChange={(e) => setData({ ...data, issuer: e.target.value })} className="input" placeholder="ex: askgo" /></div>
          <div><label className="label">Audience (optionnel)</label><input value={data.audience || ""} onChange={(e) => setData({ ...data, audience: e.target.value })} className="input" placeholder="ex: anomalyiq-widgets" /></div>
          <div><label className="label">Key ID / kid (optionnel)</label><input value={data.kid || ""} onChange={(e) => setData({ ...data, kid: e.target.value })} className="input" /></div>
          <div><label className="label">Algorithme</label><select value={data.algorithm || "RS256"} onChange={(e) => setData({ ...data, algorithm: e.target.value })} className="select"><option>RS256</option><option>RS384</option><option>RS512</option><option>ES256</option></select></div>
        </div>
      </div>
    </div>);

}

export function ConnectionStep({ data, setData, schema, onTestConnection, onDiscoverSchema }) {
  const [testState, setTestState] = useState(null);
  const [testMessage, setTestMessage] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const iconByName = { Database, Network, Layers };
  const connTypes = INTEGRATION_CONNECTION_TYPES.map((type) => ({ ...type, Icon: iconByName[type.icon] }));
  const allTables = schema?.tables || [];
  const selectedTables = data.selectedTables || [];
  const toggleTable = (name) => setData({ ...data, selectedTables: selectedTables.includes(name) ? selectedTables.filter((t) => t !== name) : [...selectedTables, name] });
  // Search + render cap keep the table list fluid even for very large schemas
  // (e.g. 900 tables): filter by name, render at most TABLE_RENDER_CAP rows.
  // Selections that scroll out of the filter remain selected.
  const tableQuery = tableSearch.trim().toLowerCase();
  const filteredTables = tableQuery ? allTables.filter((t) => t.name.toLowerCase().includes(tableQuery)) : allTables;
  const TABLE_RENDER_CAP = 300;
  const shownTables = filteredTables.slice(0, TABLE_RENDER_CAP);
  const csvFiles = data.csvFiles || [];
  const apiResources = data.apiResources || [];
  const parseCsvFiles = async (files) => {
    const parsed = await Promise.all(Array.from(files || []).map(async (file) => {
      const text = await file.text();
      const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
      const delimiter = firstLine.includes(";") ? ";" : ",";
      const cols = firstLine.split(delimiter).map((col) => col.trim().replace(/^"|"$/g, "")).filter(Boolean);
      const rowCount = Math.max(0, text.split(/\r?\n/).filter((line) => line.trim()).length - 1);
      return { name: file.name, tableName: normalizeTableName(file.name), cols, rowCount };
    }));
    const nextFiles = [...csvFiles, ...parsed];
    const nextSchema = buildCsvSchema(nextFiles);
    setData({ ...data, connectionType: "csv", csvFiles: nextFiles, selectedTables: nextSchema.tables.map((t) => t.name) });
  };
  const addCsvPreset = (preset) => {
    const exists = csvFiles.some((file) => file.name === preset.name);
    const nextFiles = exists ? csvFiles.filter((file) => file.name !== preset.name) : [...csvFiles, preset];
    const nextSchema = buildCsvSchema(nextFiles);
    setData({ ...data, connectionType: "csv", csvFiles: nextFiles, selectedTables: nextSchema.tables.map((t) => t.name) });
  };
  const removeCsvFile = (name) => {
    const nextFiles = csvFiles.filter((file) => file.name !== name);
    const nextSchema = buildCsvSchema(nextFiles);
    setData({ ...data, csvFiles: nextFiles, selectedTables: (data.selectedTables || []).filter((t) => nextSchema.tables.some((table) => table.name === t)) });
  };
  const updateApiResource = (index, patch) => {
    const next = apiResources.map((resource, i) => i === index ? { ...resource, ...patch } : resource);
    const nextSchema = buildApiSchema(next);
    setData({ ...data, apiResources: next, selectedTables: nextSchema.tables.map((t) => t.name) });
  };
  const addApiResource = () => {
    const next = [...apiResources, { ...DEFAULT_API_RESOURCE, name: `resource_${apiResources.length + 1}`, path: data.apiEndpoint || DEFAULT_API_RESOURCE.path }];
    const nextSchema = buildApiSchema(next);
    setData({ ...data, connectionType: "api", apiResources: next, selectedTables: nextSchema.tables.map((t) => t.name) });
  };
  const removeApiResource = (index) => {
    const next = apiResources.filter((_, i) => i !== index);
    const nextSchema = buildApiSchema(next);
    setData({ ...data, apiResources: next, selectedTables: (data.selectedTables || []).filter((t) => nextSchema.tables.some((table) => table.name === t)) });
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
      <div><label className="label" ref={(el) => applyNodeStyle(el, { marginBottom: 8 })}>Type de connexion</label><div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 8 })}>{connTypes.map((t) => <div key={t.id} onClick={() => setData({ ...data, connectionType: t.id })} ref={(el) => applyNodeStyle(el, { flex: 1, padding: "12px 10px", borderRadius: 12, cursor: "pointer", textAlign: "center", background: data.connectionType === t.id ? "rgba(217,79,61,.08)" : "rgba(248,247,245,.8)", border: `1.5px solid ${data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g200}` })}><div ref={(el) => applyNodeStyle(el, { display: "flex", justifyContent: "center", marginBottom: 4 })}><t.Icon size={22} color={data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g400} /></div><div ref={(el) => applyNodeStyle(el, { fontSize: 12, fontWeight: 700, color: data.connectionType === t.id ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g700 })}>{t.label}</div><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 2 })}>{t.desc}</div></div>)}</div></div>
      {data.connectionType === "jdbc" && <div ref={(el) => applyNodeStyle(el, { display: "flex", flexDirection: "column", gap: 10 })}><div><label className="label">URL JDBC</label><input value={data.jdbcUrl || ""} onChange={(e) => setData({ ...data, jdbcUrl: e.target.value })} className="input mono" placeholder="jdbc:postgresql://host:5432/erp_db" ref={(el) => applyNodeStyle(el, { fontSize: 11 })} /></div><div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 10 })}><div ref={(el) => applyNodeStyle(el, { flex: 1 })}><label className="label">Utilisateur</label><input value={data.jdbcUsername || ""} onChange={(e) => setData({ ...data, jdbcUsername: e.target.value })} className="input" /></div><div ref={(el) => applyNodeStyle(el, { flex: 1 })}><label className="label">Mot de passe</label><input type="password" value={data.jdbcPassword || ""} onChange={(e) => setData({ ...data, jdbcPassword: e.target.value })} className="input" /></div></div></div>}
      {data.connectionType === "csv" && <div ref={(el) => applyNodeStyle(el, { display: "flex", flexDirection: "column", gap: 10 })}><div ref={(el) => applyNodeStyle(el, { padding: "14px", borderRadius: 12, border: `1.5px dashed ${INTEGRATION_COLORS.g300}`, background: "rgba(248,247,245,.65)" })}><label className="label">Sources CSV de test</label><div ref={(el) => applyNodeStyle(el, { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 8 })}>{CSV_SOURCE_PRESETS.map((preset) => {const selected = csvFiles.some((file) => file.name === preset.name);return <button key={preset.name} type="button" onClick={() => addCsvPreset(preset)} ref={(el) => applyNodeStyle(el, { textAlign: "left", padding: "10px 12px", borderRadius: 11, cursor: "pointer", background: selected ? "rgba(217,79,61,.08)" : "#fff", border: `1.5px solid ${selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g200}`, fontFamily: "inherit" })}><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 7, marginBottom: 5 })}><FileText size={13} color={selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g400} /><span ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 800, color: selected ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g800 })}>{preset.label}</span></div><div className="mono" ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g500 })}>{normalizeTableName(preset.tableName)}</div><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 3 })}>{preset.cols.length} colonnes · {preset.rowCount} lignes</div></button>;})}</div><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 8 })}>Sélectionnez une ou plusieurs sources mock pour tester Facture, Commande et Budget sans backend.</div></div><div ref={(el) => applyNodeStyle(el, { padding: "14px", borderRadius: 12, border: `1.5px dashed ${INTEGRATION_COLORS.g300}`, background: "rgba(248,247,245,.65)" })}><label className="label">Importer vos propres fichiers CSV</label><input type="file" accept=".csv,text/csv" multiple onChange={(e) => parseCsvFiles(e.target.files)} className="input" ref={(el) => applyNodeStyle(el, { marginTop: 6 })} /><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400, marginTop: 6 })}>Chaque fichier est traité comme une table importable.</div></div>{csvFiles.length > 0 && <div ref={(el) => applyNodeStyle(el, { display: "flex", flexDirection: "column", gap: 6 })}>{csvFiles.map((file) => <div key={file.name} ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${INTEGRATION_COLORS.g200}`, background: "#fff" })}><FileText size={13} color={INTEGRATION_COLORS.red} /><div ref={(el) => applyNodeStyle(el, { flex: 1, minWidth: 0 })}><div className="mono" ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 800, color: INTEGRATION_COLORS.g800 })}>{normalizeTableName(file.tableName || file.name)}</div><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400 })}>{file.type ? `${file.type} · ` : ""}{file.name} · {(file.cols || []).length} colonnes · {file.rowCount || 0} lignes</div></div><button type="button" className="btn btn-ghost" onClick={() => removeCsvFile(file.name)} ref={(el) => applyNodeStyle(el, { fontSize: 10, padding: "4px 8px" })}><X size={11} /> Retirer</button></div>)}</div>}</div>}
      {data.connectionType === "api" && <div ref={(el) => applyNodeStyle(el, { display: "flex", flexDirection: "column", gap: 10 })}><div><label className="label">Endpoint de base</label><input value={data.apiEndpoint || ""} onChange={(e) => setData({ ...data, apiEndpoint: e.target.value })} className="input mono" placeholder="https://api.exemple.com" /></div><div><label className="label">Token API</label><input value={data.apiAuthToken || ""} onChange={(e) => setData({ ...data, apiAuthToken: e.target.value })} className="input" placeholder="Bearer / API key" /></div><div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", justifyContent: "space-between" })}><div><label className="label" ref={(el) => applyNodeStyle(el, { marginBottom: 2 })}>Ressources API</label><div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400 })}>Chaque ressource est considérée comme une table.</div></div><button type="button" className="btn btn-ghost" onClick={addApiResource} ref={(el) => applyNodeStyle(el, { fontSize: 11 })}><Plus size={12} /> Ressource</button></div>{apiResources.map((resource, index) => <div key={index} ref={(el) => applyNodeStyle(el, { display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr 32px", gap: 8, alignItems: "center", padding: 10, borderRadius: 10, border: `1px solid ${INTEGRATION_COLORS.g200}`, background: "#fff" })}><input className="input mono" value={resource.name || ""} onChange={(e) => updateApiResource(index, { name: e.target.value })} placeholder="factures" /><input className="input mono" value={resource.path || ""} onChange={(e) => updateApiResource(index, { path: e.target.value })} placeholder="/factures" /><input className="input mono" value={(resource.cols || []).join(", ")} onChange={(e) => updateApiResource(index, { cols: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="id, date, amount" /><button type="button" className="btn btn-ghost" onClick={() => removeApiResource(index)} ref={(el) => applyNodeStyle(el, { padding: 6 })}><X size={12} /></button></div>)}</div>}
      {data.connectionType !== "csv" && <div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 8 })}><button className="btn btn-ghost" onClick={runConnectionTest} ref={(el) => applyNodeStyle(el, { fontSize: 11 })}>{testState === "testing" ? <RefreshCw size={12} className="spin" /> : <Zap size={12} />} Tester la connexion</button>{testState === "ok" && <span ref={(el) => applyNodeStyle(el, { fontSize: 11, color: INTEGRATION_COLORS.success, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}><CheckCircle2 size={13} /> {testMessage || "Connexion réussie"}</span>}{testState === "error" && <span ref={(el) => applyNodeStyle(el, { fontSize: 11, color: INTEGRATION_COLORS.red, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}><AlertCircle size={13} /> {testMessage}</span>}</div>}
      {allTables.length > 0 &&
      <div>
          <div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" })}>
            <div>
              <label className="label" ref={(el) => applyNodeStyle(el, { marginBottom: 2 })}>Tables disponibles</label>
              <div ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400 })}>{allTables.length} tables détectées{tableQuery ? ` · ${filteredTables.length} filtrée(s)` : ""} · {selectedTables.length} sélectionnée(s)</div>
            </div>
            <div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 6 })}>
              <button className="btn btn-ghost" onClick={() => setData({ ...data, selectedTables: Array.from(new Set([...selectedTables, ...filteredTables.map((t) => t.name)])) })} ref={(el) => applyNodeStyle(el, { fontSize: 10, padding: "4px 10px" })}>{tableQuery ? "Tout (filtré)" : "Tout"}</button>
              <button className="btn btn-ghost" onClick={() => setData({ ...data, selectedTables: [] })} ref={(el) => applyNodeStyle(el, { fontSize: 10, padding: "4px 10px" })}>Effacer</button>
            </div>
          </div>
          <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="input" placeholder="Rechercher une table par nom…" ref={(el) => applyNodeStyle(el, { fontSize: 11, marginBottom: 8 })} />
          <div className="scroll" ref={(el) => applyNodeStyle(el, { border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", maxHeight: 320, overflowY: "auto" })}>
            {shownTables.length === 0 && <div ref={(el) => applyNodeStyle(el, { padding: "14px", fontSize: 11, color: INTEGRATION_COLORS.g400 })}>Aucune table ne correspond à « {tableSearch} ».</div>}
            {shownTables.map((t, i) => {const sel = selectedTables.includes(t.name);return <div key={t.name} onClick={() => toggleTable(t.name)} ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: sel ? "rgba(217,79,61,.04)" : i % 2 === 0 ? "rgba(248,247,245,.5)" : "#fff", borderBottom: i < shownTables.length - 1 ? "1px solid rgba(0,0,0,.04)" : "none" })}><div ref={(el) => applyNodeStyle(el, { width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g300}`, background: sel ? INTEGRATION_COLORS.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 })}>{sel && <CheckCircle2 size={11} color="#fff" />}</div><span className="mono" ref={(el) => applyNodeStyle(el, { fontSize: 11, fontWeight: 700, color: sel ? INTEGRATION_COLORS.red : INTEGRATION_COLORS.g700, flex: 1 })}>{t.name}</span><span ref={(el) => applyNodeStyle(el, { fontSize: 10, color: INTEGRATION_COLORS.g400 })}>{t.cols.length} cols · {t.rowCount.toLocaleString()} lignes</span></div>;})}
            {filteredTables.length > shownTables.length && <div ref={(el) => applyNodeStyle(el, { padding: "10px 14px", fontSize: 10, color: INTEGRATION_COLORS.g400, textAlign: "center", background: "rgba(248,247,245,.5)" })}>… {filteredTables.length - shownTables.length} autres tables — affinez la recherche pour les afficher</div>}
          </div>
        </div>
      }
    </div>);

}


/* ─── DATA PREVIEW STEP ─────────────────────────────────────── */
export function DataPreviewStep({ data, setData, schema }) {
  const customPipelines = data.customPipelines || [];
  const allTabs = [
  { key: "facture", label: "Factures", Icon: Database, color: PIPELINE_DEFS.facture.color },
  { key: "commande", label: "Commandes", Icon: Layers, color: PIPELINE_DEFS.commande.color },
  ...customPipelines.map((cp) => ({ key: cp.id, label: cp.label, Icon: Settings2, color: cp.color }))];

  const [activeTab, setActiveTab] = useState("facture");
  const [genData, setGenData] = useState(data.generatedData || {});
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const selectedTables = data.selectedTables || [];
  const activeTables = (schema?.tables || []).filter((t) => selectedTables.includes(t.name));
  const pipelines = data.pipelines || {};
  const pl = pipelines[activeTab] || {};
  const plTables = activeTables.filter((t) => (pl.tables || []).includes(t.name));
  const preferredPreviewTable = activeTab === "facture" ? "factures" : activeTab === "commande" ? "commandes" : null;
  const previewTable = preferredPreviewTable && plTables.find((t) => t.name === preferredPreviewTable)?.name ||
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
      const res = data.id ?
      await previewConnectorTable(data.id, { table: previewTable, limit: 10 }) :
      await previewUnsavedConnectorTable(previewTable, 10, payload);
      if (res?.status === "error") throw new Error(res.message || "Prévisualisation impossible");
      const rows = res?.sample || res?.rows || [];
      const next = { ...genData, [activeTab]: rows };
      setGenData(next);
      setData({ ...data, generatedData: next });
      if (!rows.length) setPreviewError(`La table ${previewTable} ne contient aucune ligne à afficher.`);
    } catch (err) {
      setPreviewError(err.message || "Prévisualisation impossible");
    } finally {
      setLoading(false);
    }
  };
  const activeRows = genData[activeTab] || [];

  return (
    <div className={styles.stepStack}>
      <InfoBox color={INTEGRATION_COLORS.info}>Utilisez la prévisualisation de table backend pour valider les données réelles.</InfoBox>
      <div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 6, flexWrap: "wrap" })}>
        {allTabs.map((t) =>
        <button key={t.key} onClick={() => setActiveTab(t.key)} ref={(el) => applyNodeStyle(el,
        { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${activeTab === t.key ? t.color : "transparent"}`, background: activeTab === t.key ? `${t.color}12` : "transparent", color: activeTab === t.key ? t.color : INTEGRATION_COLORS.g500, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" })}>
            <t.Icon size={13} /> {t.label}
            {genData[t.key] && <span ref={(el) => applyNodeStyle(el, { fontSize: 9, padding: "1px 5px", borderRadius: 99, background: INTEGRATION_COLORS.successLight, color: "#15803d" })}><CheckCircle2 size={8} /></span>}
          </button>
        )}
      </div>
      <button className="btn btn-primary" onClick={generate} disabled={loading || !previewTable}>
        {loading ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />} Préparer aperçu{previewTable ? ` (${previewTable})` : ""}
      </button>
      {previewError && <div ref={(el) => applyNodeStyle(el, { padding: "10px 12px", borderRadius: 10, background: "rgba(217,79,61,.08)", border: "1px solid rgba(217,79,61,.22)", color: INTEGRATION_COLORS.red, fontSize: 12 })}>{previewError}</div>}
      {activeRows.length > 0 ?
      <div ref={(el) => applyNodeStyle(el, { borderRadius: 12, border: `1px solid ${INTEGRATION_COLORS.g200}`, overflow: "hidden" })}>
          <div ref={(el) => applyNodeStyle(el, { overflowX: "auto" })}>
            <table className="gen-table">
              <thead><tr>{Object.keys(activeRows[0]).map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{activeRows.map((row, i) => <tr key={i}>{Object.values(row).map((v, j) => <td key={j} title={String(v)}>{String(v)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div> :

      <div ref={(el) => applyNodeStyle(el, { padding: "3rem", textAlign: "center", color: INTEGRATION_COLORS.g400, background: INTEGRATION_COLORS.g50, borderRadius: 12, border: `1px dashed ${INTEGRATION_COLORS.g200}` })}>
          <Sparkles size={32} ref={(el) => applyNodeStyle(el, { display: "block", margin: "0 auto 12px", opacity: .4 })} />
          <p ref={(el) => applyNodeStyle(el, { fontSize: 13 })}>Aucune donnée locale générée. Les aperçus doivent venir du serveur.</p>
        </div>
      }
    </div>);

}

/* ─── SUMMARY STEP ──────────────────────────────────────────── */
export function SummaryStep({ data, onSave, onDelete, initialData }) {
  const tenants = data.tenants || [];
  const customPipelines = data.customPipelines || [];
  const pipelines = data.pipelines || {};
  const enabledPl = [
  ...["facture", "commande"].filter((k) => (pipelines[k] || {}).enabled !== false).map((k) => PIPELINE_DEFS[k].label),
  ...customPipelines.filter((cp) => (pipelines[cp.id] || {}).enabled !== false).map((cp) => cp.label)];

  const groupByErrors = getPipelineGroupByErrors(data);
  const isValid = data.name && (data.selectedTables || []).length > 0 && groupByErrors.length === 0;
  const connectionDetail = data.connectionType === "csv" ?
  `${(data.csvFiles || []).length} fichier(s) CSV` :
  data.connectionType === "api" ?
  `${(data.apiResources || []).length} ressource(s) API` :
  data.jdbcUrl || "—";
  const rows = [
  ["Nom", data.name || "—"],
  ["Type", data.connectorType || "—"],
  ["Auth", `JWT clé publique · ${data.algorithm || "RS256"} · clé ${(data.publicKey || "").includes("BEGIN") ? "présente" : "absente"}`],
  ["Connexion", `${(data.connectionType || "jdbc").toUpperCase()} · ${connectionDetail}`],
  ["Tables", (data.selectedTables || []).length + " table(s)"],
  ["Pipelines", enabledPl.join(" · ") || "—"],
  ["Tenants", `${tenants.length} tenant(s)${tenants.filter((t) => t.platformTenantId).length > 0 ? " · " + tenants.filter((t) => t.platformTenantId).length + " lié(s)" : ""}${tenants.filter((t) => t.storageMode === "isolated").length > 0 ? " · " + tenants.filter((t) => t.storageMode === "isolated").length + " DB isolée(s)" : ""}`],
  ["Tenants actifs", `${tenants.filter((t) => t.active).length} / ${tenants.length}`],
  ["Données test", data.generatedData && Object.keys(data.generatedData).length > 0 ? "✓ Générées" : "Non générées"],
  ["Budget", data.budgetTemplate?.budgetSource?.table || data.budgetFormula?.length > 0 ? "✓ Configuré" : "Non configuré"]];


  return (
    <div className={styles.summaryStack}>
      <div ref={(el) => applyNodeStyle(el, { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 14, background: isValid ? INTEGRATION_COLORS.successLight : INTEGRATION_COLORS.warningLight, border: `1px solid ${isValid ? INTEGRATION_COLORS.successBorder : "rgba(245,158,11,.3)"}` })}>
        <div ref={(el) => applyNodeStyle(el, { width: 40, height: 40, borderRadius: 12, background: isValid ? "rgba(34,197,94,.15)" : "rgba(245,158,11,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 })}>
          {isValid ? <CheckCircle2 size={22} color={INTEGRATION_COLORS.success} /> : <AlertCircle size={22} color={INTEGRATION_COLORS.warning} />}
        </div>
        <div>
          <div ref={(el) => applyNodeStyle(el, { fontSize: 14, fontWeight: 700, color: isValid ? "#15803d" : "#92400e" })}>
            {isValid ? "Connecteur prêt à créer" : "Configuration incomplète"}
          </div>
          <div ref={(el) => applyNodeStyle(el, { fontSize: 11, color: isValid ? "#16a34a" : "#b45309", marginTop: 2 })}>
            {isValid ? "Toutes les étapes critiques sont complètes." : groupByErrors.length > 0 ? groupByErrors.map((e) => e.type === "unmapped" ? `${e.label}: champ(s) de regroupement non mappé(s) (${e.fields.join(", ")})` : `${e.label}: regroupement requis`).join(" · ") : "Vérifiez le nom et la sélection de tables."}
          </div>
        </div>
      </div>

      <div ref={(el) => applyNodeStyle(el, { background: "#fff", border: `1px solid ${INTEGRATION_COLORS.g200}`, borderRadius: 14, overflow: "hidden" })}>
        {rows.map(([k, v], i) =>
        <div key={k} ref={(el) => applyNodeStyle(el, { display: "flex", padding: "10px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${INTEGRATION_COLORS.g100}` : "none", background: i % 2 === 0 ? "transparent" : "rgba(248,247,245,.4)" })}>
            <span ref={(el) => applyNodeStyle(el, { fontSize: 11, color: INTEGRATION_COLORS.g400, flex: "0 0 160px" })}>{k}</span>
            <span ref={(el) => applyNodeStyle(el, { fontSize: 11, color: String(v).startsWith("✓") ? INTEGRATION_COLORS.success : INTEGRATION_COLORS.g900, fontWeight: 600 })}>{String(v)}</span>
          </div>
        )}
      </div>

      <div ref={(el) => applyNodeStyle(el, { display: "flex", gap: 10 })}>
        <button className="btn btn-primary" onClick={onSave} disabled={!isValid} ref={(el) => applyNodeStyle(el, { flex: 1, justifyContent: "center", fontSize: 13, padding: 10 })}>
          {initialData?.id ? <><RefreshCw size={14} /> Enregistrer</> : <><Sparkles size={14} /> Créer le connecteur</>}
        </button>
        {initialData?.id && onDelete &&
        <button className="btn btn-danger" onClick={onDelete}><X size={14} /> Supprimer</button>
        }
      </div>
    </div>);

}
