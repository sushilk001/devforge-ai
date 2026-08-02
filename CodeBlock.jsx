// ── CodeBlock ────────────────────────────────────────────────────────────────
// Dependency-free syntax highlighter for the Code Gen preview. One combined
// regex tokenizes comments/strings/keywords/etc.; tokens render as colored
// spans (no dangerouslySetInnerHTML — text stays escaped by React).

const RULES = [
  ["comment",   /#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/],
  ["string",    /"""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/],
  ["tag",       /<\/?[A-Za-z][\w.-]*/],
  ["decorator", /@[A-Za-z_]\w*/],
  ["keyword",   /\b(?:def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|raise|in|not|and|or|is|None|True|False|self|lambda|yield|pass|break|continue|global|nonlocal|async|await|const|let|var|function|export|default|extends|new|this|typeof|instanceof|throw|catch|of|null|undefined|true|false|void)\b/],
  ["number",    /\b\d+(?:\.\d+)?\b/],
  ["func",      /[A-Za-z_]\w*(?=\s*\()/],
];

const COLORS = {
  comment: "#5c6b7a", string: "#7fe0a0", tag: "#00d4ff", decorator: "#e066ff",
  keyword: "#bf7fff", number: "#ffaa00", func: "#00d4ff", plain: "#c8d6e8",
};

const COMBINED = new RegExp(RULES.map(([, re]) => `(${re.source})`).join("|"), "g");

export default function CodeBlock({ code = "", style }) {
  const tokens = [];
  let last = 0, m;
  COMBINED.lastIndex = 0;
  while ((m = COMBINED.exec(code)) !== null) {
    if (m[0].length === 0) { COMBINED.lastIndex++; continue; } // zero-length guard
    if (m.index > last) tokens.push({ t: code.slice(last, m.index), c: "plain" });
    let type = "plain";
    for (let i = 0; i < RULES.length; i++) { if (m[i + 1] !== undefined) { type = RULES[i][0]; break; } }
    tokens.push({ t: m[0], c: type });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ t: code.slice(last), c: "plain" });

  return (
    <pre style={{
      fontSize: 8, lineHeight: 1.6, fontFamily: "'Space Mono',monospace", padding: "8px 11px",
      margin: "0 0 4px 0", borderRadius: 3, background: "rgba(0,0,0,0.5)",
      border: "1px solid rgba(191,95,255,0.12)", overflow: "auto", maxHeight: 240,
      whiteSpace: "pre", ...style,
    }}>
      {tokens.map((tk, i) => <span key={i} style={{ color: COLORS[tk.c] }}>{tk.t}</span>)}
    </pre>
  );
}
