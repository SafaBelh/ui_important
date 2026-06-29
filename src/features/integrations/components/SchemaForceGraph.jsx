import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, X } from "lucide-react";
import { INTEGRATION_COLORS } from "@/features/integrations/utils/theme";
import { getTableColor } from "@/features/integrations/utils/wizardHelpers";

const setRefNode = (ref, node) => {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};
export function SchemaForceGraph({
  schema,
  onSelectTable,
  selectedTable,
  height = 460,
  fullscreen = false,
}) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const stateRef = useRef({
    nodes: [],
    edges: [],
    cam: { x: 0, y: 0, scale: 1 },
    drag: null,
    hover: null,
    selected: null,
    panStart: null,
    panCam: null,
    physicsOn: true,
    showLabels: false,
    tick: 0,
    particles: [],
    raf: null,
    W: 0,
    H: 0,
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [physicsOn, setPhysicsOn] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const tables = useMemo(() => schema?.tables || [], [schema?.tables]);
  const rels = useMemo(() => schema?.rels || [], [schema?.rels]);
  const fitView = useCallback(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !s.nodes.length) return;
    const xs = s.nodes.map((n) => n.x),
      ys = s.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 130,
      maxX = Math.max(...xs) + 130;
    const minY = Math.min(...ys) - 130,
      maxY = Math.max(...ys) + 130;
    const scale = Math.min(
      (canvas.clientWidth * 0.85) / Math.max(1, maxX - minX),
      (canvas.clientHeight * 0.8) / Math.max(1, maxY - minY),
      1.6,
    );
    s.cam.scale = scale;
    s.cam.x = canvas.clientWidth / 2 - ((minX + maxX) / 2) * scale;
    s.cam.y = canvas.clientHeight / 2 - ((minY + maxY) / 2) * scale;
  }, []);
  useEffect(() => {
    stateRef.current.physicsOn = physicsOn;
  }, [physicsOn]);
  useEffect(() => {
    stateRef.current.showLabels = showLabels;
  }, [showLabels]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tables.length) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const cx = rect.width / 2,
      cy = Math.max(480, rect.height - 52) / 2;
    const r = Math.min(rect.width, Math.max(480, rect.height - 52)) * 0.38;
    const s = stateRef.current;
    s.nodes = tables.map((table, i) => {
      const angle =
        tables.length <= 1 ? -Math.PI / 2 : (i / tables.length) * Math.PI * 2 - Math.PI / 2;
      return {
        id: table.name,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 0,
        headers: table.cols || [],
        rowCount: table.rowCount || 0,
        color: getTableColor(i),
        r: 58,
      };
    });
    s.edges = rels
      .map((rel) => ({
        from: rel.from,
        to: rel.to,
        column: rel.col,
        type: rel.type || "N:1",
        fromN: s.nodes.find((n) => n.id === rel.from),
        toN: s.nodes.find((n) => n.id === rel.to),
      }))
      .filter((e) => e.fromN && e.toN);
    s.selected = selectedTable ? s.nodes.find((n) => n.id === selectedTable) || null : null;
    setSelectedNode(s.selected);
    setPanelOpen(!!s.selected);
    fitView();
  }, [tables, rels, schema, selectedTable, fitView]);
  useEffect(() => {
    const canvas = canvasRef.current,
      minimap = minimapRef.current;
    if (!canvas || !minimap) return;
    const ctx = canvas.getContext("2d"),
      mctx = minimap.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const s = stateRef.current;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      s.W = rect.width;
      s.H = Math.max(480, rect.height - 52);
      canvas.width = s.W * dpr;
      canvas.height = s.H * dpr;
      canvas.style.width = s.W + "px";
      canvas.style.height = s.H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      minimap.width = 96 * dpr;
      minimap.height = 66 * dpr;
      minimap.style.width = "96px";
      minimap.style.height = "66px";
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const roundRect = (x, y, w, h, radius) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    const applyPhysics = () => {
      if (!s.physicsOn) return;
      const repulse = 22000,
        springK = 0.022,
        damping = 0.88,
        centerK = 0.002;
      const totalKE = s.nodes.reduce((sum, n) => sum + n.vx * n.vx + n.vy * n.vy, 0);
      if (totalKE < 0.08 && s.tick > 120) {
        s.physicsOn = false;
        return;
      }
      s.nodes.forEach((n, i) => {
        let fx = 0,
          fy = 0;
        s.nodes.forEach((o, j) => {
          if (i === j) return;
          const dx = n.x - o.x,
            dy = n.y - o.y,
            d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = d < n.r + o.r + 120 ? (repulse * 2) / (d * d) : repulse / (d * d);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        });
        n.fx = fx + (s.W / 2 - n.x) * centerK;
        n.fy = fy + (s.H / 2 - n.y) * centerK;
      });
      s.edges.forEach((e) => {
        const dx = e.toN.x - e.fromN.x,
          dy = e.toN.y - e.fromN.y,
          d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 300) * springK,
          efx = (dx / d) * f,
          efy = (dy / d) * f;
        e.fromN.fx += efx;
        e.fromN.fy += efy;
        e.toN.fx -= efx;
        e.toN.fy -= efy;
      });
      s.nodes.forEach((n) => {
        if (n === s.drag) return;
        n.vx = Math.max(-6, Math.min(6, (n.vx + n.fx) * damping));
        n.vy = Math.max(-6, Math.min(6, (n.vy + n.fy) * damping));
        n.x += n.vx;
        n.y += n.vy;
      });
    };
    const draw = () => {
      ctx.clearRect(0, 0, s.W, s.H);
      ctx.save();
      ctx.translate(s.cam.x, s.cam.y);
      ctx.scale(s.cam.scale, s.cam.scale);
      const gs = 56,
        ox = -s.cam.x / s.cam.scale,
        oy = -s.cam.y / s.cam.scale,
        vw = s.W / s.cam.scale,
        vh = s.H / s.cam.scale;
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let gx = Math.floor(ox / gs) * gs; gx < ox + vw + gs; gx += gs)
        for (let gy = Math.floor(oy / gs) * gs; gy < oy + vh + gs; gy += gs) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      s.edges.forEach((e) => {
        const f = e.fromN,
          t = e.toN,
          dx = t.x - f.x,
          dy = t.y - f.y,
          d = Math.sqrt(dx * dx + dy * dy) || 1,
          nx = dx / d,
          ny = dy / d;
        const x1 = f.x + nx * f.r,
          y1 = f.y + ny * f.r,
          x2 = t.x - nx * t.r - nx * 8,
          y2 = t.y - ny * t.r - ny * 8;
        const active = s.selected && (s.selected.id === f.id || s.selected.id === t.id);
        if (active) {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = f.color.fill + "44";
          ctx.lineWidth = 6;
          ctx.stroke();
        }
        ctx.setLineDash(e.type === "N:M" ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = active ? f.color.fill : "rgba(217,79,61,.34)";
        ctx.lineWidth = active ? 1.8 : 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - nx * 9 - ny * 4.5, y2 - ny * 9 + nx * 4.5);
        ctx.lineTo(x2 - nx * 9 + ny * 4.5, y2 - ny * 9 - nx * 4.5);
        ctx.closePath();
        ctx.fillStyle = active ? f.color.fill : "rgba(217,79,61,.50)";
        ctx.fill();
        {
          const mx = (x1 + x2) / 2,
            my = (y1 + y2) / 2,
            off = active ? 0 : 8,
            lx = mx - ny * off,
            ly = my + nx * off;
          ctx.font = `${active ? 600 : 500} ${active ? 10 : 9}px inherit`;
          const tw = ctx.measureText(e.column).width + 16;
          ctx.fillStyle = active ? "rgba(10,10,14,.92)" : "rgba(10,10,14,.72)";
          roundRect(lx - tw / 2, ly - 10, tw, 18, 5);
          ctx.fill();
          ctx.strokeStyle = active ? f.color.fill + "66" : "rgba(217,79,61,.22)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = active ? f.color.light : "rgba(252,165,165,.72)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(e.column, lx, ly);
        }
      });
      s.nodes.forEach((n) => {
        const active = s.selected === n,
          hover = s.hover === n;
        ctx.save();
        ctx.translate(n.x, n.y);
        if (active || hover) {
          const g = ctx.createRadialGradient(0, 0, n.r * 0.6, 0, 0, n.r * 2.2);
          g.addColorStop(0, n.color.fill + (active ? "50" : "30"));
          g.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(0, 0, n.r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }
        const phase = (s.tick * 0.018 + s.nodes.indexOf(n) * 1.1) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(0, 0, n.r + 6 + Math.sin(phase) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = n.color.fill;
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = 0.18 + Math.sin(phase) * 0.08;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, n.r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(-n.r * 0.25, -n.r * 0.25, 0, 0, 0, n.r);
        grad.addColorStop(0, n.color.fill + "2a");
        grad.addColorStop(1, "#0a0a12");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = n.color.fill;
        ctx.lineWidth = active ? 2 : 1.5;
        ctx.globalAlpha = active ? 1 : 0.75;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = n.color.fill + "cc";
        ctx.fill();
        ctx.font = "600 11px 'DM Sans',sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = n.color.light;
        const words = n.id.replace(/_/g, " ").split(" ");
        if (words.length > 1) {
          ctx.fillText(words[0], 0, -12);
          ctx.fillText(words.slice(1).join(" "), 0, 4);
        } else ctx.fillText(n.id, 0, -7);
        ctx.font = "500 9px inherit";
        ctx.fillStyle = "rgba(255,255,255,.48)";
        ctx.fillText(`${n.rowCount} lignes`, 0, 18);
        if (s.showLabels) {
          const linked = new Set(
            s.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => e.column),
          );
          const labelFont = Math.max(10, Math.min(15, 10 + s.cam.scale * 2.5));
          n.headers.slice(0, 7).forEach((col, ci, cols) => {
            const a = -Math.PI * 0.7 + ci * ((Math.PI * 1.4) / Math.max(cols.length - 1, 1)),
              cr = n.r + 58,
              x = Math.cos(a) * cr,
              y = Math.sin(a) * cr,
              isLink = linked.has(col);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * n.r, Math.sin(a) * n.r);
            ctx.lineTo(x, y);
            ctx.strokeStyle = isLink ? "#34d399" : "rgba(255,255,255,.12)";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, isLink ? 4 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isLink ? "#34d399" : "rgba(255,255,255,.2)";
            ctx.fill();
            ctx.font = `500 ${labelFont}px inherit`;
            ctx.fillStyle = isLink ? "#6ee7b7" : "rgba(255,255,255,.48)";
            ctx.textAlign = Math.cos(a) > 0.1 ? "left" : Math.cos(a) < -0.1 ? "right" : "center";
            ctx.fillText(
              col.length > 18 ? col.slice(0, 18) + "..." : col,
              x + Math.cos(a) * 8,
              y + Math.sin(a) * 8,
            );
          });
        }
        ctx.restore();
      });
      ctx.restore();
      mctx.clearRect(0, 0, 96, 66);
      mctx.fillStyle = "rgba(13,13,18,.72)";
      mctx.fillRect(0, 0, 96, 66);
      if (s.nodes.length) {
        const xs = s.nodes.map((n) => n.x),
          ys = s.nodes.map((n) => n.y),
          minX = Math.min(...xs) - 70,
          maxX = Math.max(...xs) + 70,
          minY = Math.min(...ys) - 70,
          maxY = Math.max(...ys) + 70,
          ms = Math.min(86 / Math.max(1, maxX - minX), 58 / Math.max(1, maxY - minY));
        s.edges.forEach((e) => {
          mctx.beginPath();
          mctx.moveTo(5 + (e.fromN.x - minX) * ms, 4 + (e.fromN.y - minY) * ms);
          mctx.lineTo(5 + (e.toN.x - minX) * ms, 4 + (e.toN.y - minY) * ms);
          mctx.strokeStyle = "rgba(217,79,61,.35)";
          mctx.stroke();
        });
        s.nodes.forEach((n) => {
          mctx.beginPath();
          mctx.arc(5 + (n.x - minX) * ms, 4 + (n.y - minY) * ms, 4, 0, Math.PI * 2);
          mctx.fillStyle = n.color.fill;
          mctx.fill();
        });
      }
    };
    const loop = () => {
      s.tick++;
      applyPhysics();
      draw();
      s.raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(() => {
      resize();
      fitView();
    });
    ro.observe(canvas.parentElement);
    resize();
    fitView();
    loop();
    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
    };
  }, [fitView]);
  const screenToWorld = useCallback((sx, sy) => {
    const s = stateRef.current;
    return { x: (sx - s.cam.x) / s.cam.scale, y: (sy - s.cam.y) / s.cam.scale };
  }, []);
  const nodeAt = useCallback(
    (x, y) => stateRef.current.nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 10) || null,
    [],
  );
  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect(),
      sx = e.clientX - rect.left,
      sy = e.clientY - rect.top,
      w = screenToWorld(sx, sy),
      n = nodeAt(w.x, w.y),
      s = stateRef.current;
    if (n) {
      s.drag = n;
      s.dragStart = { x: sx, y: sy };
      n.vx = 0;
      n.vy = 0;
    } else {
      s.panStart = { x: sx, y: sy };
      s.panCam = { ...s.cam };
    }
  };
  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect(),
      sx = e.clientX - rect.left,
      sy = e.clientY - rect.top,
      w = screenToWorld(sx, sy),
      s = stateRef.current;
    if (s.drag) {
      s.drag.x = w.x;
      s.drag.y = w.y;
      return;
    }
    if (s.panStart) {
      s.cam.x = s.panCam.x + sx - s.panStart.x;
      s.cam.y = s.panCam.y + sy - s.panStart.y;
      return;
    }
    s.hover = nodeAt(w.x, w.y);
    canvasRef.current.style.cursor = s.hover ? "pointer" : "grab";
  };
  const handleMouseUp = (e) => {
    const s = stateRef.current;
    if (s.drag && s.dragStart) {
      const rect = canvasRef.current.getBoundingClientRect(),
        sx = e.clientX - rect.left,
        sy = e.clientY - rect.top;
      if (Math.abs(sx - s.dragStart.x) + Math.abs(sy - s.dragStart.y) < 6) {
        s.selected = s.selected === s.drag ? null : s.drag;
        setSelectedNode(s.selected);
        setPanelOpen(!!s.selected);
        onSelectTable(s.selected?.id || null);
      }
    }
    s.drag = null;
    s.panStart = null;
    s.dragStart = null;
  };
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect(),
        sx = e.clientX - rect.left,
        sy = e.clientY - rect.top,
        before = screenToWorld(sx, sy),
        s = stateRef.current;
      s.cam.scale = Math.max(0.25, Math.min(3.5, s.cam.scale * (e.deltaY < 0 ? 1.12 : 0.9)));
      const after = screenToWorld(sx, sy);
      s.cam.x += (after.x - before.x) * s.cam.scale;
      s.cam.y += (after.y - before.y) * s.cam.scale;
    },
    [screenToWorld],
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);
  if (!tables.length)
    return (
      <div
        style={{
          height,
          background: INTEGRATION_COLORS.canvas,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,.28)",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Network size={32} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>Aucune table à afficher</span>
      </div>
    );
  const nodeRels = selectedNode
    ? stateRef.current.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
    : [];
  const linkedCols = new Set(nodeRels.map((e) => e.column));
  return (
    <div
      className="force-canvas-root"
      style={{
        height,
        border: "1px solid rgba(255,255,255,.07)",
        borderTop: 0,
        borderRadius: fullscreen ? 0 : "0 0 14px 14px",
      }}
    >
      <canvas
        ref={(el) => {
          setRefNode(canvasRef, el);
        }}
        style={{ display: "block", cursor: "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className={`graph-panel${panelOpen ? "" : " closed"}`}>
        {selectedNode && (
          <>
            <div className="graph-panel-header">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: selectedNode.color.fill,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#e4e4e7",
                  flex: 1,
                  fontFamily: "inherit",
                }}
              >
                {selectedNode.id}
              </div>
              <button
                onClick={() => {
                  stateRef.current.selected = null;
                  setSelectedNode(null);
                  setPanelOpen(false);
                  onSelectTable(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#71717a",
                  cursor: "pointer",
                }}
              >
                <X size={13} />
              </button>
            </div>
            <div className="graph-panel-body">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#52525b",
                  textTransform: "uppercase",
                }}
              >
                Aperçu
              </div>
              {[
                ["Colonnes", selectedNode.headers.length],
                ["Lignes", selectedNode.rowCount.toLocaleString("fr-FR")],
                ["Relations", nodeRels.length],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: "1px solid rgba(255,255,255,.04)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#a1a1aa" }}>{k}</span>
                  <span style={{ fontFamily: "inherit", color: "#fca5a5", fontSize: 11 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
                {selectedNode.headers.map((col) => (
                  <span
                    key={col}
                    style={{
                      padding: "2px 7px",
                      borderRadius: 5,
                      fontSize: 9,
                      fontFamily: "inherit",
                      background: linkedCols.has(col)
                        ? "rgba(52,211,153,.12)"
                        : "rgba(255,255,255,.04)",
                      color: linkedCols.has(col) ? "#34d399" : "#a1a1aa",
                      border: linkedCols.has(col)
                        ? "1px solid rgba(52,211,153,.25)"
                        : "1px solid rgba(255,255,255,.07)",
                    }}
                  >
                    {col.length > 15 ? col.slice(0, 15) + "..." : col}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="graph-legend">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            color: "#71717a",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: INTEGRATION_COLORS.red,
            }}
          />
          Table
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            color: "#71717a",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#34d399",
            }}
          />
          Colonne liée
        </div>
        <div className="graph-control-cluster">
          <button
            className={`graph-btn${physicsOn ? " active" : ""}`}
            onClick={() => setPhysicsOn((p) => !p)}
          >
            Physics
          </button>
          <button
            className={`graph-btn${showLabels ? " active" : ""}`}
            onClick={() => setShowLabels((p) => !p)}
          >
            Colonnes
          </button>
          <button className="graph-btn" onClick={fitView}>
            Ajuster
          </button>
        </div>
      </div>
      <canvas ref={minimapRef} className="graph-minimap" />
      <div className="graph-hint">Glisser · molette pour zoomer · clic pour inspecter</div>
    </div>
  );
}

/* ─── WIZARD STEPS ──────────────────────────────────────────── */
