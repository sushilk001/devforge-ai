// ── DependencyGraph ──────────────────────────────────────────────────────────
// Self-contained SVG DAG for Stage 2 output. Uses the backend's parallel_tracks
// as layout levels and critical_path for highlighting. No external deps.

const TYPE_COLORS = {
  feature: "#00d4ff", chore: "#bf5fff", testing: "#2dd4bf",
  bug: "#ff2d6b", docs: "#8899aa", spike: "#ffaa00",
};
const CRIT = "#ffd166";

export default function DependencyGraph({ tasks = [], graph }) {
  if (!graph || !tasks.length) return null;

  const taskById = Object.fromEntries(tasks.map(t => [t.id, t]));
  const levels = (graph.parallel_tracks && graph.parallel_tracks.length)
    ? graph.parallel_tracks
    : [tasks.map(t => t.id)];
  const edges = (graph.edges && graph.edges.length)
    ? graph.edges
    : tasks.flatMap(t => (t.dependencies || []).map(d => ({ from_task: d, to_task: t.id })));
  const critSet = new Set(graph.critical_path || []);

  // ── Layout ──
  const NODE_W = 160, NODE_H = 50, GAP_X = 26, GAP_Y = 40, PAD = 18;
  const maxCols = Math.max(1, ...levels.map(l => l.length));
  const width  = PAD * 2 + maxCols * NODE_W + (maxCols - 1) * GAP_X;
  const height = PAD * 2 + levels.length * NODE_H + (levels.length - 1) * GAP_Y;

  const pos = {};
  levels.forEach((lvl, li) => {
    const rowW = lvl.length * NODE_W + (lvl.length - 1) * GAP_X;
    const startX = PAD + (width - PAD * 2 - rowW) / 2;
    lvl.forEach((id, ci) => {
      pos[id] = { x: startX + ci * (NODE_W + GAP_X), y: PAD + li * (NODE_H + GAP_Y) };
    });
  });

  const totalH = graph.total_estimated_hours
    || tasks.reduce((a, t) => a + (t.estimate_hours || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 8, letterSpacing: 3, color: "rgba(0,212,255,.55)", textTransform: "uppercase" }}>
          Dependency Graph
        </span>
        <span style={{ fontSize: 9, opacity: .5 }}>
          {tasks.length} tasks · {Number(totalH).toFixed(1)}h · {levels.length} parallel tracks
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, marginLeft: "auto", color: CRIT }}>
          <span style={{ width: 14, height: 2, background: CRIT, display: "inline-block", borderRadius: 2 }} />
          critical path ({(graph.critical_path || []).length})
        </span>
      </div>

      <div style={{
        overflow: "auto", maxHeight: 360, borderRadius: 6,
        border: "1px solid rgba(0,255,136,.12)", background: "rgba(0,0,0,.25)", padding: 4,
      }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {/* edges */}
          {edges.map((e, i) => {
            const a = pos[e.from_task], b = pos[e.to_task];
            if (!a || !b) return null;
            const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
            const x2 = b.x + NODE_W / 2, y2 = b.y;
            const my = (y1 + y2) / 2;
            const isCrit = critSet.has(e.from_task) && critSet.has(e.to_task);
            return (
              <path key={i}
                d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                fill="none"
                stroke={isCrit ? CRIT : "rgba(0,255,136,.28)"}
                strokeWidth={isCrit ? 2 : 1.3}
                strokeDasharray={isCrit ? "none" : "3 3"}
              />
            );
          })}
          {/* nodes */}
          {Object.entries(pos).map(([id, p]) => {
            const t = taskById[id] || { id, title: id, type: "feature", estimate_hours: 0 };
            const color = TYPE_COLORS[t.type] || "#00ff88";
            const isCrit = critSet.has(id);
            const title = (t.title || "").length > 22 ? (t.title || "").slice(0, 21) + "…" : (t.title || "");
            return (
              <g key={id}>
                <title>{`${id} · ${t.title || ""} — ${t.estimate_hours || 0}h${isCrit ? " · CRITICAL PATH" : ""}`}</title>
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={7}
                  fill={`${color}14`} stroke={isCrit ? CRIT : color}
                  strokeWidth={isCrit ? 2 : 1.2} />
                {isCrit && <rect x={p.x} y={p.y} width={3} height={NODE_H} rx={1.5} fill={CRIT} />}
                <text x={p.x + 10} y={p.y + 18} fontFamily="'Space Mono',monospace" fontSize={9}
                  fontWeight="700" fill={color}>{id}</text>
                <text x={p.x + NODE_W - 10} y={p.y + 18} fontFamily="'Space Mono',monospace"
                  fontSize={8} textAnchor="end" fill="rgba(200,214,232,.6)">{t.estimate_hours || 0}h</text>
                <text x={p.x + 10} y={p.y + 35} fontFamily="'Space Mono',monospace" fontSize={9}
                  fill="rgba(232,244,255,.82)">{title}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
