import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Link2, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import {
  CARD_W,
  ERD_OFFSETS,
  MAX_COLS,
  PAD,
  TABLE_PALETTE,
  inferColType,
} from "@/constants/integrationWizard";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";

const setRefNode = (ref, node) => {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};
export function SchemaERD({
  schema,
  tableRoles: _tableRoles,
  onSelectTable,
  selectedTable,
  height = 480,
  fullscreen = false,
}) {
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
    schema?.tables?.forEach((t) => {
      next[t.name] = t;
    });
    return next;
  }, [schema?.tables]);
  const relationships = useMemo(() => schema?.rels || [], [schema?.rels]);
  const highlighted = useMemo(() => {
    if (!search) return new Set();
    const q = search.toLowerCase();
    return new Set(tableNames.filter((n) => n.toLowerCase().includes(q)));
  }, [search, tableNames]);
  const initialCardPositions = useMemo(
    () =>
      Object.fromEntries(
        tableNames.map((name, i) => {
          const off = ERD_OFFSETS[i] || { x: (i % 4) * 220, y: Math.floor(i / 4) * 290 };
          return [name, { x: PAD + off.x, y: PAD + off.y }];
        }),
      ),
    [tableNames],
  );
  const [cardPositions, setCardPositions] = useState(initialCardPositions);
  useEffect(() => {
    setCardPositions(initialCardPositions);
  }, [initialCardPositions]);
  const cardHeight = (name) => {
    const t = tables[name];
    if (!t) return 80;
    return 36 + Math.min(t.cols.length, MAX_COLS) * 20 + (t.cols.length > MAX_COLS ? 18 : 4);
  };
  const canvasW = Math.max(
    ...(tableNames.length
      ? tableNames.map((_, i) => {
          const off = ERD_OFFSETS[i] || { x: (i % 4) * 220, y: 0 };
          return PAD + off.x + CARD_W + PAD * 3;
        })
      : [900]),
    900,
  );
  const canvasH = Math.max(
    ...(tableNames.length
      ? tableNames.map((name, i) => {
          const off = ERD_OFFSETS[i] || { x: 0, y: Math.floor(i / 4) * 290 };
          return PAD + off.y + cardHeight(name) + PAD * 3;
        })
      : [600]),
    600,
  );
  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const W = vp.clientWidth,
      H = vp.clientHeight;
    if (fullscreen) {
      setCam({ scale: 1, x: 28, y: 42 });
      return;
    }
    const scale = Math.min((W - 60) / canvasW, (H - 60) / canvasH, 1);
    setCam({ scale, x: (W - canvasW * scale) / 2, y: (H - canvasH * scale) / 2 });
  }, [canvasW, canvasH, fullscreen]);
  useEffect(() => {
    fitView();
  }, [tableNames.length, fullscreen, fitView]);
  const onMouseDown = useCallback(
    (e) => {
      if (e.target.closest(".erd-table-card")) return;
      panRef.current = {
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
        camX: cam.x,
        camY: cam.y,
      };
      viewportRef.current.style.cursor = "grabbing";
      e.preventDefault();
    },
    [cam],
  );
  const onMouseMove = useCallback(
    (e) => {
      if (cardDragRef.current) {
        const drag = cardDragRef.current;
        const dx = (e.clientX - drag.startX) / cam.scale;
        const dy = (e.clientY - drag.startY) / cam.scale;
        if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4)
          drag.moved = true;
        setCardPositions((prev) => ({
          ...prev,
          [drag.name]: { x: drag.posX + dx, y: drag.posY + dy },
        }));
        return;
      }
      if (!panRef.current.isPanning) return;
      setCam((c) => ({
        ...c,
        x: panRef.current.camX + (e.clientX - panRef.current.startX),
        y: panRef.current.camY + (e.clientY - panRef.current.startY),
      }));
    },
    [cam.scale],
  );
  const onMouseUp = useCallback(() => {
    if (cardDragRef.current?.moved) skipCardClickRef.current = true;
    cardDragRef.current = null;
    panRef.current.isPanning = false;
    if (viewportRef.current) viewportRef.current.style.cursor = "grab";
  }, []);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top,
      delta = e.deltaY > 0 ? 0.9 : 1.11;
    setCam((c) => {
      const ns = Math.max(0.25, Math.min(2.5, c.scale * delta));
      const wx = (mx - c.x) / c.scale,
        wy = (my - c.y) / c.scale;
      return { scale: ns, x: mx - wx * ns, y: my - wy * ns };
    });
  }, []);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  if (!schema || !tableNames.length)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height,
          background: INTEGRATION_COLORS.canvas,
          borderRadius: 14,
          color: "rgba(255,255,255,.18)",
          fontSize: 13,
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Database size={32} style={{ opacity: 0.2 }} />
        <span>Aucune table sélectionnée</span>
      </div>
    );
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        position: "relative",
        background: INTEGRATION_COLORS.canvas,
        borderRadius: fullscreen ? 0 : "0 0 14px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          background: INTEGRATION_COLORS.canvas,
          borderRadius: fullscreen ? 0 : "0 0 14px 14px",
          overflow: "hidden",
          position: "relative",
          minHeight: height,
        }}
      >
        <div
          ref={(el) => {
            setRefNode(viewportRef, el);
          }}
          style={{
            height,
            overflow: "hidden",
            cursor: "grab",
            position: "relative",
            userSelect: "none",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div
            style={{
              position: "absolute",
              transformOrigin: "0 0",
              willChange: "transform",
              transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.scale})`,
              width: canvasW,
              height: canvasH,
            }}
          >
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: canvasW,
                height: canvasH,
                pointerEvents: "auto",
                overflow: "visible",
                zIndex: 2,
              }}
            >
              <defs>
                <marker
                  id="erd-arr"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L7,3 z" fill="rgba(217,79,61,.55)" />
                </marker>
                <marker
                  id="erd-arr-act"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L7,3 z" fill="#D94F3D" />
                </marker>
              </defs>
              {relationships.map((rel, i) => {
                const isActive =
                  selectedRel === i ||
                  (hoveredTable && (hoveredTable === rel.from || hoveredTable === rel.to));
                const fp = cardPositions[rel.from],
                  tp = cardPositions[rel.to];
                if (!fp || !tp) return null;
                const fr = fp.x < tp.x,
                  fh = cardHeight(rel.from),
                  th = cardHeight(rel.to);
                const ax1 = fp.x + (fr ? CARD_W : 0),
                  ay1 = fp.y + fh / 2,
                  ax2 = tp.x + (fr ? 0 : CARD_W),
                  ay2 = tp.y + th / 2;
                const cp = Math.abs(ax2 - ax1) * 0.42;
                const d = `M${ax1} ${ay1} C${ax1 + (fr ? cp : -cp)} ${ay1},${ax2 + (fr ? -cp : cp)} ${ay2},${ax2} ${ay2}`;
                return (
                  <g
                    key={i}
                    onClick={() => setSelectedRel(selectedRel === i ? null : i)}
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                  >
                    <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                    {isActive && (
                      <path d={d} fill="none" stroke="rgba(217,79,61,.15)" strokeWidth={5} />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={isActive ? "#D94F3D" : "rgba(217,79,61,.38)"}
                      strokeWidth={isActive ? 1.8 : 1.1}
                      markerEnd={`url(#${isActive ? "erd-arr-act" : "erd-arr"})`}
                    />
                    {isActive &&
                      (() => {
                        const mx = (ax1 + ax2) / 2,
                          my = (ay1 + ay2) / 2 - 2,
                          lw = rel.col.length * 5 + 16;
                        return (
                          <g>
                            <rect
                              x={mx - lw / 2}
                              y={my - 8}
                              width={lw}
                              height={15}
                              rx={4}
                              fill="rgba(10,10,14,.94)"
                              stroke="rgba(217,79,61,.3)"
                              strokeWidth={0.7}
                            />
                            <text
                              x={mx}
                              y={my + 4}
                              textAnchor="middle"
                              fill="#fca5a5"
                              fontSize={8}
                              fontFamily="inherit"
                            >
                              {rel.col}
                            </text>
                          </g>
                        );
                      })()}
                  </g>
                );
              })}
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(circle,rgba(255,255,255,.04) 1px,transparent 1px)",
                backgroundSize: "28px 28px",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
            {tableNames.map((name, i) => {
              const pos = cardPositions[name],
                color = TABLE_PALETTE[i % TABLE_PALETTE.length],
                t = tables[name];
              const isHl =
                highlighted.has(name) ||
                hoveredTable === name ||
                (selectedRel !== null &&
                  (relationships[selectedRel]?.from === name ||
                    relationships[selectedRel]?.to === name)) ||
                selectedTable === name;
              return (
                <div
                  key={name}
                  className={`erd-table-card${isHl ? " highlighted" : ""}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    cardDragRef.current = {
                      name,
                      startX: e.clientX,
                      startY: e.clientY,
                      posX: pos.x,
                      posY: pos.y,
                      moved: false,
                    };
                  }}
                  onMouseEnter={() => setHoveredTable(name)}
                  onMouseLeave={() => setHoveredTable(null)}
                  onClick={() => {
                    if (skipCardClickRef.current) {
                      skipCardClickRef.current = false;
                      return;
                    }
                    onSelectTable(selectedTable === name ? null : name);
                  }}
                  style={{ left: pos.x, top: pos.y }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "8px 10px",
                      borderBottom: `1px solid ${color.fill}40`,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: color.dark,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Database size={10} color="#fff" />
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#e4e4e7",
                        fontFamily: "inherit",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </div>
                    <div style={{ fontSize: 9, color: "#52525b", fontFamily: "inherit" }}>
                      {t.rowCount > 1000 ? (t.rowCount / 1000).toFixed(0) + "k" : t.rowCount}
                    </div>
                  </div>
                  {t.cols.slice(0, MAX_COLS).map((col) => {
                    const ct = inferColType(col);
                    const isLinked = relationships.some(
                      (r) => r.col === col && (r.from === name || r.to === name),
                    );
                    return (
                      <div
                        key={col}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3.5px 10px",
                          fontSize: 9,
                          borderBottom: "1px solid rgba(255,255,255,.025)",
                        }}
                      >
                        {ct === "pk" ? (
                          <span style={{ fontSize: 9 }}>🔑</span>
                        ) : isLinked ? (
                          <Link2 size={8} color="#5eead4" style={{ flexShrink: 0 }} />
                        ) : (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 2,
                              border: "1px solid rgba(255,255,255,.1)",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontFamily: "inherit",
                            color: ct === "pk" ? "#fcd34d" : isLinked ? "#5eead4" : "#a1a1aa",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 9,
                          }}
                        >
                          {col}
                        </span>
                      </div>
                    );
                  })}
                  {t.cols.length > MAX_COLS && (
                    <div
                      style={{
                        padding: "2px 10px 4px",
                        fontSize: 8,
                        color: "#52525b",
                      }}
                    >
                      +{t.cols.length - MAX_COLS} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="erd-search-bar">
          <Search size={11} color="#52525b" />
          <input
            className="erd-search-input"
            placeholder="Rechercher table…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                color: "#71717a",
                cursor: "pointer",
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
        <div className="erd-zoom-controls">
          <button
            className="erd-zoom-btn"
            onClick={() => setCam((c) => ({ ...c, scale: Math.min(2.5, c.scale * 1.2) }))}
          >
            +
          </button>
          <button className="erd-zoom-btn" onClick={fitView} style={{ fontSize: 10 }}>
            ⊡
          </button>
          <button
            className="erd-zoom-btn"
            onClick={() => setCam((c) => ({ ...c, scale: Math.max(0.25, c.scale * 0.85) }))}
          >
            −
          </button>
        </div>
        <button className="erd-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)}>
          {sidebarOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
      <div className={`erd-sidebar-wrap ${sidebarOpen ? "open" : "closed"}`}>
        <div style={{ width: 260, display: "flex", flexDirection: "column" }}>
          <div className="rel-sidebar" style={{ maxHeight: height, overflowY: "auto" }}>
            <div className="rel-sidebar-header">
              <span>Relations</span>
              <span className="rel-sidebar-count">{relationships.length}</span>
            </div>
            {relationships.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: "#71717a" }}>
                Aucune relation détectée.
              </div>
            ) : (
              relationships.map((rel, i) => (
                <div
                  key={`${rel.from}-${rel.to}-${i}`}
                  className={`rel-sidebar-item${selectedRel === i ? " active" : ""}`}
                  onClick={() => setSelectedRel(selectedRel === i ? null : i)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: ".07em",
                        color: "#71717a",
                      }}
                    >
                      {rel.type || "N:1"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "inherit",
                        color: INTEGRATION_COLORS.red,
                        fontWeight: 700,
                      }}
                    >
                      {rel.col}
                    </span>
                  </div>
                  <div style={{ fontFamily: "inherit", fontSize: 10.5 }}>
                    <div style={{ color: "#5eead4" }}>{rel.from}</div>
                    <div style={{ color: "#71717a", marginTop: 1 }}>
                      → <span style={{ color: "#fca5a5" }}>{rel.to}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
