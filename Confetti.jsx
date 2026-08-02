// ── Confetti ─────────────────────────────────────────────────────────────────
// One-shot celebratory burst for the "shipped to production" moment.
// Pieces are generated once (useState initializer) so re-renders don't restart it.
import { useState } from "react";

const COLORS = ["#00d4ff", "#00ff88", "#bf5fff", "#ffaa00", "#ff2d6b", "#2dd4bf"];

export default function Confetti({ count = 70 }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      bg: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5,
      dur: 2.4 + Math.random() * 2,
      rot: Math.random() * 360,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 9,
      drift: (Math.random() - 0.5) * 160,
    }))
  );

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 9998 }}>
      <style>{`@keyframes dfConfFall{0%{transform:translate3d(0,-12vh,0) rotate(0);opacity:1}100%{transform:translate3d(var(--dx),112vh,0) rotate(720deg);opacity:0}}`}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: 0, left: `${p.left}%`, width: p.w, height: p.h,
          background: p.bg, borderRadius: 1, "--dx": `${p.drift}px`,
          animation: `dfConfFall ${p.dur}s ${p.delay}s cubic-bezier(.25,.6,.55,1) forwards`,
        }} />
      ))}
    </div>
  );
}
