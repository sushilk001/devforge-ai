// ── AgentThinking ────────────────────────────────────────────────────────────
// Typewriter "reasoning" stream for the 4-agent PR-review panel while a review
// is in flight. Presentational — conveys that each agent is actively working.
import { useState, useEffect } from "react";

const THINK = {
  security: [
    "scanning for injection vectors…",
    "checking reset-token entropy…",
    "auditing auth + session flow…",
    "reviewing secrets handling…",
  ],
  quality: [
    "measuring cyclomatic complexity…",
    "checking naming + cohesion…",
    "flagging duplicated logic…",
    "reviewing error handling…",
  ],
  coverage: [
    "mapping tests → acceptance criteria…",
    "finding uncovered branches…",
    "checking edge + failure cases…",
    "verifying fixtures + mocks…",
  ],
  architecture: [
    "reviewing module boundaries…",
    "checking dependency direction…",
    "assessing abstractions…",
    "validating patterns + layering…",
  ],
};

export default function AgentThinking({ agent, color }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const lines = THINK[agent] || ["analysing…"];
    let li = 0, ci = 0, alive = true, timer;
    const tick = () => {
      if (!alive) return;
      const line = lines[li];
      if (ci <= line.length) { setText(line.slice(0, ci)); ci++; timer = setTimeout(tick, 34); }
      else { timer = setTimeout(() => { li = (li + 1) % lines.length; ci = 0; tick(); }, 1100); }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [agent]);

  return (
    <div style={{ fontSize: 9, lineHeight: 1.5, opacity: .72, color, marginTop: 4, minHeight: 14, fontFamily: "'Space Mono',monospace" }}>
      {text}<span className="df-cursor">▌</span>
    </div>
  );
}
