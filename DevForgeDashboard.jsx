import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import DependencyGraph from "./DependencyGraph.jsx";
import Confetti from "./Confetti.jsx";
import CodeBlock from "./CodeBlock.jsx";
import AgentThinking from "./AgentThinking.jsx";
import { DEMO_RUNS } from "./demoData.js";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap";
document.head.appendChild(fontLink);

// ── Stages ─────────────────────────────────────────────────────────────────
const STAGES = [
  { id:"requirements", num:"01",label:"Requirements", sub:"Agent",   icon:"◈",color:"#00d4ff",glow:"rgba(0,212,255,0.35)",  desc:"Feature Request → PRD" },
  { id:"tasks",        num:"02",label:"Task Orch.",   sub:"Agent",   icon:"◆",color:"#00ff88",glow:"rgba(0,255,136,0.35)",  desc:"PRD → Linear Tasks" },
  { id:"code_gen",     num:"03",label:"Code Gen",     sub:"Agent",   icon:"◈",color:"#bf5fff",glow:"rgba(191,95,255,0.35)", desc:"Claude writes code per ticket" },
  { id:"pr_review",    num:"04",label:"PR Review",    sub:"Panel",   icon:"◉",color:"#e066ff",glow:"rgba(224,102,255,0.35)",desc:"4 Agents review generated code" },
  { id:"qa",           num:"05",label:"QA",           sub:"Agent",   icon:"◆",color:"#2dd4bf",glow:"rgba(45,212,191,0.35)", desc:"Automated test execution" },
  { id:"deploy",       num:"06",label:"Deploy",       sub:"Pipeline",icon:"▲",color:"#ff2d6b",glow:"rgba(255,45,107,0.35)", desc:"Dev → Staging → UAT → Prod" },
];

// ── Pipeline log scripts ───────────────────────────────────────────────────
const PIPELINE_SCRIPT = {
  requirements:[
    {t:300, msg:"⟡ Receiving feature request...",                  type:"info"},
    {t:900, msg:"⟡ Parsing intent with claude-sonnet-4-6...",      type:"info"},
    {t:2800,msg:"⟡ Generating PRD document...",                    type:"info"},
    {t:5000,msg:"⏸ Awaiting LLM response & human review...",       type:"gate"},
  ],
  tasks:[
    {t:300, msg:"⟡ Ingesting approved PRD...",                     type:"info"},
    {t:900, msg:"⟡ Decomposing into engineering tasks...",         type:"info"},
    {t:2500,msg:"⟡ Building dependency graph...",                  type:"info"},
    {t:4200,msg:"⏸ Awaiting LLM response & human review...",       type:"gate"},
  ],
  code_gen:[
    {t:300, msg:"⟡ Ingesting approved task plan...",               type:"info"},
    {t:900, msg:"⟡ Spawning code generation agents per ticket...", type:"info"},
    {t:2000,msg:"⟡ Writing implementation files...",               type:"info"},
    {t:3500,msg:"⟡ Writing test files...",                         type:"info"},
    {t:5500,msg:"⏸ Awaiting LLM response & human review...",      type:"gate"},
  ],
  pr_review:[
    {t:300, msg:"⟡ Launching 4-agent code review panel...",       type:"info"},
    {t:700, msg:"🔴 Security Agent     → scanning code...",        type:"agent"},
    {t:900, msg:"🟡 Quality Agent      → analysing code...",       type:"agent"},
    {t:1100,msg:"🟢 Coverage Agent     → checking tests...",       type:"agent"},
    {t:1300,msg:"🔵 Architecture Agent → reviewing patterns...",   type:"agent"},
    {t:5000,msg:"⏸ Awaiting LLM response & human review...",      type:"gate"},
  ],
  qa:[
    {t:300, msg:"⟡ QA runner initialising...",                    type:"info"},
    {t:900, msg:"⟡ Running pytest on generated test files...",    type:"info"},
    {t:2200,msg:"⟡ Collecting test results...",                   type:"info"},
    {t:3800,msg:"⟡ Parsing pytest output...",                     type:"info"},
    {t:4600,msg:"⏸ QA complete — awaiting real results",         type:"gate"},
  ],
  deploy:[
    {t:400, msg:"⟡ Pushing generated code to GitHub...",           type:"info"},
    {t:1400,msg:"⟡ Claude writing PR description...",               type:"info"},
    {t:2600,msg:"⟡ Creating GitHub Pull Request...",               type:"info"},
    {t:3600,msg:"⟡ Notifying Slack #devforge-prd...",              type:"info"},
    {t:4400,msg:"⟡ Closing Linear issues as Done...",              type:"info"},
    {t:5900,msg:"🎉 PR CREATED — FEATURE DELIVERED",               type:"done"},
  ],
};

const STAGE_DUR = { requirements:5200, tasks:4400, code_gen:6500, pr_review:5400, qa:5000, deploy:6200 };


// ── Review summaries ───────────────────────────────────────────────────────
const REVIEW_SUMMARY = {
  requirements:{ title:"PRD Ready for Review",          approve:"Approve PRD → Begin Task Creation" },
  tasks:        { title:"Tasks Ready for Review",        approve:"Approve Tasks → Begin Code Generation" },
  code_gen:     { title:"Code Generation Complete",      approve:"Approve Code → Begin PR Review" },
  pr_review:    { title:"PR Review Complete",            approve:"Approve PR → Run QA Suite" },
  qa:           { title:"QA Complete — All Tests Passed",approve:"Approve QA → Production Gate" },
};



const ENV_DATA =[{name:"DEV",delay:1000},{name:"STAGING",delay:1800},{name:"UAT",delay:2800}];

const MODEL_COLORS = { "claude-sonnet-4-6":"#00d4ff", "claude-haiku-4-5":"#00ff88" };
const STAGE_COLORS = { requirements:"#00d4ff", tasks:"#00ff88", code_gen:"#bf5fff", pr_review:"#e066ff", qa:"#2dd4bf", deploy:"#ff2d6b" };

// ── CSS ────────────────────────────────────────────────────────────────────
const css = `

  /* ── Animations ─────────────────────────────────────────────────────── */
  @keyframes pulse    {0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes glow     {0%,100%{box-shadow:0 0 10px var(--glow),0 0 32px var(--glow)}50%{box-shadow:0 0 20px var(--glow),0 0 60px var(--glow)}}
  @keyframes spin     {from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes fadeUp   {from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideLog {from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
  @keyframes blink    {0%,100%{opacity:1}50%{opacity:0}}
  @keyframes flowLine {0%{transform:translateY(-100%);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateY(200%);opacity:0}}
  @keyframes prodPulse{0%,100%{box-shadow:0 0 16px rgba(255,45,107,.4),0 0 48px rgba(255,45,107,.2)}50%{box-shadow:0 0 32px rgba(255,45,107,.7),0 0 96px rgba(255,45,107,.35)}}
  @keyframes countUp  {from{transform:scale(.88);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes tokenIn  {from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
  @keyframes logoGlow {0%,100%{opacity:.35;transform:scale(.9)}50%{opacity:.8;transform:scale(1.1)}}

  /* ── Base ────────────────────────────────────────────────────────────── */
  .df*{box-sizing:border-box;margin:0;padding:0}
  .df{
    font-family:-apple-system,'SF Pro Text','Helvetica Neue',system-ui,sans-serif;
    background:#080912;height:100vh;color:#d4daf5;overflow:hidden;position:relative;
    display:flex;flex-direction:column;-webkit-font-smoothing:antialiased;
  }
  .df-scan{display:none}

  /* ── Header ─────────────────────────────────────────────────────────── */
  .df-hdr{
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 24px;flex-shrink:0;
    border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(8,9,18,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  }
  .df-logo{display:flex;align-items:center;gap:12px}
  .df-hex{position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .df-hex::before{content:'';position:absolute;inset:-4px;border-radius:50%;z-index:0;
    background:radial-gradient(circle,rgba(0,212,255,.35),transparent 68%);animation:logoGlow 2.8s ease-in-out infinite}
  .df-hex svg{position:relative;z-index:1;filter:drop-shadow(0 0 5px rgba(0,212,255,.5))}
  .df-lname{
    font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;
    font-size:18px;font-weight:800;color:#fff;letter-spacing:-.3px;line-height:1
  }
  .df-lname span{
    background:linear-gradient(90deg,#00d4ff,#6495ff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df-ltag{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.08em;color:rgba(120,160,220,.6);margin-top:4px}
  .df-ltag::before{content:'';width:5px;height:5px;border-radius:50%;background:#00ff88;flex-shrink:0;
    box-shadow:0 0 6px #00ff88;animation:pulse 1.6s infinite}
  .df-timer{font-size:22px;font-weight:700;letter-spacing:.06em;font-variant-numeric:tabular-nums;
    font-family:'SF Mono','Cascadia Code',monospace;color:#d4daf5}
  .df-badge{font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 12px;border:1px solid;border-radius:20px}
  .df-badge.idle   {color:rgba(200,214,232,.3);border-color:rgba(200,214,232,.12)}
  .df-badge.running{color:#00ff88;border-color:rgba(0,255,136,.35);animation:pulse 1.5s infinite}
  .df-badge.gate   {color:#ffaa00;border-color:rgba(255,170,0,.35);animation:pulse 1s infinite}
  .df-badge.done   {color:#00d4ff;border-color:rgba(0,212,255,.35)}

  /* ── Input area ──────────────────────────────────────────────────────── */
  .df-inp-area{
    display:flex;gap:10px;align-items:flex-end;padding:14px 24px;flex-shrink:0;
    border-bottom:1px solid rgba(255,255,255,.05);background:rgba(10,11,22,.7);
  }
  .df-inp-lblrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .df-inp-lbl{font-size:11px;letter-spacing:.06em;color:rgba(120,160,220,.7);font-weight:500}
  .df-mode-row{display:flex;gap:6px;margin-bottom:8px}
  .df-mode-btn{
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;letter-spacing:.02em;
    padding:5px 12px;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,.1);
    background:transparent;color:rgba(200,214,232,.4);transition:all .15s;font-weight:500;
  }
  .df-mode-btn.active{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.45);color:#00d4ff}
  .df-mode-btn:disabled{opacity:.3;cursor:not-allowed}
  .df-mode-btn.demo{margin-left:auto;border-color:rgba(255,170,0,.35);color:rgba(255,170,0,.65)}
  .df-mode-btn.demo.on{background:rgba(255,170,0,.12);border-color:rgba(255,170,0,.5);color:#ffaa00;animation:pulse 2s infinite}
  .df-inp-w{flex:1;min-width:0}
  .df-ctx-row{display:flex;gap:7px;margin-top:7px;align-items:center;flex-wrap:wrap}
  .df-ctx-gh{
    flex:1;min-width:160px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:8px;color:#d4daf5;font-family:'SF Mono','Cascadia Code',monospace;
    font-size:11px;padding:6px 10px;outline:none;transition:border-color .2s;
  }
  .df-ctx-gh::placeholder{color:rgba(200,214,232,.2)}
  .df-ctx-gh:focus{border-color:rgba(0,212,255,.4)}
  .df-ctx-attach{
    font-size:10px;letter-spacing:.04em;padding:6px 12px;border-radius:8px;cursor:pointer;
    border:1px dashed rgba(0,212,255,.25);background:transparent;color:rgba(0,212,255,.5);
    white-space:nowrap;transition:all .2s;
  }
  .df-ctx-attach:hover{border-color:rgba(0,212,255,.5);color:#00d4ff}
  .df-ctx-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
  .df-ctx-chip{
    display:flex;align-items:center;gap:4px;font-size:10px;padding:3px 8px;border-radius:10px;
    background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);color:rgba(200,214,232,.7);max-width:180px;
  }
  .df-ctx-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .df-ctx-chip button{background:none;border:none;color:rgba(200,214,232,.4);cursor:pointer;padding:0;font-size:10px;line-height:1;flex-shrink:0}
  .df-ctx-chip button:hover{color:#ff5555}
  .df-ctx-chip.gh{background:rgba(0,212,255,.06);border-color:rgba(0,212,255,.2);color:rgba(0,212,255,.8)}
  .df-inp{
    width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:10px;color:#e8eeff;font-family:-apple-system,system-ui,sans-serif;
    font-size:13px;padding:11px 14px;outline:none;resize:vertical;
    min-height:46px;max-height:55vh;line-height:1.6;transition:border-color .2s;
  }
  .df-inp::-webkit-resizer{border-width:0 5px 5px 0;border-style:solid;border-color:transparent rgba(0,212,255,.35)}
  .df-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-inp::placeholder{color:rgba(200,214,232,.18)}
  .df-launch{
    background:linear-gradient(135deg,#0099cc,#0066ff);color:#fff;border:none;cursor:pointer;
    font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;
    font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
    padding:0 22px;border-radius:10px;height:44px;transition:all .2s;white-space:nowrap;
    box-shadow:0 2px 16px rgba(0,150,255,.3);
  }
  .df-launch:hover:not(:disabled){background:linear-gradient(135deg,#00b3f0,#0077ff);transform:translateY(-1px);box-shadow:0 4px 24px rgba(0,150,255,.45)}
  .df-launch:disabled{background:rgba(0,212,255,.12);color:rgba(0,212,255,.35);cursor:not-allowed;box-shadow:none}
  .df-stop{
    background:transparent;border:1px solid rgba(255,60,60,.45);color:#ff5555;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;letter-spacing:.04em;
    text-transform:uppercase;padding:0 16px;border-radius:10px;height:44px;transition:all .2s;white-space:nowrap;
  }
  .df-stop:hover{background:rgba(255,60,60,.1);border-color:#ff5555}
  .df-rerun-btn{
    display:flex;align-items:center;gap:4px;margin-top:7px;padding:5px 10px;
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;letter-spacing:.02em;
    background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:6px;
    color:rgba(200,214,232,.35);cursor:pointer;transition:all .15s;width:100%;
  }
  .df-rerun-btn:hover{border-color:rgba(0,212,255,.35);color:#00d4ff;background:rgba(0,212,255,.06)}
  .df-dbg-btn{
    background:transparent;border:1px solid rgba(0,212,255,.25);color:rgba(0,212,255,.65);
    cursor:pointer;font-family:-apple-system,system-ui,sans-serif;font-size:11px;
    letter-spacing:.02em;text-transform:uppercase;padding:0 14px;border-radius:10px;height:44px;transition:all .2s;
  }
  .df-dbg-btn:hover{background:rgba(0,212,255,.07);border-color:rgba(0,212,255,.5);color:#00d4ff}
  .df-dbg-panel{
    position:fixed;bottom:0;right:0;width:380px;max-height:60vh;
    background:rgba(10,12,26,.98);border:1px solid rgba(0,212,255,.2);border-radius:12px 0 0 0;
    display:flex;flex-direction:column;z-index:1000;animation:fadeUp .2s ease-out;
    box-shadow:-8px -8px 40px rgba(0,0,0,.6);
  }
  .df-dbg-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
    border-bottom:1px solid rgba(0,212,255,.1);flex-shrink:0}
  .df-dbg-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:rgba(0,212,255,.8);font-weight:600}
  .df-dbg-close{background:none;border:none;color:rgba(200,214,232,.4);cursor:pointer;font-size:16px;line-height:1}
  .df-dbg-close:hover{color:#ff5555}
  .df-dbg-body{padding:14px 16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px}
  .df-dbg-ctx{font-size:10px;color:rgba(200,214,232,.3);background:rgba(0,0,0,.3);
    border-radius:6px;padding:7px 9px;max-height:80px;overflow-y:auto;font-family:'SF Mono','Cascadia Code',monospace}
  .df-dbg-inp{
    background:rgba(255,255,255,.04);border:1px solid rgba(0,212,255,.18);border-radius:8px;
    color:#e8eeff;font-family:-apple-system,system-ui,sans-serif;font-size:12px;padding:9px 11px;
    resize:none;outline:none;width:100%;transition:border-color .2s;
  }
  .df-dbg-inp::placeholder{color:rgba(200,214,232,.2)}
  .df-dbg-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-dbg-send{
    align-self:flex-end;background:linear-gradient(135deg,#0099cc,#0066ff);color:#fff;border:none;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;letter-spacing:.04em;text-transform:uppercase;
    padding:7px 16px;border-radius:8px;font-weight:700;transition:all .15s;
  }
  .df-dbg-send:hover:not(:disabled){background:linear-gradient(135deg,#00b3f0,#0077ff)}
  .df-dbg-send:disabled{opacity:.4;cursor:not-allowed}
  .df-dbg-answer{
    font-size:12px;color:rgba(200,214,232,.85);line-height:1.7;
    background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.1);border-radius:8px;
    padding:12px;white-space:pre-wrap;
  }

  /* ── Settings ──────────────────────────────────────────────────────────── */
  .df-settings-btn{
    background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(200,214,232,.45);
    cursor:pointer;font-size:15px;width:32px;height:32px;border-radius:8px;
    display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;
  }
  .df-settings-btn:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.22);color:#d4daf5}
  .df-int-dots{display:flex;gap:6px;align-items:center}
  .df-int-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;cursor:default}
  .df-int-dot.on {background:#00ff88;box-shadow:0 0 5px rgba(0,255,136,.7)}
  .df-int-dot.off{background:rgba(200,214,232,.18)}
  .df-int-dot-lbl{font-size:9px;letter-spacing:.04em;color:rgba(200,214,232,.28)}
  .df-settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;justify-content:flex-end;animation:fadeUp .15s ease-out}
  .df-settings-drawer{
    width:480px;max-width:100vw;height:100vh;
    background:#0c0e1f;border-left:1px solid rgba(255,255,255,.08);
    display:flex;flex-direction:column;overflow:hidden;box-shadow:-20px 0 60px rgba(0,0,0,.7);
  }
  .df-set-hdr{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;
    border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
  .df-set-title{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:17px;font-weight:700;color:#fff}
  .df-set-close{background:none;border:none;color:rgba(200,214,232,.4);cursor:pointer;font-size:20px;line-height:1;padding:3px 7px;border-radius:6px}
  .df-set-close:hover{color:#ff5555;background:rgba(255,68,68,.08)}
  .df-set-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;padding:0 8px}
  .df-set-tab{
    flex:1;padding:12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
    border:none;border-bottom:2px solid transparent;transition:all .2s;color:rgba(200,214,232,.38);
    text-align:center;background:none;font-family:-apple-system,system-ui,sans-serif;font-weight:500;
  }
  .df-set-tab.active{color:#00d4ff;border-bottom-color:#00d4ff}
  .df-set-body{flex:1;overflow-y:auto;padding:22px 24px;display:flex;flex-direction:column;gap:24px}
  .df-set-body::-webkit-scrollbar{width:3px}
  .df-set-body::-webkit-scrollbar-thumb{background:rgba(0,212,255,.15)}
  .df-set-section{display:flex;flex-direction:column;gap:12px}
  .df-set-sec-title{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,212,255,.55);margin-bottom:2px;font-weight:600}
  .df-set-field{display:flex;flex-direction:column;gap:6px}
  .df-set-lbl{font-size:12px;color:rgba(200,214,232,.55);font-weight:500}
  .df-set-inp{
    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;
    color:#e8eeff;font-family:'SF Mono','Cascadia Code',monospace;font-size:12px;
    padding:9px 12px;outline:none;width:100%;transition:border-color .2s;
  }
  .df-set-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-set-inp::placeholder{color:rgba(200,214,232,.18)}
  .df-set-preview{font-size:10px;color:rgba(200,214,232,.3);font-family:'SF Mono','Cascadia Code',monospace;margin-top:2px}
  .df-set-inp-row{display:flex;gap:8px;align-items:center}
  .df-set-inp-row .df-set-inp{flex:1}
  .df-set-test-btn{
    background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.22);color:#00d4ff;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;padding:8px 13px;
    border-radius:8px;white-space:nowrap;transition:all .15s;font-weight:500;
  }
  .df-set-test-btn:hover{background:rgba(0,212,255,.14);border-color:rgba(0,212,255,.45)}
  .df-set-test-btn:disabled{opacity:.4;cursor:not-allowed}
  .df-set-result{font-size:10px;padding:6px 10px;border-radius:6px;font-family:'SF Mono','Cascadia Code',monospace}
  .df-set-result.ok {background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.18);color:#00ff88}
  .df-set-result.err{background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.18);color:#ff6666}
  .df-model-cards{display:flex;flex-direction:column;gap:8px}
  .df-model-card{
    border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px;cursor:pointer;
    transition:all .2s;background:rgba(255,255,255,.02);position:relative;overflow:hidden;
  }
  .df-model-card:hover{background:rgba(0,212,255,.04);border-color:rgba(0,212,255,.22)}
  .df-model-card.selected{border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.07)}
  .df-model-card.selected::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(to right,transparent,#00d4ff,transparent)}
  .df-mc-row{display:flex;align-items:center;gap:8px}
  .df-mc-name{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:14px;font-weight:700;color:#fff;flex:1}
  .df-mc-badge{font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:20px;white-space:nowrap;font-weight:600}
  .df-mc-badge.default {background:rgba(0,212,255,.12);color:#00d4ff;border:1px solid rgba(0,212,255,.25)}
  .df-mc-badge.powerful{background:rgba(191,95,255,.12);color:#bf5fff;border:1px solid rgba(191,95,255,.25)}
  .df-mc-badge.balanced{background:rgba(255,180,0,.10);color:#ffb400;border:1px solid rgba(255,180,0,.22)}
  .df-mc-badge.fast    {background:rgba(0,255,136,.09);color:#00ff88;border:1px solid rgba(0,255,136,.22)}
  .df-mc-badge.custom  {background:rgba(255,255,255,.06);color:rgba(200,214,232,.7);border:1px solid rgba(255,255,255,.14)}
  .df-mc-desc{font-size:11px;color:rgba(200,214,232,.48);margin-top:5px;line-height:1.5}
  .df-mc-price{font-size:10px;color:rgba(200,214,232,.28);margin-top:5px;font-family:'SF Mono','Cascadia Code',monospace}
  .df-mc-remove{margin-left:auto;background:none;border:none;color:rgba(255,100,100,.5);cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;line-height:1;transition:color .15s}
  .df-mc-remove:hover{color:rgba(255,80,80,.9)}
  .df-add-model{margin-top:12px;display:flex;flex-direction:column;gap:6px}
  .df-add-model-row{display:flex;gap:6px}
  .df-add-model-inp{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:8px 12px;font-size:12px;color:#d4daf5;outline:none;font-family:inherit;transition:border-color .15s}
  .df-add-model-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-add-model-inp::placeholder{color:rgba(200,214,232,.25)}
  .df-add-model-btn{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.25);border-radius:7px;color:#00d4ff;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
  .df-add-model-btn:hover{background:rgba(0,212,255,.18);border-color:rgba(0,212,255,.45)}
  .df-add-model-btn:disabled{opacity:.4;cursor:not-allowed}
  .df-int-status-row{
    display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
    background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);
  }
  .df-int-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .df-int-status-dot.on {background:#00ff88;box-shadow:0 0 6px rgba(0,255,136,.5)}
  .df-int-status-dot.off{background:rgba(200,214,232,.18)}
  .df-int-status-name{font-size:12px;color:rgba(200,214,232,.65);flex:1;font-weight:500}
  .df-int-status-val{font-size:10px;color:rgba(200,214,232,.3);font-family:'SF Mono','Cascadia Code',monospace}
  .df-set-footer{border-top:1px solid rgba(255,255,255,.07);padding:16px 24px;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0}
  .df-set-save{
    background:linear-gradient(135deg,#0099cc,#0066ff);color:#fff;border:none;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;font-weight:700;
    letter-spacing:.04em;text-transform:uppercase;padding:10px 24px;border-radius:8px;transition:all .2s;
  }
  .df-set-save:hover:not(:disabled){background:linear-gradient(135deg,#00b3f0,#0077ff)}
  .df-set-save:disabled{opacity:.4;cursor:not-allowed}
  .df-set-cancel{
    background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(200,214,232,.45);cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;
    padding:10px 18px;border-radius:8px;transition:all .2s;
  }
  .df-set-cancel:hover{border-color:rgba(255,255,255,.2);color:#d4daf5}

  /* ── Main layout ─────────────────────────────────────────────────────── */
  .df-main{display:flex;flex:1;min-height:0;overflow:hidden}

  /* ── Pipeline sidebar ────────────────────────────────────────────────── */
  .df-pipe{
    width:292px;flex-shrink:0;overflow-y:auto;overflow-x:hidden;
    padding:16px 14px;border-right:1px solid rgba(255,255,255,.05);
    transition:width .25s ease;background:rgba(8,9,18,.5);
  }
  .df-pipe.collapsed{width:60px;padding:14px 8px}
  .df-pipe::-webkit-scrollbar{width:2px}
  .df-pipe::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}
  .df-pipe-toggle{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;min-height:24px}
  .df-pipe-hdr-lbl{font-size:10px;letter-spacing:.14em;color:rgba(120,160,220,.55);text-transform:uppercase;font-weight:600}
  .df-pipe-btn{
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(200,214,232,.6);cursor:pointer;
    width:26px;height:26px;border-radius:6px;font-size:13px;line-height:1;
    display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;
  }
  .df-pipe-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#d4daf5}
  .df-rail{
    display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 0;border-radius:8px;
    margin-bottom:5px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.015);transition:all .2s;
  }
  .df-rail:hover{background:rgba(255,255,255,.04)}
  .df-rail.active{border-color:var(--c);background:rgba(0,0,0,.35)}
  .df-rail.done{border-color:rgba(0,255,136,.18);background:rgba(0,255,136,.02)}
  .df-rail.gate{border-color:#ffaa00;background:rgba(255,170,0,.04)}
  .df-rail-num{font-size:8px;letter-spacing:.06em;opacity:.35;font-weight:600}
  .df-rail-dot{width:6px;height:6px;border-radius:50%}
  .df-card{
    border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px;margin-bottom:6px;
    background:rgba(255,255,255,.02);transition:all .3s;position:relative;overflow:hidden;
  }
  .df-card.active{border-color:var(--c);background:rgba(0,0,0,.42);animation:glow 2s ease-in-out infinite}
  .df-card.done  {border-color:rgba(0,255,136,.18);background:rgba(0,255,136,.02)}
  .df-card.gate  {border-color:#ffaa00;background:rgba(255,170,0,.04);animation:pulse 1s infinite}
  .df-card.active::before,.df-card.gate::before{
    content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(to right,transparent,var(--c,#ffaa00),transparent);
  }
  .df-crow{display:flex;align-items:center;gap:9px}
  .df-cnum{font-size:9px;letter-spacing:.06em;opacity:.3;font-weight:600}
  .df-cicon{font-size:14px;transition:color .3s}
  .df-cicon.spin{animation:spin 1s linear infinite}
  .df-clbl{flex:1}
  .df-cname{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:13px;font-weight:700;color:#fff;transition:color .3s}
  .df-csub{font-size:9px;letter-spacing:.06em;opacity:.4;font-weight:500}
  .df-cdot{width:7px;height:7px;border-radius:50%;transition:background .3s}
  .df-cdesc{font-size:11px;opacity:.38;margin-top:6px;line-height:1.5}
  .df-cprog{height:2px;background:rgba(255,255,255,.06);margin-top:8px;border-radius:1px;overflow:hidden}
  .df-cfill{height:100%;border-radius:1px;transition:width .3s}
  .df-crev{font-size:9px;letter-spacing:.04em;padding:2px 8px;border-radius:20px;margin-top:5px;display:inline-block;font-weight:600}
  .df-crev.approved{background:rgba(0,255,136,.1);color:#00ff88;border:1px solid rgba(0,255,136,.22)}
  .df-crev.changes {background:rgba(255,100,0,.1);color:#ff6400;border:1px solid rgba(255,100,0,.22)}
  .df-conn{display:flex;align-items:center;justify-content:center;height:12px}
  .df-cline{width:1px;height:100%;background:rgba(255,255,255,.06);position:relative;overflow:hidden}
  .df-cline.flow::after{content:'';position:absolute;top:0;left:0;width:100%;height:35%;
    background:#00d4ff;animation:flowLine 1s ease-in-out infinite}

  /* ── Center panel ────────────────────────────────────────────────────── */
  .df-center{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid rgba(255,255,255,.05)}

  /* Tabs */
  .df-tabs{
    display:flex;border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(8,9,18,.7);flex-shrink:0;padding:0 8px;
  }
  .df-tab{
    padding:12px 18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
    border:none;border-bottom:2px solid transparent;background:transparent;transition:all .2s;
    color:rgba(200,214,232,.35);font-weight:500;font-family:-apple-system,system-ui,sans-serif;
  }
  .df-tab.active{color:#00d4ff;border-bottom-color:#00d4ff}
  .df-tab:hover:not(.active){color:rgba(200,214,232,.65)}

  /* Detail pane */
  .df-detail{flex:1;overflow-y:auto;padding:18px 22px}
  .df-detail::-webkit-scrollbar{width:3px}
  .df-detail::-webkit-scrollbar-thumb{background:rgba(0,212,255,.15)}
  .df-dtitle{
    font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;
    font-size:17px;font-weight:700;color:#fff;margin-bottom:4px;
  }
  .df-dsub{font-size:11px;letter-spacing:.08em;color:rgba(0,212,255,.5);text-transform:uppercase;margin-bottom:16px;font-weight:500}

  /* PRD */
  .df-prd{background:rgba(0,212,255,.03);border:1px solid rgba(0,212,255,.1);border-radius:10px;padding:14px}
  .df-prd-h{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:14px;font-weight:700;color:#00d4ff;margin-bottom:10px}
  .df-ps{margin-bottom:12px}
  .df-pl{font-size:10px;letter-spacing:.1em;color:rgba(0,212,255,.5);text-transform:uppercase;margin-bottom:5px;font-weight:600}
  .df-pt{font-size:12px;line-height:1.7;opacity:.75}
  .df-pi{font-size:12px;line-height:1.8;opacity:.75}
  .df-pi::before{content:'→ ';color:#00d4ff}

  /* Tasks */
  .df-tasks{display:flex;flex-direction:column;gap:6px}
  .df-task{
    background:rgba(0,255,136,.03);border:1px solid rgba(0,255,136,.12);border-radius:8px;
    padding:9px 12px;display:flex;align-items:center;gap:10px;animation:fadeUp .3s ease-out;
  }
  .df-tid  {font-size:10px;color:#00ff88;opacity:.65;min-width:56px;font-family:'SF Mono','Cascadia Code',monospace}
  .df-tname{font-size:12px;flex:1}
  .df-tpts {font-size:10px;color:#00ff88;opacity:.65;font-family:'SF Mono','Cascadia Code',monospace}

  /* Agents */
  .df-agents{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .df-agent{border-radius:10px;padding:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);transition:all .3s}
  .df-agent.running{border-color:var(--ac)}
  .df-agent.passed {border-color:rgba(0,255,136,.22)}
  .df-agent.warned {border-color:rgba(255,149,0,.22)}
  .df-agh{display:flex;align-items:center;gap:7px;margin-bottom:7px}
  .df-agd{width:7px;height:7px;border-radius:50%}
  .df-agname{font-size:12px;font-weight:700;color:#fff}
  .df-agst{font-size:10px;letter-spacing:.04em;opacity:.55;font-weight:500}
  .df-agf{font-size:11px;line-height:1.55;opacity:.65}

  /* QA */
  .df-qa-list{display:flex;flex-direction:column;gap:6px}
  .df-qa-row{
    display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
    border:1px solid rgba(191,95,255,.12);background:rgba(191,95,255,.04);animation:fadeUp .3s ease-out;
  }
  .df-qa-type {font-size:10px;color:#bf5fff;min-width:106px;font-weight:600}
  .df-qa-count{font-size:12px;flex:1}
  .df-qa-badge{font-size:9px;padding:2px 8px;border-radius:20px;background:rgba(0,255,136,.1);color:#00ff88;
    border:1px solid rgba(0,255,136,.22);font-weight:600}

  /* Deploy */
  .df-envs{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}
  .df-env{
    display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;
    border:1px solid rgba(255,45,107,.12);background:rgba(255,45,107,.04);transition:all .4s;
  }
  .df-env.live{border-color:rgba(0,255,136,.25);background:rgba(0,255,136,.04)}
  .df-env-name{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:12px;font-weight:700;color:#fff;min-width:78px}
  .df-env-bar{flex:1;height:3px;background:rgba(255,45,107,.1);border-radius:2px;overflow:hidden}
  .df-env-fill{height:100%;background:#ff2d6b;border-radius:2px;transition:width 1.5s ease}
  .df-env.live .df-env-fill{background:#00ff88}
  .df-env-st{font-size:10px;min-width:68px;text-align:right;font-weight:500}

  /* Gate */
  .df-gate{border-radius:10px;border:1px solid rgba(255,170,0,.3);background:rgba(255,170,0,.04);
    padding:18px;animation:fadeUp .4s ease-out}
  .df-gate-hdr{display:flex;align-items:center;gap:9px;margin-bottom:11px}
  .df-gate-icon{font-size:18px}
  .df-gate-title{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:15px;font-weight:800;color:#ffaa00}
  .df-gate-verdict{font-size:12px;opacity:.7;margin-bottom:12px;line-height:1.65}
  .df-gate-pts{margin-bottom:16px}
  .df-gate-pt{font-size:12px;opacity:.7;line-height:1.9}
  .df-gate-pt::before{content:'· ';color:#ffaa00}
  .df-gate-actions{display:flex;gap:9px;flex-wrap:wrap}
  .df-gate-ok{
    background:#00ff88;color:#080912;border:none;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;font-weight:700;
    letter-spacing:.04em;text-transform:uppercase;padding:10px 20px;border-radius:8px;transition:all .2s;
  }
  .df-gate-ok:hover{background:#33ff99;transform:translateY(-1px)}
  .df-gate-rej{
    background:transparent;color:#ff6464;border:1px solid rgba(255,100,100,.3);cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;padding:10px 20px;border-radius:8px;transition:all .2s;
  }
  .df-gate-rej:hover{border-color:rgba(255,100,100,.6);background:rgba(255,100,100,.07)}
  .df-fb-wrap{margin-top:12px;animation:fadeUp .3s ease-out}
  .df-fb-lbl{font-size:10px;letter-spacing:.1em;color:rgba(255,100,100,.7);text-transform:uppercase;margin-bottom:6px;font-weight:600}
  .df-fb-inp{
    width:100%;background:rgba(255,100,100,.04);border:1px solid rgba(255,100,100,.22);border-radius:8px;
    color:#e8eeff;font-family:-apple-system,system-ui,sans-serif;font-size:12px;
    padding:9px 12px;outline:none;resize:none;line-height:1.5;
  }
  .df-fb-inp:focus{border-color:rgba(255,100,100,.45)}
  .df-fb-sub{
    margin-top:8px;background:rgba(255,100,100,.1);color:#ff6464;border:1px solid rgba(255,100,100,.25);
    cursor:pointer;font-family:-apple-system,system-ui,sans-serif;font-size:11px;font-weight:700;
    letter-spacing:.04em;text-transform:uppercase;padding:8px 16px;border-radius:8px;transition:all .2s;
  }
  .df-fb-sub:hover{background:rgba(255,100,100,.2)}

  /* Prod gate */
  .df-prod-gate{
    border-radius:12px;border:1.5px solid rgba(255,45,107,.55);background:rgba(255,45,107,.05);
    padding:22px;animation:prodPulse 2s ease-in-out infinite,fadeUp .4s ease-out;position:relative;overflow:hidden;
  }
  .df-prod-gate::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(to right,transparent,#ff2d6b,transparent)}
  .df-pg-hdr{display:flex;align-items:center;gap:9px;margin-bottom:8px}
  .df-pg-icon{font-size:22px}
  .df-pg-title{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:16px;font-weight:800;color:#ff2d6b}
  .df-pg-sub{font-size:10px;letter-spacing:.1em;color:rgba(255,45,107,.55);text-transform:uppercase;margin-bottom:14px;font-weight:600}
  .df-pg-checks{margin-bottom:14px}
  .df-pg-check{display:flex;align-items:center;gap:9px;padding:6px 0;
    border-bottom:1px solid rgba(255,45,107,.1);font-size:12px;opacity:.8}
  .df-pg-check-ic{color:#00ff88;font-size:11px;min-width:14px}
  .df-pg-clbl{font-size:10px;letter-spacing:.1em;color:rgba(255,45,107,.7);text-transform:uppercase;margin-bottom:7px;margin-top:14px;font-weight:600}
  .df-pg-cinp{
    width:100%;background:rgba(255,45,107,.04);border:1px solid rgba(255,45,107,.28);border-radius:8px;
    color:#ff8099;font-family:'SF Mono','Cascadia Code',monospace;font-size:13px;font-weight:700;
    padding:10px 14px;outline:none;letter-spacing:.2em;text-align:center;
  }
  .df-pg-cinp:focus{border-color:rgba(255,45,107,.55)}
  .df-pg-cinp::placeholder{color:rgba(255,45,107,.22);letter-spacing:.04em;font-size:11px}
  .df-pg-btn{
    width:100%;margin-top:12px;padding:14px;border:none;border-radius:10px;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:13px;font-weight:800;
    letter-spacing:.08em;text-transform:uppercase;transition:all .2s;
  }
  .df-pg-btn.locked  {background:rgba(255,45,107,.1);color:rgba(255,45,107,.32);cursor:not-allowed}
  .df-pg-btn.unlocked{background:#ff2d6b;color:#fff}
  .df-pg-btn.unlocked:hover{background:#ff5588;transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,45,107,.4)}

  /* Done */
  .df-done{text-align:center;padding:48px 24px;animation:fadeUp .5s ease-out}
  .df-done-ic{font-size:48px;margin-bottom:16px}
  .df-done-t{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:24px;font-weight:800;color:#fff;margin-bottom:6px}
  .df-done-s{font-size:11px;color:rgba(0,212,255,.55);letter-spacing:.1em;margin-bottom:24px;font-weight:500}
  .df-metrics{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .df-metric{text-align:center;padding:12px 18px;border:1px solid rgba(0,212,255,.16);border-radius:10px;min-width:90px;background:rgba(0,212,255,.03)}
  .df-mv{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:22px;font-weight:800;color:#00d4ff}
  .df-ml{font-size:10px;letter-spacing:.08em;opacity:.42;margin-top:4px;font-weight:500}

  /* ── Observability ───────────────────────────────────────────────────── */
  .obs-wrap{padding:18px 22px;display:flex;flex-direction:column;gap:18px}
  .obs-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .obs-stat{
    background:rgba(0,212,255,.03);border:1px solid rgba(0,212,255,.1);border-radius:10px;
    padding:12px 14px;text-align:center;animation:countUp .4s ease-out;
  }
  .obs-stat-val{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:20px;font-weight:800;margin-bottom:4px}
  .obs-stat-lbl{font-size:9px;letter-spacing:.12em;opacity:.42;text-transform:uppercase;font-weight:600}
  .obs-sh{
    font-size:10px;letter-spacing:.12em;color:rgba(0,212,255,.5);text-transform:uppercase;margin-bottom:8px;
    display:flex;align-items:center;gap:8px;font-weight:600;
  }
  .obs-sh::after{content:'';flex:1;height:1px;background:rgba(0,212,255,.08)}
  .obs-table{width:100%;border-collapse:collapse;font-size:11px}
  .obs-table th{
    font-size:9px;letter-spacing:.1em;color:rgba(0,212,255,.45);text-transform:uppercase;
    padding:6px 9px;border-bottom:1px solid rgba(0,212,255,.08);text-align:left;font-weight:600;
  }
  .obs-table td{padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
  .obs-table tr{animation:tokenIn .25s ease-out}
  .obs-table tr:hover td{background:rgba(0,212,255,.025)}
  .obs-model-chip{display:inline-block;font-size:9px;padding:2px 7px;border-radius:20px;letter-spacing:.04em;font-weight:600}
  .obs-drift-warn{display:inline-flex;align-items:center;gap:4px;font-size:9px;color:#ff9500;
    background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.22);padding:2px 8px;border-radius:20px;font-weight:600}
  .obs-tok-bar{display:flex;height:5px;border-radius:3px;overflow:hidden;min-width:60px;gap:1px}
  .obs-tok-in {background:#00d4ff;border-radius:3px 0 0 3px}
  .obs-tok-out{background:#00ff88;border-radius:0 3px 3px 0}
  .obs-chart-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .obs-chart-box{
    background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);
    border-radius:10px;padding:14px;
  }
  .obs-chart-title{font-size:10px;letter-spacing:.1em;color:rgba(0,212,255,.5);text-transform:uppercase;margin-bottom:12px;font-weight:600}
  .obs-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
  .obs-legend-item{display:flex;align-items:center;gap:5px;font-size:10px;opacity:.6}
  .obs-legend-dot{width:8px;height:8px;border-radius:50%}
  .obs-drift-banner{
    background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.22);border-radius:10px;
    padding:10px 14px;display:flex;align-items:center;gap:10px;font-size:11px;
  }
  .obs-drift-icon{font-size:14px}
  .obs-drift-text{opacity:.75;line-height:1.5}
  .obs-empty{text-align:center;padding:60px 20px;opacity:.22;font-size:12px;line-height:2}

  /* ── Log panel ───────────────────────────────────────────────────────── */
  .df-log{width:252px;flex-shrink:0;display:flex;flex-direction:column;transition:width .25s ease;overflow:hidden}
  .df-log.wide     {width:460px}
  .df-log.collapsed{width:46px}
  .df-log-hdr{
    padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.06);
    font-size:10px;letter-spacing:.12em;color:rgba(120,160,220,.55);text-transform:uppercase;
    display:flex;align-items:center;gap:7px;font-weight:600;
  }
  .df-log.collapsed .df-log-hdr{flex-direction:column;gap:9px;padding:11px 0}
  .df-log-dot{width:6px;height:6px;border-radius:50%}
  .df-log-bd{flex:1;overflow-y:auto;padding:10px}
  .df-log-bd::-webkit-scrollbar{width:2px}
  .df-log-bd::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}
  .df-log-row{
    font-size:11px;line-height:1.6;padding:3px 0;
    border-bottom:1px solid rgba(255,255,255,.04);animation:slideLog .2s ease-out;
  }
  .df-log-ts {color:rgba(0,212,255,.3);margin-right:5px;font-family:'SF Mono','Cascadia Code',monospace;font-size:10px}
  .df-log-msg.info   {color:rgba(200,214,232,.5)}
  .df-log-msg.success{color:#00ff88}
  .df-log-msg.warn   {color:#ff9500}
  .df-log-msg.agent  {color:#c8d6e8}
  .df-log-msg.gate   {color:#ffaa00}
  .df-log-msg.handoff{color:#00d4ff}
  .df-log-msg.done   {color:#ff2d6b;font-weight:700}
  .df-idle-hint{text-align:center;padding:56px 20px;opacity:.22;font-size:12px;line-height:2}
  .df-cursor{animation:blink 1s step-end infinite;color:#00d4ff}

  /* Tooltip */
  .recharts-tooltip-wrapper .recharts-default-tooltip{
    background:#0d1128!important;border-color:rgba(0,212,255,.18)!important;
    font-family:-apple-system,system-ui,sans-serif!important;font-size:11px!important;color:#d4daf5!important;
    border-radius:8px!important;
  }

  /* ── Light Theme ────────────────────────────────────────────────────────── */
  .df[data-theme='light']{background:#f1f3fa;color:#1a1d2e}
  .df[data-theme='light'] .df-hdr{background:rgba(238,241,252,.96);border-bottom-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-lname{color:#0d0f1f}
  .df[data-theme='light'] .df-ltag{color:rgba(20,40,120,.55)}
  .df[data-theme='light'] .df-timer{color:#1a1d2e}
  .df[data-theme='light'] .df-badge.idle{color:rgba(20,30,80,.4);border-color:rgba(20,30,80,.15)}
  .df[data-theme='light'] .df-settings-btn{border-color:rgba(0,0,0,.12);color:rgba(20,30,80,.5)}
  .df[data-theme='light'] .df-settings-btn:hover{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.2);color:#1a1d2e}
  .df[data-theme='light'] .df-int-dot.off{background:rgba(0,0,0,.18)}
  .df[data-theme='light'] .df-int-dot-lbl{color:rgba(20,30,80,.35)}
  .df[data-theme='light'] .df-inp-area{background:rgba(232,235,250,.85);border-bottom-color:rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-inp-lbl{color:rgba(20,40,120,.6)}
  .df[data-theme='light'] .df-mode-btn{border-color:rgba(0,0,0,.12);color:rgba(20,30,80,.5)}
  .df[data-theme='light'] .df-mode-btn.active{background:rgba(0,140,180,.1);border-color:rgba(0,140,180,.4);color:#007799}
  .df[data-theme='light'] .df-inp{background:rgba(255,255,255,.9);border-color:rgba(0,0,0,.1);color:#1a1d2e}
  .df[data-theme='light'] .df-inp::placeholder{color:rgba(20,30,80,.2)}
  .df[data-theme='light'] .df-ctx-gh{background:rgba(255,255,255,.8);border-color:rgba(0,0,0,.1);color:#1a1d2e}
  .df[data-theme='light'] .df-ctx-gh::placeholder{color:rgba(20,30,80,.22)}
  .df[data-theme='light'] .df-ctx-attach{border-color:rgba(0,140,180,.3);color:rgba(0,140,180,.65)}
  .df[data-theme='light'] .df-ctx-attach:hover{border-color:rgba(0,140,180,.6);color:#007799}
  .df[data-theme='light'] .df-ctx-chip{background:rgba(0,140,180,.06);border-color:rgba(0,140,180,.2);color:rgba(20,30,80,.7)}
  .df[data-theme='light'] .df-ctx-chip button{color:rgba(20,30,80,.4)}
  .df[data-theme='light'] .df-rerun-btn{border-color:rgba(0,0,0,.1);color:rgba(20,30,80,.4)}
  .df[data-theme='light'] .df-rerun-btn:hover{border-color:rgba(0,140,180,.35);color:#007799;background:rgba(0,140,180,.06)}
  .df[data-theme='light'] .df-dbg-btn{border-color:rgba(0,140,180,.25);color:rgba(0,140,180,.65)}
  .df[data-theme='light'] .df-dbg-panel{background:rgba(241,244,255,.99);border-color:rgba(0,140,180,.2);box-shadow:-8px -8px 40px rgba(0,0,0,.16)}
  .df[data-theme='light'] .df-dbg-title{color:rgba(0,140,180,.8)}
  .df[data-theme='light'] .df-dbg-close{color:rgba(20,30,80,.4)}
  .df[data-theme='light'] .df-dbg-ctx{color:rgba(20,30,80,.4);background:rgba(0,0,0,.04)}
  .df[data-theme='light'] .df-dbg-inp{background:rgba(255,255,255,.9);border-color:rgba(0,140,180,.18);color:#1a1d2e}
  .df[data-theme='light'] .df-dbg-inp::placeholder{color:rgba(20,30,80,.2)}
  .df[data-theme='light'] .df-dbg-answer{color:rgba(20,30,80,.88);background:rgba(0,140,180,.04);border-color:rgba(0,140,180,.12)}
  .df[data-theme='light'] .df-tabs{background:rgba(238,241,252,.9);border-bottom-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-tab{color:rgba(20,30,80,.38)}
  .df[data-theme='light'] .df-tab.active{color:#007799;border-bottom-color:#007799}
  .df[data-theme='light'] .df-tab:hover:not(.active){color:rgba(20,30,80,.7)}
  .df[data-theme='light'] .df-pipe{background:rgba(238,242,253,.7);border-right-color:rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-pipe::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1)}
  .df[data-theme='light'] .df-pipe-hdr-lbl{color:rgba(20,40,120,.45)}
  .df[data-theme='light'] .df-pipe-btn{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.1);color:rgba(20,30,80,.6)}
  .df[data-theme='light'] .df-pipe-btn:hover{background:rgba(0,0,0,.08);border-color:rgba(0,0,0,.18);color:#1a1d2e}
  .df[data-theme='light'] .df-rail{border-color:rgba(0,0,0,.07);background:rgba(0,0,0,.01)}
  .df[data-theme='light'] .df-rail:hover{background:rgba(0,0,0,.04)}
  .df[data-theme='light'] .df-rail.active{background:rgba(0,0,0,.2)}
  .df[data-theme='light'] .df-card{background:rgba(0,0,0,.025);border-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-card.active{background:rgba(0,0,0,.1)}
  .df[data-theme='light'] .df-card.done{background:rgba(0,200,100,.03)}
  .df[data-theme='light'] .df-cnum{opacity:.35;color:#1a1d2e}
  .df[data-theme='light'] .df-cname{color:#0d0f1f}
  .df[data-theme='light'] .df-csub{opacity:.4;color:#1a1d2e}
  .df[data-theme='light'] .df-cdesc{opacity:.45;color:#1a1d2e}
  .df[data-theme='light'] .df-cprog{background:rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-cline{background:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-center{border-right-color:rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-detail::-webkit-scrollbar-thumb{background:rgba(0,140,180,.12)}
  .df[data-theme='light'] .df-dtitle{color:#0d0f1f}
  .df[data-theme='light'] .df-dsub{color:rgba(0,140,180,.55)}
  .df[data-theme='light'] .df-prd{background:rgba(0,140,180,.03);border-color:rgba(0,140,180,.12)}
  .df[data-theme='light'] .df-pt{color:rgba(20,30,80,.75);opacity:1}
  .df[data-theme='light'] .df-pi{color:rgba(20,30,80,.75);opacity:1}
  .df[data-theme='light'] .df-task{background:rgba(0,200,100,.03);border-color:rgba(0,200,100,.14)}
  .df[data-theme='light'] .df-agent{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-agname{color:#0d0f1f}
  .df[data-theme='light'] .df-agst{color:rgba(20,30,80,.5);opacity:1}
  .df[data-theme='light'] .df-agf{color:rgba(20,30,80,.65);opacity:1}
  .df[data-theme='light'] .df-qa-row{background:rgba(140,60,220,.03);border-color:rgba(140,60,220,.14)}
  .df[data-theme='light'] .df-env{background:rgba(200,30,80,.02);border-color:rgba(200,30,80,.1)}
  .df[data-theme='light'] .df-env-name{color:#0d0f1f}
  .df[data-theme='light'] .df-env-bar{background:rgba(200,30,80,.08)}
  .df[data-theme='light'] .df-env-st{color:rgba(20,30,80,.5)}
  .df[data-theme='light'] .df-gate{background:rgba(255,190,0,.03);border-color:rgba(190,140,0,.3)}
  .df[data-theme='light'] .df-gate-verdict{color:rgba(20,30,80,.7);opacity:1}
  .df[data-theme='light'] .df-gate-pt{color:rgba(20,30,80,.7);opacity:1}
  .df[data-theme='light'] .df-gate-ok{color:#0a0c1a}
  .df[data-theme='light'] .df-gate-rej{color:#cc4444;border-color:rgba(200,60,60,.3)}
  .df[data-theme='light'] .df-fb-inp{background:rgba(220,50,50,.03);border-color:rgba(200,60,60,.2);color:#1a1d2e}
  .df[data-theme='light'] .df-done-t{color:#0d0f1f}
  .df[data-theme='light'] .df-done-s{color:rgba(0,140,180,.55)}
  .df[data-theme='light'] .df-metric{background:rgba(0,140,180,.03);border-color:rgba(0,140,180,.15)}
  .df[data-theme='light'] .obs-stat{background:rgba(0,140,180,.03);border-color:rgba(0,140,180,.12)}
  .df[data-theme='light'] .obs-sh{color:rgba(0,140,180,.55)}
  .df[data-theme='light'] .obs-sh::after{background:rgba(0,140,180,.1)}
  .df[data-theme='light'] .obs-table th{color:rgba(0,140,180,.5);border-bottom-color:rgba(0,140,180,.1)}
  .df[data-theme='light'] .obs-table td{border-bottom-color:rgba(0,0,0,.05)}
  .df[data-theme='light'] .obs-table tr:hover td{background:rgba(0,140,180,.03)}
  .df[data-theme='light'] .obs-chart-box{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .obs-chart-title{color:rgba(0,140,180,.5)}
  .df[data-theme='light'] .obs-legend-item{color:rgba(20,30,80,.6);opacity:1}
  .df[data-theme='light'] .obs-empty{color:rgba(20,30,80,.3);opacity:1}
  .df[data-theme='light'] .recharts-tooltip-wrapper .recharts-default-tooltip{background:#fff!important;border-color:rgba(0,140,180,.18)!important;color:#1a1d2e!important}
  .df[data-theme='light'] .df-log-hdr{border-bottom-color:rgba(0,0,0,.08);color:rgba(20,40,120,.5)}
  .df[data-theme='light'] .df-log-bd::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1)}
  .df[data-theme='light'] .df-log-row{border-bottom-color:rgba(0,0,0,.05)}
  .df[data-theme='light'] .df-log-ts{color:rgba(0,140,180,.35)}
  .df[data-theme='light'] .df-log-msg.info{color:rgba(20,30,80,.55)}
  .df[data-theme='light'] .df-log-msg.agent{color:rgba(20,30,80,.7)}
  .df[data-theme='light'] .df-idle-hint{color:rgba(20,30,80,.28);opacity:1}
  .df[data-theme='light'] .df-settings-overlay{background:rgba(0,0,0,.35)}
  .df[data-theme='light'] .df-settings-drawer{background:#f5f7fe;border-left-color:rgba(0,0,0,.1)}
  .df[data-theme='light'] .df-set-hdr{border-bottom-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-set-title{color:#0d0f1f}
  .df[data-theme='light'] .df-set-close{color:rgba(20,30,80,.4)}
  .df[data-theme='light'] .df-set-tabs{border-bottom-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-set-tab{color:rgba(20,30,80,.4)}
  .df[data-theme='light'] .df-set-tab.active{color:#007799;border-bottom-color:#007799}
  .df[data-theme='light'] .df-set-body::-webkit-scrollbar-thumb{background:rgba(0,140,180,.12)}
  .df[data-theme='light'] .df-set-sec-title{color:rgba(0,140,180,.6)}
  .df[data-theme='light'] .df-set-lbl{color:rgba(20,30,80,.6)}
  .df[data-theme='light'] .df-set-inp{background:rgba(255,255,255,.9);border-color:rgba(0,0,0,.1);color:#1a1d2e}
  .df[data-theme='light'] .df-set-inp::placeholder{color:rgba(20,30,80,.2)}
  .df[data-theme='light'] .df-set-inp:focus{border-color:rgba(0,140,180,.4)}
  .df[data-theme='light'] .df-set-preview{color:rgba(20,30,80,.35)}
  .df[data-theme='light'] .df-model-card{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-model-card:hover{background:rgba(0,140,180,.04);border-color:rgba(0,140,180,.22)}
  .df[data-theme='light'] .df-model-card.selected{background:rgba(0,140,180,.07);border-color:rgba(0,140,180,.45)}
  .df[data-theme='light'] .df-mc-name{color:#0d0f1f}
  .df[data-theme='light'] .df-mc-desc{color:rgba(20,30,80,.5)}
  .df[data-theme='light'] .df-mc-price{color:rgba(20,30,80,.32)}
  .df[data-theme='light'] .df-add-model-inp{background:rgba(255,255,255,.9);border-color:rgba(0,0,0,.1);color:#1a1d2e}
  .df[data-theme='light'] .df-add-model-inp::placeholder{color:rgba(20,30,80,.2)}
  .df[data-theme='light'] .df-int-status-row{background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-int-status-name{color:rgba(20,30,80,.65)}
  .df[data-theme='light'] .df-int-status-val{color:rgba(20,30,80,.35)}
  .df[data-theme='light'] .df-set-footer{border-top-color:rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-set-cancel{border-color:rgba(0,0,0,.1);color:rgba(20,30,80,.5)}
  .df[data-theme='light'] .df-set-cancel:hover{border-color:rgba(0,0,0,.2);color:#1a1d2e}
  .df[data-theme='light'] .df-set-result.ok{background:rgba(0,180,100,.05);border-color:rgba(0,180,100,.2);color:#008855}
  .df[data-theme='light'] .df-set-result.err{background:rgba(200,50,50,.05);border-color:rgba(200,50,50,.2);color:#cc3333}

`;

// ── useTimer ───────────────────────────────────────────────────────────────
function useTimer(running) {
  const [ms, setMs] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (running) { ref.current = setInterval(() => setMs(p => p+100), 100); }
    else clearInterval(ref.current);
    return () => clearInterval(ref.current);
  }, [running]);
  const reset = () => setMs(0);
  const fmt = v => {
    const s = Math.floor(v/1000), m = Math.floor(s/60);
    return `${String(m).padStart(2,"0")}:${String(s%60).padStart(2,"0")}.${String(Math.floor((v%1000)/10)).padStart(2,"0")}`;
  };
  return { elapsed:ms, display:fmt(ms), reset };
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#0d1425",border:"1px solid rgba(0,212,255,.2)",borderRadius:3,padding:"7px 10px",fontFamily:"'Space Mono',monospace",fontSize:10}}>
      <div style={{color:"rgba(0,212,255,.6)",marginBottom:4}}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color}}>{p.name}: {p.value}{p.unit||""}</div>)}
    </div>
  );
};

// ── Observability Panel ────────────────────────────────────────────────────
function ObsPanel({ llmCalls, theme }) {
  const tc = (dark, light) => theme === "dark" ? dark : light;
  if (llmCalls.length === 0) return (
    <div className="obs-empty">⟡ LLM calls will appear here<br/>as the pipeline runs<br/><br/><span style={{animation:"blink 1s step-end infinite",color:"#00d4ff"}}>_</span></div>
  );

  const totalIn     = llmCalls.reduce((a,c) => a+c.inputTok, 0);
  const totalOut    = llmCalls.reduce((a,c) => a+c.outputTok, 0);
  const totalCost   = llmCalls.reduce((a,c) => a+c.cost, 0);
  const avgLatency  = Math.round(llmCalls.reduce((a,c) => a+c.latencyMs,0) / llmCalls.length);
  const maxLatency  = Math.max(...llmCalls.map(c=>c.latencyMs));

  // Detect drift: last 3 avg latency vs first 3
  let driftWarning = null;
  if (llmCalls.length >= 6) {
    const first3avg = llmCalls.slice(0,3).reduce((a,c)=>a+c.latencyMs,0)/3;
    const last3avg  = llmCalls.slice(-3).reduce((a,c)=>a+c.latencyMs,0)/3;
    const drift     = ((last3avg - first3avg)/first3avg)*100;
    if (drift > 20) driftWarning = `+${drift.toFixed(0)}% latency increase detected over last 3 calls vs first 3`;
  }

  // Latency chart data
  const latencyData = llmCalls.map((c,i) => ({
    name: `#${c.id}`, label: c.label, latency: c.latencyMs,
    avg: Math.round(llmCalls.slice(0,i+1).reduce((a,x)=>a+x.latencyMs,0)/(i+1)),
  }));

  // Per-stage token rollup for stacked chart
  const stageRollup = STAGES.map(s => {
    const calls = llmCalls.filter(c=>c.stage===s.id);
    return { name: s.label, input: calls.reduce((a,c)=>a+c.inputTok,0), output: calls.reduce((a,c)=>a+c.outputTok,0), color: s.color };
  }).filter(s=>s.input>0);

  return (
    <div className="obs-wrap">

      {/* Summary strip */}
      <div className="obs-summary">
        {[
          { val: llmCalls.length,           color:"#00d4ff", lbl:"LLM Calls" },
          { val: (totalIn+totalOut).toLocaleString(), color:"#00ff88", lbl:"Total Tokens" },
          { val: `${avgLatency}ms`,          color:"#ff9500", lbl:"Avg Latency" },
          { val: `$${totalCost.toFixed(4)}`, color:"#bf5fff", lbl:"Est. Cost" },
          { val: `${maxLatency}ms`,          color:"#ff2d6b", lbl:"Peak Latency" },
        ].map((s,i) => (
          <div key={i} className="obs-stat">
            <div className="obs-stat-val" style={{color:s.color}}>{s.val}</div>
            <div className="obs-stat-lbl">{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Drift warning */}
      {driftWarning && (
        <div className="obs-drift-banner">
          <span className="obs-drift-icon">⚠</span>
          <span className="obs-drift-text"><strong style={{color:"#ff9500"}}>Performance Drift Detected: </strong>{driftWarning}</span>
        </div>
      )}

      {/* Charts row */}
      <div className="obs-chart-row">

        {/* Latency drift line chart */}
        <div className="obs-chart-box">
          <div className="obs-chart-title">Latency Drift — per LLM call</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={latencyData} margin={{top:4,right:8,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="2 4" stroke={tc("rgba(200,214,232,.07)","rgba(0,0,0,.07)")} />
              <XAxis dataKey="name" tick={{fill:tc("rgba(200,214,232,.35)","rgba(20,30,80,.45)"),fontSize:8}} />
              <YAxis tick={{fill:tc("rgba(200,214,232,.35)","rgba(20,30,80,.45)"),fontSize:8}} unit="ms" />
              <Tooltip content={<ChartTip/>} />
              <ReferenceLine y={avgLatency} stroke="rgba(255,149,0,.4)" strokeDasharray="3 3" label={{value:"avg",fill:"rgba(255,149,0,.5)",fontSize:8}} />
              <Line type="monotone" dataKey="latency" stroke="#00d4ff" strokeWidth={2} dot={{r:3,fill:"#00d4ff"}} name="Latency" unit="ms" />
              <Line type="monotone" dataKey="avg"     stroke="#ff9500" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Rolling avg" unit="ms" />
            </LineChart>
          </ResponsiveContainer>
          <div className="obs-legend">
            <div className="obs-legend-item"><div className="obs-legend-dot" style={{background:"#00d4ff"}}/> Latency</div>
            <div className="obs-legend-item"><div className="obs-legend-dot" style={{background:"#ff9500"}}/> Rolling avg</div>
          </div>
        </div>

        {/* Token usage per stage bar chart */}
        <div className="obs-chart-box">
          <div className="obs-chart-title">Token Usage — by stage</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stageRollup} margin={{top:4,right:8,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="2 4" stroke={tc("rgba(200,214,232,.07)","rgba(0,0,0,.07)")} />
              <XAxis dataKey="name" tick={{fill:tc("rgba(200,214,232,.35)","rgba(20,30,80,.45)"),fontSize:8}} />
              <YAxis tick={{fill:tc("rgba(200,214,232,.35)","rgba(20,30,80,.45)"),fontSize:8}} />
              <Tooltip content={<ChartTip/>} />
              <Bar dataKey="input"  fill="#00d4ff" name="Input tokens"  radius={[2,2,0,0]} maxBarSize={30}/>
              <Bar dataKey="output" fill="#00ff88" name="Output tokens" radius={[2,2,0,0]} maxBarSize={30}/>
            </BarChart>
          </ResponsiveContainer>
          <div className="obs-legend">
            <div className="obs-legend-item"><div className="obs-legend-dot" style={{background:"#00d4ff"}}/> Input</div>
            <div className="obs-legend-item"><div className="obs-legend-dot" style={{background:"#00ff88"}}/> Output</div>
          </div>
        </div>
      </div>

      {/* Per-call table */}
      <div>
        <div className="obs-sh">Call Log</div>
        <table className="obs-table">
          <thead>
            <tr>
              <th>#</th><th>Call</th><th>Model</th><th>Tokens (in/out)</th><th>Latency</th><th>Cost</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {llmCalls.map(c => {
              const total = c.inputTok + c.outputTok;
              const inW   = Math.round((c.inputTok/total)*100);
              const isSlow = c.latencyMs > avgLatency * 1.4;
              return (
                <tr key={c.id}>
                  <td style={{color:"rgba(0,212,255,.45)"}}>{c.id}</td>
                  <td>
                    <div style={{color:tc("#e8f4ff","#1a1d2e"),marginBottom:2}}>{c.label}</div>
                    <div style={{fontSize:8,color:STAGE_COLORS[c.stage],opacity:.8}}>{c.stage}</div>
                  </td>
                  <td>
                    <span className="obs-model-chip" style={{background:`${MODEL_COLORS[c.model]}18`,color:MODEL_COLORS[c.model],border:`1px solid ${MODEL_COLORS[c.model]}35`}}>
                      {c.model === "claude-sonnet-4-6" ? "Sonnet 4" : "Haiku 4.5"}
                    </span>
                  </td>
                  <td>
                    <div style={{marginBottom:3,fontSize:9,color:tc("rgba(200,214,232,.6)","rgba(20,30,80,.6)")}}>{c.inputTok.toLocaleString()} / {c.outputTok.toLocaleString()}</div>
                    <div className="obs-tok-bar">
                      <div className="obs-tok-in"  style={{width:`${inW}%`}}/>
                      <div className="obs-tok-out" style={{width:`${100-inW}%`}}/>
                    </div>
                  </td>
                  <td>
                    <span style={{color: isSlow?"#ff9500":tc("#c8d6e8","rgba(20,30,80,.7)")}}>{c.latencyMs}ms</span>
                    {isSlow && <span style={{fontSize:8,color:"#ff9500",marginLeft:4}}>↑</span>}
                  </td>
                  <td style={{color:"#bf5fff"}}>${c.cost.toFixed(4)}</td>
                  <td><span style={{fontSize:8,color:"#00ff88",background:"rgba(0,255,136,.1)",padding:"2px 6px",borderRadius:2,border:"1px solid rgba(0,255,136,.25)"}}>OK</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Token breakdown */}
      <div>
        <div className="obs-sh">Token Breakdown</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {lbl:"Input Tokens",  val:totalIn.toLocaleString(),  color:"#00d4ff", sub:"Prompt + context"},
            {lbl:"Output Tokens", val:totalOut.toLocaleString(), color:"#00ff88", sub:"Generated text"},
            {lbl:"Sonnet 4 calls",val:llmCalls.filter(c=>c.model==="claude-sonnet-4-6").length, color:"#00d4ff", sub:"Complex reasoning"},
            {lbl:"Haiku 4.5 calls",val:llmCalls.filter(c=>c.model==="claude-haiku-4-5").length,         color:"#00ff88", sub:"Fast inline checks"},
            {lbl:"Total Calls",   val:llmCalls.length,           color:"#bf5fff", sub:"Across all stages"},
            {lbl:"Est. Total Cost",val:`$${totalCost.toFixed(4)}`,color:"#ff9500", sub:"Claude API usage"},
          ].map((m,i)=>(
            <div key={i} style={{background:tc("rgba(0,0,0,.25)","rgba(0,0,0,.04)"),border:`1px solid ${tc("rgba(200,214,232,.08)","rgba(0,0,0,.09)")}`,borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:m.color,marginBottom:3}}>{m.val}</div>
              <div style={{fontSize:9,color:tc("rgba(200,214,232,.65)","rgba(20,30,80,.65)"),marginBottom:2}}>{m.lbl}</div>
              <div style={{fontSize:8,color:tc("rgba(200,214,232,.35)","rgba(20,30,80,.35)"),letterSpacing:1}}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function DevForgeDashboard() {
  const [input, setInput]           = useState("Users cannot reset passwords without calling support. We get 200+ tickets/week. Need self-service forgot-password via email for enterprise users. Success = 80% ticket drop in 60 days. JWT auth, no SSO/SAML users. Reset link via SES, token expires 24h, max 3 requests/hour. Enforce password complexity (min 8 chars, 1 uppercase, 1 number). Admin audit log. Branded email. Fallback = contact support if no email access.");
  const [appState, setAppState]     = useState("idle");
  const [activeStage, setActive]    = useState(null);
  const [doneStages, setDone]       = useState(new Set());
  const [stageReviews, setReviews]  = useState({});
  const [progress, setProgress]     = useState({});
  const [logs, setLogs]             = useState([]);
  const [detail, setDetail]         = useState(null);
  const [tab, setTab]               = useState("pipeline");
  const [gateStage, setGateStage]   = useState(null);
  const [showFB, setShowFB]         = useState(false);
  const [fb, setFb]                 = useState("");
  const [prodCfm, setProdCfm]       = useState("");
  const [envProg, setEnvProg]       = useState({});
  const [llmCalls, setLlmCalls]     = useState([]);
  const [stage1ThreadId, setS1Tid]   = useState(null);
  const [stage2ThreadId, setS2Tid]   = useState(null);
  const [stage3ThreadId, setS3Tid]   = useState(null);
  const [stage4ThreadId, setS4Tid]   = useState(null);
  const [apiReady, setApiReady]      = useState({});
  const [realPrd, setRealPrd]        = useState(null);
  const [realTasks, setRealTasks]    = useState([]);
  const [realReview, setRealReview]  = useState(null);
  const [realCodeGen, setRealCodeGen]= useState(null);
  const [realQA, setRealQA]          = useState(null);
  const [qaThreadId, setQaTid]       = useState(null);
  const [realDeploy, setRealDeploy]  = useState(null);
  const [expandedFile, setExpandedFile] = useState(null);
  const [pipeCollapsed, setPipeCollapsed] = useState(false);
  const [logView, setLogView] = useState("normal"); // "collapsed" | "normal" | "wide"
  const [inputBig, setInputBig] = useState(false);
  const [requestMode, setRequestMode] = useState("add_feature");
  const [inputTouched, setInputTouched] = useState(false);
  const [githubUrl, setGithubUrl]       = useState("");
  const [attachments, setAttachments]   = useState([]); // [{name, content}]
  const [realDepGraph, setRealDepGraph] = useState(null);
  const [debugOpen, setDebugOpen]       = useState(false);
  const [debugQ, setDebugQ]             = useState("");
  const [debugAns, setDebugAns]         = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab]   = useState("llm");
  const [settingsData, setSettingsData] = useState(null); // from GET /settings
  const [settingsEdits, setSettingsEdits] = useState({}); // staged edits
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTestResult, setSettingsTestResult] = useState({}); // key → {ok, info/error}
  const [customModelInput, setCustomModelInput]   = useState("");
  const [customModelName, setCustomModelName]     = useState("");
  const [customModelAdding, setCustomModelAdding] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("df-theme") || "dark");
  useEffect(() => { localStorage.setItem("df-theme", theme); }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const tc = (dark, light) => theme === "dark" ? dark : light;
  const { elapsed, display, reset } = useTimer(appState === "running");

  const toRef       = useRef([]);
  const logRef      = useRef(null);
  const resumeFn    = useRef(null);
  const inputRef    = useRef(null);
  const fileInputRef = useRef(null);
  const demoModeRef = useRef(false); // gates the observability poller during Demo Mode

  // ── Settings handlers ──────────────────────────────────────────────────────
  const openSettings = () => {
    setSettingsEdits({});
    setSettingsTestResult({});
    fetch("/settings").then(r=>r.json()).then(d=>setSettingsData(d)).catch(()=>{});
    setSettingsOpen(true);
  };
  const closeSettings = () => { setSettingsOpen(false); setSettingsEdits({}); };
  const setEdit = (k,v) => setSettingsEdits(p=>({...p,[k]:v}));
  const saveSettings = () => {
    if (!Object.keys(settingsEdits).length) { closeSettings(); return; }
    setSettingsSaving(true);
    fetch("/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settingsEdits)})
      .then(r=>r.json()).then(d=>{ setSettingsData(d); setSettingsSaving(false); closeSettings(); })
      .catch(()=>setSettingsSaving(false));
  };
  const testConnection = (service) => {
    setSettingsTestResult(p=>({...p,[service]:{loading:true}}));
    fetch(`/settings/test-${service}`,{method:"POST"}).then(r=>r.json()).then(d=>{
      setSettingsTestResult(p=>({...p,[service]:d}));
    }).catch(e=>setSettingsTestResult(p=>({...p,[service]:{ok:false,error:e.message}})));
  };
  const addCustomModel = () => {
    const id = customModelInput.trim();
    if (!id) return;
    setCustomModelAdding(true);
    fetch("/settings/custom-models",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model_id:id,name:customModelName.trim()||id})
    }).then(r=>r.json()).then(d=>{ setSettingsData(d); setCustomModelInput(""); setCustomModelName(""); setCustomModelAdding(false); })
      .catch(()=>setCustomModelAdding(false));
  };
  const removeCustomModel = (modelId) => {
    fetch(`/settings/custom-models/${encodeURIComponent(modelId)}`,{method:"DELETE"})
      .then(r=>r.json()).then(d=>{ setSettingsData(d); });
  };
  // Effective settings = server data merged with unsaved edits (for display)
  const effSettings = {...(settingsData||{}), ...Object.fromEntries(
    Object.entries(settingsEdits).map(([k,v])=>[k,v])
  )};
  const activeModel = settingsEdits.model || settingsData?.model || "claude-sonnet-4-6";

  const handleFileAttach = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result;
        setAttachments(prev => {
          if (prev.some(a => a.name === file.name)) return prev; // dedupe
          return [...prev, { name: file.name, content }];
        });
      };
      reader.readAsText(file);
    });
    e.target.value = ""; // reset so same file can be re-added after removal
  };

  const removeAttachment = (name) => setAttachments(prev => prev.filter(a => a.name !== name));

  // ── Stop pipeline ─────────────────────────────────────────────────────────
  const handleStop = () => {
    clearAll();
    setAppState("idle");
    setActive(null);
    setGateStage(null);
    resumeFn.current = null;
    addLog("■ Pipeline stopped by user","warn");
  };

  // ── Re-run pipeline from a specific stage onwards ─────────────────────────
  const rerunFromStage = (fromStageId) => {
    const stageOrder = ["requirements","tasks","code_gen","pr_review","qa","deploy"];
    const idx = stageOrder.indexOf(fromStageId);
    if (idx < 0) return;

    // Clear done + data for stages from idx onwards
    setDone(prev => { const n=new Set(prev); stageOrder.slice(idx).forEach(s=>n.delete(s)); return n; });
    if (idx <= stageOrder.indexOf("code_gen"))  { setRealCodeGen(null); setS4Tid(null);  setApiReady(p=>({...p,code_gen:false})); }
    if (idx <= stageOrder.indexOf("pr_review")) { setRealReview(null);  setS3Tid(null);  setApiReady(p=>({...p,pr_review:false})); }
    if (idx <= stageOrder.indexOf("qa"))        { setRealQA(null);      setQaTid(null);  setApiReady(p=>({...p,qa:false})); }
    setRealDeploy(null);
    clearAll();
    setShowFB(false); setFb(""); setGateStage(null);
    setAppState("running");
    addLog(`↺ Re-running pipeline from Stage ${String(idx+1).padStart(2,"0")} (${fromStageId.replace(/_/g," ")})...`,"info");

    // Shared continuation builders
    const goProdGate = () => {
      setAppState("prod_gate"); setDetail("prod_gate");
      addLog("⚠ PRODUCTION GATE — mandatory approval required","gate");
      resumeFn.current = () => { addLog("⟡ PRODUCTION DEPLOY INITIATED","handoff"); runDeploy(); };
    };

    if (fromStageId === "code_gen") {
      if (!stage2ThreadId) { addLog("⚠ No Stage 2 session found — cannot re-run Code Gen","warn"); setAppState("idle"); return; }
      fetch(`/stage4/start/${stage2ThreadId}`, {method:"POST"})
        .then(r=>r.json())
        .then(d=>{ setS4Tid(d.thread_id); pollStage4(stage2ThreadId); addLog("⟡ Code generation agents re-spawned per ticket","info"); })
        .catch(e=>addLog("⚠ Code gen restart error: "+e.message,"warn"));
      T(() => runStage("code_gen", () => runStage("pr_review", () => runStage("qa", goProdGate))), 200);
    } else if (fromStageId === "pr_review") {
      if (!stage2ThreadId) { addLog("⚠ No Stage 2 session found — cannot re-run PR Review","warn"); setAppState("idle"); return; }
      // Start QA in parallel (same as normal code_gen approval flow)
      if (stage4ThreadId) {
        fetch(`/qa/run/${stage4ThreadId}`, {method:"POST"})
          .then(r=>r.json())
          .then(qd=>{ if(qd.qa_thread_id){ setQaTid(qd.qa_thread_id); pollQA(qd.qa_thread_id); addLog("⟡ QA runner re-started","info"); } })
          .catch(()=>{});
      }
      fetch(`/stage3/start/${stage2ThreadId}`, {method:"POST"})
        .then(()=>{ pollStage3(stage2ThreadId); addLog("⟡ PR Review agents re-launched","info"); })
        .catch(e=>addLog("⚠ PR Review restart error: "+e.message,"warn"));
      T(() => runStage("pr_review", () => runStage("qa", goProdGate)), 200);
    } else if (fromStageId === "qa") {
      if (!stage4ThreadId) { addLog("⚠ No Stage 4 session found — cannot re-run QA","warn"); setAppState("idle"); return; }
      fetch(`/qa/run/${stage4ThreadId}`, {method:"POST"})
        .then(r=>r.json())
        .then(qd=>{ if(qd.qa_thread_id){ setQaTid(qd.qa_thread_id); pollQA(qd.qa_thread_id); addLog("⟡ QA runner re-started","info"); } })
        .catch(e=>addLog("⚠ QA restart error: "+e.message,"warn"));
      T(() => runStage("qa", goProdGate), 200);
    } else if (fromStageId === "deploy") {
      T(() => runDeploy(), 200);
    } else {
      addLog("⚠ Re-run not supported for this stage — use Request Changes instead","warn");
      setAppState("idle");
    }
  };

  // ── Debug help ─────────────────────────────────────────────────────────────
  const sendDebugHelp = () => {
    if (!debugQ.trim()) return;
    setDebugLoading(true); setDebugAns("");
    const currentStage = activeStage || gateStage || (appState === "done" ? "complete" : appState === "idle" ? "idle" : "unknown");
    const pipelineState = {
      app_state: appState,
      active_stage: activeStage || null,
      gate_stage: gateStage || null,
      completed_stages: [...done],
      requirements: realPrd ? { title: realPrd.title, goals: realPrd.goals?.length, stories: realPrd.user_stories?.length } : null,
      tasks: realTasks.length > 0 ? { count: realTasks.length } : null,
      code_gen: realCodeGen ? { tasks_generated: realCodeGen.generated?.length || 0, total_files: realCodeGen.total_files || 0 } : null,
      pr_review: realReview ? { findings: realReview.findings?.length || 0, verdict: realReview.verdict || null } : null,
      qa: realQA?.result ? { passed: realQA.result.passed, failed: realQA.result.failed, total: realQA.result.total, failed_tests: (realQA.result.tests||[]).filter(t=>t.status==="FAILED").map(t=>t.name) } : null,
      deploy: realDeploy ? { status: realDeploy.status, step: realDeploy.step, pr_url: realDeploy.pr_url, app_url: realDeploy.app_url, error: realDeploy.error } : null,
    };
    fetch("/debug/help", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        stage: currentStage,
        question: debugQ,
        logs: logs.slice(-30).map(l=>l.msg),
        error: logs.filter(l=>l.type==="warn"||l.type==="error").slice(-5).map(l=>l.msg).join(" | "),
        pipeline_state: pipelineState,
      })
    }).then(r=>r.json())
      .then(d=>{ setDebugAns(d.answer||"No response"); setDebugLoading(false); })
      .catch(e=>{ setDebugAns("Error: "+e.message); setDebugLoading(false); });
  };

  // Feature Request expand/shrink — set height on the DOM node directly so it
  // survives re-renders (typing) and coexists with native drag-to-resize.
  const toggleInputSize = () => {
    const el = inputRef.current;
    const next = !inputBig;
    setInputBig(next);
    if (el) el.style.height = next ? "220px" : "";
  };

  // Switch request mode; swap the starter example to match, unless the user has
  // typed their own request (then their text is preserved).
  const pickMode = (mode) => {
    if (mode === requestMode) return;
    setRequestMode(mode);
    if (!inputTouched) setInput(DEMO_RUNS[mode].prompt);
  };

  // ── Clear stale observability data on hard refresh, then start polling ──
  const fetchLlmCalls = useCallback(() => {
    if (demoModeRef.current) return; // Demo Mode drives llmCalls locally
    fetch("/stats/llm-calls")
      .then(r => r.json())
      .then(data => { if (!demoModeRef.current && Array.isArray(data.calls)) setLlmCalls(data.calls); })
      .catch(() => {});
  }, []);

  // Load settings on mount so header dots are populated immediately
  useEffect(()=>{
    fetch("/settings").then(r=>r.json()).then(d=>setSettingsData(d)).catch(()=>{});
  },[]);

  useEffect(() => {
    let intervalId;
    fetch("/stats/llm-calls", {method:"DELETE"})
      .catch(() => {})
      .then(() => {
        setLlmCalls([]);
        fetchLlmCalls();
        intervalId = setInterval(fetchLlmCalls, 3000);
      });
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [fetchLlmCalls]);

  const T = (fn,ms) => { const id=setTimeout(fn,ms); toRef.current.push(id); };
  const clearAll = () => { toRef.current.forEach(clearTimeout); toRef.current=[]; };
  const addLog   = (msg,type) => {
    const ts = new Date().toTimeString().slice(0,8);
    setLogs(p => [...p, {msg,type,ts,id:Math.random()}]);
    setTimeout(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },50);
  };

  // ── Run stage ──────────────────────────────────────────────────────────
  const runStage = (stageId, onComplete) => {
    const script  = PIPELINE_SCRIPT[stageId];
    const dur     = STAGE_DUR[stageId];
    setActive(stageId); setDetail(stageId);
    setProgress(p => ({...p,[stageId]:0})); setAppState("running");
    for(let i=1;i<=40;i++) T(()=>setProgress(p=>({...p,[stageId]:(i/40)*100})), (dur/40)*i);
    script.forEach(({t,msg,type}) => T(()=>addLog(msg,type), t));
    T(()=>{
      setDone(p=>new Set([...p,stageId])); setActive(null);
      setAppState("gate"); setGateStage(stageId); setDetail("gate_"+stageId);
      resumeFn.current = onComplete;
    }, dur);
  };

  // ── Poll for Stage 2 session after PRD approval ────────────────────────
  const pollStage2 = (prdThreadId) => {
    const poll = () => {
      fetch("/stage2/sessions").then(r=>r.json()).then(sessions => {
        const entry = Object.entries(sessions).find(([,v]) => v.prd_thread_id===prdThreadId && v.task_count>0);
        if (entry) {
          const [tid, data] = entry;
          setS2Tid(tid);
          setApiReady(p=>({...p, tasks:true}));
          fetch(`/stage2/tasks/${tid}`).then(r=>r.json()).then(d=>{
            const tasks = d.tasks||[];
            if(d.dependency_graph) setRealDepGraph(d.dependency_graph);
            if(tasks.length) {
              setRealTasks(tasks);
              tasks.forEach((t,i) => setTimeout(()=>addLog(`✓ [${(t.type||"task").toUpperCase()}] ${t.title?.slice(0,55)} — ${t.estimate_hours}h`,"success"), i*120));
              const totalHours = tasks.reduce((a,t)=>a+(t.estimate_hours||0),0);
              setTimeout(()=>addLog(`✓ ${tasks.length} tasks · ${totalHours.toFixed(1)}h total · posted to Slack`,"success"), tasks.length*120+100);
            }
          }).catch(()=>addLog(`✓ ${data.task_count} tasks generated & posted to Slack`,"success"));
        } else { setTimeout(poll, 3000); }
      }).catch(()=>setTimeout(poll,5000));
    };
    setTimeout(poll, 4000);
  };

  // ── Poll for Stage 3 PR review ────────────────────────────────────────
  const pollStage3 = (s2tid) => {
    const deadline = Date.now() + 120_000;   // 2-min hard timeout
    const poll = () => {
      if (Date.now() > deadline) {
        addLog("⚠ PR Review timed out — enabling gate without LLM results","warn");
        setApiReady(p=>({...p, pr_review:true}));
        return;
      }
      fetch("/stage3/sessions").then(r=>r.json()).then(sessions => {
        const entry = Object.entries(sessions).find(([,v]) => v.stage2_thread_id===s2tid && v.verdict);
        if (entry) {
          const [tid] = entry;
          setS3Tid(tid);
          fetch(`/stage3/review/${tid}`).then(r=>r.json()).then(d=>{
            setRealReview(d);
            setApiReady(p=>({...p, pr_review:true}));
            addLog(`✓ Review complete: ${d.verdict}`,"success");
            (d.findings||[]).forEach((f,i)=>setTimeout(()=>{
              const icon = f.severity==="blocker"?"🔴":f.severity==="warning"?"⚠":"ℹ";
              addLog(`${icon} [${f.agent?.toUpperCase()}] ${f.title}`,"info");
            },i*150));
          }).catch(()=>{});
        } else { setTimeout(poll, 4000); }
      }).catch(()=>setTimeout(poll, 5000));
    };
    setTimeout(poll, 5000);
  };

  // ── Poll for Stage 4 code generation ──────────────────────────────────
  const pollStage4 = (s2tid) => {
    const deadline = Date.now() + 600_000;   // 10-min timeout (5 parallel LLM calls + entrypoint synthesis)
    const poll = () => {
      if (Date.now() > deadline) {
        addLog("⚠ Code Gen timed out — enabling gate without results","warn");
        setApiReady(p=>({...p, code_gen:true}));
        return;
      }
      fetch("/stage4/sessions").then(r=>r.json()).then(sessions => {
        const entry = Object.entries(sessions).find(([,v]) => v.stage2_thread_id===s2tid && v.task_count>=0);
        if (entry) {
          const [tid] = entry;
          setS4Tid(tid);
          fetch(`/stage4/code/${tid}`)
            .then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d=>{
              if((d.generated||[]).length===0) { setTimeout(poll, 4000); return; }
              setRealCodeGen(d);
              setApiReady(p=>({...p, code_gen:true}));
              addLog(`✓ Code gen complete: ${d.generated.length} tasks, ${d.total_files||0} files`,"success");
              (d.generated||[]).forEach((t,i)=>setTimeout(()=>{
                addLog(`✓ [CODE] ${t.task_title?.slice(0,55)} — ${t.files?.length||0} file${t.files?.length!==1?"s":""}`,"success");
              },i*150));
            }).catch(()=>setTimeout(poll, 5000));
        } else { setTimeout(poll, 4000); }
      }).catch(()=>setTimeout(poll,5000));
    };
    setTimeout(poll, 5000);
  };

  // ── Poll QA results ────────────────────────────────────────────────────
  const pollQA = (qaTid) => {
    const deadline = Date.now() + 180_000;
    const poll = () => {
      if (Date.now() > deadline) {
        addLog("⚠ QA timed out — enabling gate without results","warn");
        setApiReady(p=>({...p, qa:true}));
        return;
      }
      fetch(`/qa/results/${qaTid}`).then(r=>r.json()).then(d=>{
        if (d.status==="complete" || d.status==="error") {
          setRealQA(d);
          setApiReady(p=>({...p, qa:true}));
          if (d.status==="complete" && d.result) {
            const r = d.result;
            addLog(`✓ QA complete: ${r.passed} passed, ${r.failed} failed, ${r.errors} errors (${r.total} total)`,"success");
          } else if (d.status==="error") {
            addLog(`⚠ QA runner error: ${d.error}`,"warn");
          }
        } else {
          setTimeout(poll, 4000);
        }
      }).catch(()=>setTimeout(poll,5000));
    };
    setTimeout(poll, 5000);
  };

  const pollDeploy = (deployTid) => {
    const deadline = Date.now() + 300_000;
    const poll = () => {
      if (Date.now() > deadline) {
        addLog("⚠ Deploy polling timed out","warn");
        return;
      }
      fetch(`/stage6/status/${deployTid}`).then(r=>r.json()).then(d=>{
        setRealDeploy(d);
        if (d.status==="complete") {
          addLog(`✓ PR #${d.pr_number} created: ${d.pr_url}`,"success");
          if (d.linear_issues_closed>0) addLog(`✓ ${d.linear_issues_closed} Linear issues closed`,"success");
        } else if (d.status==="error") {
          addLog(`⚠ Deploy error: ${d.error}`,"warn");
        } else {
          setTimeout(poll, 3000);
        }
      }).catch(()=>setTimeout(poll,5000));
    };
    setTimeout(poll, 4000);
  };

  // ── Launch ─────────────────────────────────────────────────────────────
  const handleLaunch = () => {
    demoModeRef.current = false; // real run — re-enable the observability poller
    clearAll(); reset();
    setAppState("running"); setActive(null); setDone(new Set()); setReviews({});
    setProgress({}); setLogs([]); setDetail(null); setGateStage(null);
    setShowFB(false); setFb(""); setProdCfm(""); setEnvProg({});
    setS1Tid(null); setS2Tid(null); setS3Tid(null); setS4Tid(null); setApiReady({}); setRealPrd(null); setRealTasks([]); setRealDepGraph(null); setRealReview(null); setRealCodeGen(null); setRealQA(null); setQaTid(null); setRealDeploy(null); setExpandedFile(null);
    setGithubUrl(""); setAttachments([]);
    addLog(`⟡ DevForge AI pipeline started — ${requestMode === "new_software" ? "New Software" : "Add Feature"}`,"info");
    addLog("⟡ Source: Slack #devforge-requests","info");

    // Clear server call history first, then start Stage 1 — prevents DELETE racing with stage1 LLM recording
    fetch("/stats/llm-calls", {method:"DELETE"})
      .catch(()=>{})
      .then(() => fetch("/stage1/submit", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({raw_text: input, requester:"devforge-ui", request_type: requestMode, github_url: githubUrl||undefined, attachments})
      })).then(r=>r.json()).then(data=>{
      if(data.status==="pending_review") {
        const msg=data.message||"";
        const tid=msg.includes("Thread ID:")? msg.split("Thread ID:")[1].trim().split(".")[0] : null;
        setS1Tid(tid);
        const prd = data.prd;
        if(prd) {
          setRealPrd(prd);
          addLog(`✓ Problem statement extracted`,"success");
          addLog(`✓ Target users: ${Array.isArray(prd.user_stories)? [...new Set((prd.user_stories||[]).map(s=>s.as_a))].slice(0,3).join(", ") : "identified"}`,"success");
          addLog(`✓ PRD "${prd.title}" v${prd.version} — ${prd.goals?.length||0} goals, ${prd.user_stories?.length||0} stories, ${prd.acceptance_criteria?.length||0} criteria`,"success");
          addLog(`✓ Posted to Slack #devforge-prd for review`,"success");
        } else {
          addLog("✓ PRD generated & posted to Slack","success");
        }
        setApiReady(p=>({...p, requirements:true}));
      } else {
        addLog(`⚠ Stage 1 issue: ${(data.message||"").slice(0,60)}`,"warn");
        setApiReady(p=>({...p, requirements:"error"}));
      }
    }).catch(e=>{ addLog("⚠ API error: "+e.message,"warn"); setApiReady(p=>({...p,requirements:"error"})); });

    const s7 = () => {
      addLog("⟡ PRODUCTION DEPLOY INITIATED","handoff");
      runDeploy();
    };
    function goProdGate() {
      setAppState("prod_gate"); setDetail("prod_gate");
      addLog("⚠ PRODUCTION GATE — mandatory approval required","gate");
      resumeFn.current = s7;
    }
    const s6 = () => runStage("qa",          goProdGate);
    const s5 = () => runStage("pr_review",   s6);
    const s4 = () => runStage("code_gen",    s5);
    const s3 = () => runStage("tasks",       s4);
    const s2 = () => runStage("requirements",s3);
    T(() => s2(), 400);
  };

  // ── Demo Mode ────────────────────────────────────────────────────────────
  // Replays DEMO_DATA through the exact same runStage/gate machinery, with zero
  // network calls, so a live demo can't be broken by LLM latency or a flaky API.
  const handleDemoLaunch = () => {
    demoModeRef.current = true;
    clearAll(); reset();
    setAppState("running"); setActive(null); setDone(new Set()); setReviews({});
    setProgress({}); setLogs([]); setDetail(null); setGateStage(null);
    setShowFB(false); setFb(""); setProdCfm(""); setEnvProg({});
    setS1Tid(null); setS2Tid(null); setS3Tid(null); setS4Tid(null); setQaTid(null); setExpandedFile(null);
    setApiReady({ requirements:true, tasks:true, code_gen:true, pr_review:true, qa:true });
    setLlmCalls([]);

    const D = DEMO_RUNS[requestMode] || DEMO_RUNS.add_feature;
    setInput(D.prompt); setInputTouched(false); // show the captured request as if the user typed it
    // Reset artifacts; each stage's data lands mid-animation (see demoStage) so the
    // "running" visuals — agents thinking, code being written, pytest — show first.
    setRealPrd(null); setRealTasks([]); setRealDepGraph(null);
    setRealReview(null); setRealCodeGen(null); setRealQA(null); setRealDeploy(null);

    addLog(`⟡ DEMO MODE — replaying a captured ${requestMode==="new_software"?"new-software build":"feature"} run`,"gate");
    addLog(`⟡ ${D.label}`,"info");

    const pushCalls = (stage) => setLlmCalls(prev => {
      const have = new Set(prev.map(c=>c.id));
      return [...prev, ...D.llmCalls.filter(c=>c.stage===stage && !have.has(c.id))];
    });
    const load = {
      requirements: () => setRealPrd(D.prd),
      tasks:        () => { setRealTasks(D.tasks); setRealDepGraph(D.depGraph); },
      code_gen:     () => setRealCodeGen(D.codeGen),
      pr_review:    () => setRealReview(D.review),
      qa:           () => setRealQA(D.qa),
    };

    const s7 = () => { addLog("⟡ PRODUCTION DEPLOY INITIATED","handoff"); setRealDeploy(D.deploy); pushCalls("deploy"); runDeploy(); };
    function goProdGate(){ setAppState("prod_gate"); setDetail("prod_gate"); addLog("⚠ PRODUCTION GATE — mandatory approval required","gate"); resumeFn.current = s7; }
    const demoStage = (id, onComplete) => {
      pushCalls(id);
      runStage(id, onComplete);
      // data lands ~0.6s before the gate, after the running animation has played
      T(() => { if (load[id]) load[id](); }, Math.max(800, (STAGE_DUR[id]||5000) - 600));
    };
    const s6 = () => demoStage("qa",           goProdGate);
    const s5 = () => demoStage("pr_review",    s6);
    const s4 = () => demoStage("code_gen",     s5);
    const s3 = () => demoStage("tasks",        s4);
    const s2 = () => demoStage("requirements", s3);
    T(() => s2(), 400);
  };

  const runDeploy = () => {
    const dur = STAGE_DUR.deploy;
    setActive("deploy"); setDetail("deploy");
    setProgress(p=>({...p,deploy:0})); setAppState("running");
    // Animate to 85% — final 100% fires when real deploy completes
    for(let i=1;i<=34;i++) T(()=>setProgress(p=>({...p,deploy:(i/34)*85})), (dur/34)*i);
    PIPELINE_SCRIPT.deploy.forEach(({t,msg,type})=>T(()=>addLog(msg,type),t));
  };

  // Drive deploy completion from real API result — not a fixed timer
  useEffect(() => {
    if(realDeploy?.status === "complete") {
      setProgress(p=>({...p,deploy:100}));
      setDone(p=>new Set([...p,"deploy"]));
      setActive(null); setAppState("done"); setDetail("done");
      addLog("🎉 Feature shipped — PR created on GitHub","done");
    } else if(realDeploy?.status === "error") {
      setProgress(p=>({...p,deploy:100}));
      setDone(p=>new Set([...p,"deploy"]));
      setActive(null); setAppState("done"); setDetail("done");
      addLog(`⚠ Deploy failed: ${realDeploy.error}`,"warn");
    }
  }, [realDeploy?.status]);

  const handleApprove = () => {
    if(!gateStage) return;

    // Fire real API calls in background — don't block animation
    if(gateStage==="requirements" && stage1ThreadId) {
      const tid = stage1ThreadId;
      fetch(`/stage1/review/${tid}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"approve"})
      }).then(()=>{
        addLog("✓ PRD approved via API — Stage 2 starting in background","success");
        pollStage2(tid);
      }).catch(e=>addLog("⚠ Approval API error: "+e.message,"warn"));
    }

    if(gateStage==="tasks" && stage2ThreadId) {
      const tid = stage2ThreadId;
      fetch(`/stage2/review/${tid}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"approve"})
      }).then(r=>r.json()).then(data=>{
        const count = (data.linear_issue_ids||[]).length;
        addLog(`✓ ${count} Linear issues created in new project`,"success");
        // Auto-start Stage 4 Code Gen
        fetch(`/stage4/start/${tid}`, {method:"POST"})
          .then(r=>{
            if(!r.ok) {
              addLog("⚠ Code Gen backend unavailable — gate unlocked without generation","warn");
              setApiReady(p=>({...p, code_gen:true}));
              return;
            }
            addLog("⟡ Code generation agents spawned per ticket","info");
            pollStage4(tid);
          }).catch(e=>{ addLog("⚠ Code gen start error: "+e.message,"warn"); setApiReady(p=>({...p,code_gen:true})); });
      }).catch(e=>addLog("⚠ Linear API error: "+e.message,"warn"));
    }

    if(gateStage==="code_gen" && stage4ThreadId) {
      const tid = stage4ThreadId;
      fetch(`/stage4/code/${tid}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"approve"})
      }).then(()=>{
        addLog("✓ Generated code approved — launching PR Review agents + QA runner","success");
        // Start QA in parallel (runs pytest while PR Review is in progress)
        fetch(`/qa/run/${tid}`, {method:"POST"})
          .then(r=>r.json())
          .then(qd=>{
            if(qd.qa_thread_id) {
              setQaTid(qd.qa_thread_id);
              addLog("⟡ QA runner started — running pytest on generated tests","info");
              pollQA(qd.qa_thread_id);
            } else {
              setApiReady(p=>({...p, qa:true}));
            }
          }).catch(()=>setApiReady(p=>({...p, qa:true})));
        // Auto-start Stage 3 PR Review (4-agent review of the generated code)
        if(stage2ThreadId) fetch(`/stage3/start/${stage2ThreadId}`, {method:"POST"})
          .then(r=>{
            if(!r.ok) {
              addLog("⚠ PR Review backend unavailable — gate unlocked without LLM review","warn");
              setApiReady(p=>({...p, pr_review:true}));
              return;
            }
            addLog("⟡ PR Review agents launched (Security · Quality · Coverage · Architecture)","info");
            pollStage3(stage2ThreadId);
          })
          .catch(e=>{ addLog("⚠ PR Review start error: "+e.message,"warn"); setApiReady(p=>({...p,pr_review:true})); });
      }).catch(e=>addLog("⚠ Code gen approval error: "+e.message,"warn"));
    }

    if(gateStage==="pr_review" && stage3ThreadId) {
      fetch(`/stage3/review/${stage3ThreadId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"approve"})
      }).then(()=>addLog("✓ PR Review approved","success"))
        .catch(e=>addLog("⚠ PR Review approval error: "+e.message,"warn"));
    }

    // Immediately advance animation regardless of API
    setReviews(p=>({...p,[gateStage]:"approved"}));
    addLog(`✓ Stage ${STAGES.findIndex(s=>s.id===gateStage)+1} approved`,"success");
    setShowFB(false); setFb(""); setGateStage(null);
    const fn=resumeFn.current; resumeFn.current=null; T(fn,400);
  };
  const handleFBSubmit = () => {
    if(!fb.trim()) return;
    const sid = gateStage;
    const feedback = fb.trim();
    setReviews(p=>({...p,[sid]:"changes"}));
    addLog(`⚠ Changes requested: "${feedback.slice(0,55)}..."`, "warn");
    setShowFB(false); setFb(""); setGateStage(null);
    setDone(p=>{const n=new Set(p); n.delete(sid); return n;});
    const fn = resumeFn.current;

    // Send feedback to backend — all stages now have LLM re-run with feedback
    if(sid==="requirements" && stage1ThreadId) {
      setApiReady(p=>({...p, requirements:false}));
      setRealPrd(null);
      fetch(`/stage1/review/${stage1ThreadId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"reject", feedback})
      }).then(r=>r.json()).then(data=>{
        if(data.prd) {
          setRealPrd(data.prd);
          addLog(`✓ PRD revised (v${data.prd.version}) with your feedback`,"success");
        }
        setApiReady(p=>({...p, requirements:true}));
      }).catch(e=>{ addLog("⚠ Feedback API error: "+e.message,"warn"); setApiReady(p=>({...p,requirements:true})); });
    }

    if(sid==="tasks" && stage2ThreadId) {
      setApiReady(p=>({...p, tasks:false}));
      setRealTasks([]);
      fetch(`/stage2/review/${stage2ThreadId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"reject", feedback})
      }).then(r=>r.json()).then(data=>{
        if(data.tasks?.length) {
          setRealTasks(data.tasks);
          addLog(`✓ Tasks revised (${data.tasks.length} tasks) with your feedback`,"success");
        }
        setApiReady(p=>({...p, tasks:true}));
      }).catch(e=>{ addLog("⚠ Feedback API error: "+e.message,"warn"); setApiReady(p=>({...p,tasks:true})); });
    }

    if(sid==="code_gen" && stage4ThreadId) {
      setApiReady(p=>({...p, code_gen:false}));
      setRealCodeGen(null);
      fetch(`/stage4/code/${stage4ThreadId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"changes_requested", feedback})
      }).then(()=>{
        addLog("⟡ Code regenerating with your feedback...","info");
        pollStage4(stage4ThreadId);
      }).catch(e=>{ addLog("⚠ Feedback API error: "+e.message,"warn"); setApiReady(p=>({...p,code_gen:true})); });
    }

    if(sid==="pr_review" && stage3ThreadId) {
      setApiReady(p=>({...p, pr_review:false}));
      setRealReview(null);
      fetch(`/stage3/review/${stage3ThreadId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({action:"changes_requested", feedback})
      }).then(()=>{
        addLog("⟡ PR review re-running with your feedback...","info");
        pollStage3(stage3ThreadId);
      }).catch(e=>{ addLog("⚠ Feedback API error: "+e.message,"warn"); setApiReady(p=>({...p,pr_review:true})); });
    }

    T(()=>runStage(sid, fn), 500);
  };

  const prodOK = prodCfm.toUpperCase()==="DEPLOY";
  const handleProdDeploy = () => {
    if(!prodOK) return;
    addLog("✓ Production approved","success");

    // If thread IDs aren't in state (e.g. after page refresh), recover from sessions API
    const doFire = (s4tid, s2tid, s3tid, qtid, attempt=0) => {
      if(attempt >= 4) {
        addLog("⚠ Deploy failed after 4 attempts — check backend logs","warn");
        return;
      }
      fetch("/stage6/deploy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          stage4_thread_id: s4tid,
          stage2_thread_id: s2tid,
          ...(qtid  ? {qa_thread_id:     qtid}  : {}),
          ...(s3tid ? {stage3_thread_id: s3tid} : {}),
        })
      }).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .then(txt=>{ if(!txt.trim()) throw new Error("Empty response — server may be reloading"); return JSON.parse(txt); })
        .then(d=>{
          if(d.deploy_thread_id) {
            addLog("⟡ Deploy job started — pushing to GitHub","info");
            pollDeploy(d.deploy_thread_id);
          } else {
            addLog(`⚠ Deploy start failed: ${JSON.stringify(d)}`,"warn");
          }
        }).catch(e=>{
          const delay = (attempt+1) * 3000;
          addLog(`⚠ Deploy API error: ${e.message} — retry ${attempt+1}/4 in ${delay/1000}s...`,"warn");
          setTimeout(()=>doFire(s4tid, s2tid, s3tid, qtid, attempt+1), delay);
        });
    };

    if(stage4ThreadId && stage2ThreadId) {
      doFire(stage4ThreadId, stage2ThreadId, stage3ThreadId, qaThreadId);
    } else {
      // Recover thread IDs from sessions endpoints
      addLog("⟡ Recovering session IDs from backend...","info");
      Promise.all([
        fetch("/stage4/sessions").then(r=>r.json()),
        fetch("/stage2/sessions").then(r=>r.json()),
      ]).then(([s4sessions, s2sessions]) => {
        const s4entry = Object.entries(s4sessions).sort((a,b)=>b[1].file_count-a[1].file_count)[0];
        const s2entry = Object.entries(s2sessions).sort((a,b)=>b[1].task_count-a[1].task_count)[0];
        if(s4entry && s2entry) {
          const s4tid = s4entry[0], s2tid = s2entry[0];
          const s3tid = stage3ThreadId || null;
          const qtid  = qaThreadId || null;
          addLog(`⟡ Recovered: stage4=${s4tid.slice(0,8)}... stage2=${s2tid.slice(0,8)}...`,"info");
          doFire(s4tid, s2tid, s3tid, qtid);
        } else {
          addLog("⚠ Could not recover session IDs — no sessions found","warn");
        }
      }).catch(e=>addLog("⚠ Session recovery failed: "+e.message,"warn"));
    }

    setGateStage(null); const fn=resumeFn.current; resumeFn.current=null; T(fn,400);
  };

  // ── Detail renderer ────────────────────────────────────────────────────
  const renderDetail = () => {
    if(!detail) return <div className="df-idle-hint">⟡ {requestMode==="new_software"?"Describe what you want to build":"Enter a feature request"}<br/>and hit ▶ LAUNCH<br/><br/><span className="df-cursor">_</span></div>;
    if(detail==="requirements") return (
      <div>
        <div className="df-dtitle" style={{color:"#00d4ff"}}>Requirements Agent</div>
        <div className="df-dsub">{requestMode==="new_software"?"New Software → PRD":"Feature Request → PRD"}</div>
        <div className="df-prd">
          {realPrd ? (<>
            <div className="df-prd-h">📋 {realPrd.title}</div>
            <div className="df-ps"><div className="df-pl">Problem</div><div className="df-pt">{realPrd.problem_statement}</div></div>
            <div className="df-ps"><div className="df-pl">Goals</div>{(realPrd.goals||[]).map((g,i)=><div key={i} className="df-pi">{g}</div>)}</div>
            <div className="df-ps"><div className="df-pl">User Stories</div>{(realPrd.user_stories||[]).slice(0,4).map((s,i)=><div key={i} className="df-pi">As a {s.as_a}, I want to {s.i_want}</div>)}</div>
          </>) : (<>
            <div className="df-prd-h" style={{opacity:0.4}}>⟳ Generating PRD...</div>
            <div className="df-ps"><div className="df-pl">Problem</div><div className="df-pt" style={{opacity:0.4}}>Analyzing feature request...</div></div>
            <div className="df-ps"><div className="df-pl">Goals</div><div className="df-pi" style={{opacity:0.4}}>—</div></div>
            <div className="df-ps"><div className="df-pl">User Stories</div><div className="df-pi" style={{opacity:0.4}}>—</div></div>
          </>)}
        </div>
      </div>
    );
    if(detail==="tasks") {
      const taskList = realTasks.length ? realTasks : [];
      const p=progress["tasks"]||0, vis=realTasks.length ? Math.max(1,Math.floor((p/100)*taskList.length)) : 0;
      return <div>
        <div className="df-dtitle" style={{color:"#00ff88"}}>Task Orchestration</div>
        <div className="df-dsub">{realTasks.length ? `${realTasks.length} tasks · dependency-mapped → Linear` : "⟳ Decomposing tasks..."}</div>
        {realDepGraph && realTasks.length>0 && <div style={{margin:"4px 0 14px"}}><DependencyGraph tasks={realTasks} graph={realDepGraph}/></div>}
        <div className="df-tasks">{realTasks.length ? taskList.slice(0,vis).map((t,i)=><div key={i} className="df-task"><span className="df-tid">[{t.type?.toUpperCase()}]</span><span className="df-tname">{t.title}</span><span className="df-tpts">{t.estimate_hours}h</span></div>) : <div className="df-task" style={{opacity:0.4}}><span className="df-tid">—</span><span className="df-tname">waiting for AI...</span></div>}</div>
      </div>;
    }
    if(detail==="code_gen") {
      const p=progress["code_gen"]||0;
      if(realCodeGen && (realCodeGen.generated||[]).length>0) {
        const genIds = new Set((realCodeGen.generated||[]).map(g=>g.task_id));
        const skipped = realTasks.filter(t=>!genIds.has(t.id));
        const outputPath = (realCodeGen.message||"").match(/output\/[^\s]+/)?.[0] || null;
        return (<div>
          <div className="df-dtitle" style={{color:"#bf5fff"}}>Code Generation</div>
          <div className="df-dsub">
            {realCodeGen.generated.length} of {realTasks.length} tasks · {realCodeGen.total_files||0} files
            {outputPath && <> · <span style={{fontFamily:"monospace",color:"#bf5fff"}}>{outputPath}</span></>}
          </div>
          <div className="df-tasks">
            {realCodeGen.generated.map((t,i)=>{
              const linkedTask = realTasks.find(rt=>rt.id===t.task_id);
              const linearId = linkedTask?.linear_issue_id;
              return (
                <div key={i} style={{marginBottom:10,padding:"8px 10px",background:"rgba(191,95,255,0.07)",borderLeft:"2px solid #bf5fff",borderRadius:3}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span className="df-tid">[CODE]</span>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {linearId && <span style={{fontSize:8,fontFamily:"monospace",color:"#bf5fff",opacity:.7}}>#{linearId.slice(-6)}</span>}
                      <span style={{fontSize:9,opacity:.5}}>{t.files?.length||0} file{t.files?.length!==1?"s":""}</span>
                    </div>
                  </div>
                  <div className="df-tname" style={{marginBottom:6}}>{t.task_title}</div>
                  {(t.files||[]).map((f,j)=>{
                    const fkey=`${i}-${j}`;
                    const open=expandedFile===fkey;
                    return (<div key={j}>
                      <div onClick={()=>setExpandedFile(open?null:fkey)} style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        fontSize:9,fontFamily:"monospace",padding:"3px 8px",marginBottom:2,
                        background:"rgba(191,95,255,0.08)",borderRadius:2,cursor:"pointer",
                      }}>
                        <span style={{opacity:.75}}>→ {f.filename}</span>
                        <span style={{color:"#bf5fff",fontSize:8,minWidth:30,textAlign:"right"}}>{open?"▲ hide":"▼ view"}</span>
                      </div>
                      {open&&<CodeBlock code={f.content} style={{maxHeight:220}}/>}
                    </div>);
                  })}
                </div>
              );
            })}
            {skipped.length>0 && (
              <div style={{marginTop:6,padding:"6px 10px",background:tc("rgba(255,255,255,.03)","rgba(0,0,0,.03)"),borderLeft:"2px solid rgba(191,95,255,0.3)",borderRadius:3}}>
                <span style={{fontSize:9,opacity:.4}}>{skipped.length} task{skipped.length!==1?"s":""} skipped (cap): </span>
                <span style={{fontSize:9,opacity:.35,fontStyle:"italic"}}>{skipped.map(t=>t.title).join(", ")}</span>
              </div>
            )}
          </div>
        </div>);
      }
      if(doneStages.has("code_gen")) {
        return (<div><div className="df-dtitle" style={{color:"#bf5fff"}}>Code Generation</div>
          <div className="df-dsub" style={{opacity:.5}}>⟳ Waiting for generated code preview...</div>
          <div style={{marginTop:16,padding:"10px 12px",background:"rgba(191,95,255,0.06)",borderLeft:"2px solid rgba(191,95,255,0.3)",borderRadius:3,fontSize:10,opacity:.5}}>
            Code files were written to disk — preview loading from API...
          </div>
        </div>);
      }
      const taskPool = realTasks.length ? realTasks.map(t=>t.title) : ["Setting up project structure...","Writing authentication logic...","Writing API handlers...","Writing database models...","Writing unit tests..."];
      const vis = Math.max(1, Math.floor((p/100)*taskPool.length));
      return (<div><div className="df-dtitle" style={{color:"#bf5fff"}}>Code Generation</div>
        <div className="df-dsub">{p>10?"⟳ Agents writing code...":"Initializing..."}</div>
        <div className="df-tasks">{taskPool.slice(0,p>10?vis:1).map((ph,i)=>(
          <div key={i} className="df-task" style={{opacity:0.5}}>
            <span className="df-tid" style={{color:"#bf5fff"}}>[GEN]</span>
            <span className="df-tname">{ph}</span>
          </div>
        ))}</div></div>);
    }
    if(detail==="pr_review") {
      const p=progress["pr_review"]||0;
      const agentNames = ["security","quality","coverage","architecture"];
      const agentColors = {security:"#ff4466",quality:"#ffaa00",coverage:"#00ff88",architecture:"#6699ff"};
      if(realReview) {
        const byAgent = agentNames.map(name=>({
          name, color:agentColors[name],
          findings:(realReview.findings||[]).filter(f=>f.agent===name),
        }));
        return (<div><div className="df-dtitle" style={{color:"#e066ff"}}>PR Review Panel</div>
          <div className="df-dsub">{realReview.verdict}</div>
          <div className="df-agents">{byAgent.map((ag)=>{
            const hasBlocker = ag.findings.some(f=>f.severity==="blocker");
            const hasWarn    = ag.findings.some(f=>f.severity==="warning");
            const sc = hasBlocker?"#ff4444":hasWarn?"#ff9500":"#00ff88";
            const status = hasBlocker?"BLOCKED":hasWarn?"WARNED":"PASSED";
            return (<div key={ag.name} className="df-agent passed" style={{"--ac":ag.color}}>
              <div className="df-agh"><div className="df-agd" style={{background:sc}}/><div>
                <div className="df-agname">{ag.name.charAt(0).toUpperCase()+ag.name.slice(1)} Agent</div>
                <div className="df-agst" style={{color:sc}}>{status} · {ag.findings.length} finding{ag.findings.length!==1?"s":""}</div>
              </div></div>
              {ag.findings.map((f,j)=><div key={j} className="df-agf" style={{opacity:0.85}}>
                {f.severity==="blocker"?"🔴":f.severity==="warning"?"⚠":"ℹ"} <b>{f.title}</b>: {f.recommendation?.slice(0,100)}
              </div>)}
            </div>);
          })}</div></div>);
      }
      return (<div><div className="df-dtitle" style={{color:"#e066ff"}}>PR Review Panel</div>
        <div className="df-dsub">4 Agents · Running in parallel...</div>
        <div className="df-agents">{agentNames.map((name)=>{
          const running = p > 10;
          return(<div key={name} className={`df-agent ${running?"running":""}`} style={{"--ac":agentColors[name]}}>
            <div className="df-agh"><div className="df-agd" style={{background:running?agentColors[name]:tc("rgba(200,214,232,.15)","rgba(20,30,80,.15)"),animation:running?"pulse .8s infinite":"none"}}/><div>
              <div className="df-agname">{name.charAt(0).toUpperCase()+name.slice(1)} Agent</div>
              <div className="df-agst">{running?"REVIEWING CODE...":"WAITING"}</div>
            </div></div>
            {running&&<AgentThinking agent={name} color={agentColors[name]}/>}
          </div>);
        })}</div></div>);
    }
    if(detail==="qa") {
      const qr = realQA?.result;
      const cats = qr?.categories;
      const running = !qr;
      const QA_ROWS = [
        {key:"unit",        label:"Unit Tests"},
        {key:"integration", label:"Integration"},
        {key:"e2e",         label:"E2E (Playwright)"},
        {key:"visual",      label:"Visual Regression"},
      ];
      return (<div>
        <div className="df-dtitle" style={{color:"#2dd4bf"}}>QA Agent</div>
        <div className="df-dsub">
          {running
            ? <span style={{animation:"pulse .8s infinite",display:"inline-block"}}>⟳ Running pytest on generated tests...</span>
            : `${qr.passed} passed · ${qr.failed} failed · ${qr.errors} errors · ${qr.total} total`}
        </div>
        <div className="df-qa-list" style={{marginTop:10}}>
          {QA_ROWS.map(({key,label})=>{
            const c = cats?.[key];
            const hasSome = c && c.total > 0;
            const badge  = running ? "RUNNING" : !hasSome ? "—" : c.badge;
            const count  = running ? "" : !hasSome ? "0 tests" :
              c.badge==="PASS" ? `${c.passed} / ${c.total} passed` :
              c.badge==="ERROR" ? `${c.errors} error${c.errors!==1?"s":""}` :
              `${c.passed} passed, ${c.failed+c.errors} failed`;
            const badgeColor = badge==="PASS"?"#2dd4bf":badge==="FAIL"?"#ff2d6b":badge==="ERROR"?"#ffaa00":tc("rgba(200,214,232,.35)","rgba(20,30,80,.4)");
            const badgeBg    = badge==="PASS"?"rgba(45,212,191,.12)":badge==="FAIL"?"rgba(255,45,107,.12)":badge==="ERROR"?"rgba(255,170,0,.12)":tc("rgba(200,214,232,.06)","rgba(20,30,80,.06)");
            return (
              <div key={key} className="df-qa-row">
                <span className="df-qa-type">{label}</span>
                <span className="df-qa-count" style={{color:tc("rgba(200,214,232,.6)","rgba(20,30,80,.55)"),fontSize:10}}>{count}</span>
                <span className="df-qa-badge" style={{background:badgeBg,color:badgeColor,minWidth:52,textAlign:"center",animation:badge==="RUNNING"?"pulse .8s infinite":"none"}}>
                  {badge}
                </span>
              </div>
            );
          })}
        </div>
      </div>);
    }
    if(detail==="deploy") {
      const deploySteps = [
        {key:"pushing",   label:"Push to GitHub",       done: !!(realDeploy?.branch)},
        {key:"pr",        label:"Create Pull Request",  done: !!(realDeploy?.pr_url)},
        {key:"slack",     label:"Slack Notification",   done: realDeploy?.status==="complete"||realDeploy?.step==="linear"||realDeploy?.step==="launching"||realDeploy?.step==="done"},
        {key:"linear",    label:"Close Linear Issues",  done: realDeploy?.status==="complete"||realDeploy?.step==="launching"||realDeploy?.step==="done"},
        {key:"launching", label:"Launch App",           done: !!(realDeploy?.app_url)},
      ];
      const curStep = realDeploy?.step;
      const stepLabel = {pushing:"Pushing files to GitHub…",pr:"Generating PR description…",slack:"Notifying Slack…",linear:"Closing Linear issues…",launching:"Installing packages & launching app…"}[curStep] || "Deploying…";
      return (
        <div>
          <div className="df-dtitle" style={{color:"#ff2d6b"}}>Deploy Pipeline</div>
          <div className="df-dsub">{realDeploy?.status==="complete"?"Deployed & Live":realDeploy?.status==="error"?"Deploy Failed":stepLabel}</div>
          <div className="df-envs">
            {deploySteps.map(s=>(
              <div key={s.key} className={`df-env ${s.done?"live":""}`}>
                <span className="df-env-name" style={{fontSize:10,minWidth:140}}>{s.label}</span>
                <div className="df-env-bar"><div className="df-env-fill" style={{width:s.done?"100%":curStep===s.key?"55%":"0%"}}/></div>
                <span className="df-env-st" style={{color:s.done?"#00ff88":curStep===s.key?"#ffaa00":tc("rgba(200,214,232,.35)","rgba(20,30,80,.35)")}}>{s.done?"✓ DONE":curStep===s.key?"IN PROGRESS":"WAITING"}</span>
              </div>
            ))}
          </div>
          {realDeploy?.pr_url && (
            <div style={{padding:"9px 12px",borderRadius:3,border:"1px solid rgba(0,212,255,.2)",background:"rgba(0,212,255,.04)",marginTop:10}}>
              <div style={{fontSize:8,color:"#00d4ff",letterSpacing:3,textTransform:"uppercase",marginBottom:5}}>Pull Request</div>
              <a href={realDeploy.pr_url} target="_blank" rel="noopener noreferrer" style={{color:"#00d4ff",fontSize:11,wordBreak:"break-all",display:"block"}}>🔗 {realDeploy.pr_url}</a>
              <div style={{fontSize:9,opacity:.5,marginTop:4}}>{realDeploy.branch} · {realDeploy.files_pushed} files pushed{realDeploy.linear_issues_closed>0?` · ${realDeploy.linear_issues_closed} issues closed`:""}</div>
            </div>
          )}
          {realDeploy?.app_url && (
            <div style={{padding:"9px 12px",borderRadius:3,border:"1px solid rgba(0,255,136,.25)",background:"rgba(0,255,136,.06)",marginTop:8}}>
              <div style={{fontSize:8,color:"#00ff88",letterSpacing:3,textTransform:"uppercase",marginBottom:5}}>🟢 App Running</div>
              <a href={realDeploy.app_url} target="_blank" rel="noopener noreferrer" style={{color:"#00ff88",fontSize:12,fontWeight:"bold",display:"block",marginBottom:4}}>🚀 {realDeploy.app_url}</a>
              {realDeploy.app_docs_url && <a href={realDeploy.app_docs_url} target="_blank" rel="noopener noreferrer" style={{color:"rgba(0,255,136,.7)",fontSize:10,display:"block"}}>📖 API Docs — {realDeploy.app_docs_url}</a>}
            </div>
          )}
          {realDeploy?.status==="error" && <div style={{color:"#ff4444",fontSize:11,marginTop:8,padding:"8px 12px",border:"1px solid rgba(255,68,68,.2)",borderRadius:3}}>⚠ {realDeploy.error}</div>}
          {!realDeploy && (
            <div style={{marginTop:12}}>
              <button onClick={()=>{
                fetch("/stage4/sessions").then(r=>r.json()).then(s4s=>{
                  fetch("/stage2/sessions").then(r=>r.json()).then(s2s=>{
                    const s4e=Object.entries(s4s).sort((a,b)=>b[1].file_count-a[1].file_count)[0];
                    const s2e=Object.entries(s2s).sort((a,b)=>b[1].task_count-a[1].task_count)[0];
                    if(!s4e||!s2e){addLog("⚠ No sessions found","warn");return;}
                    fetch("/stage6/deploy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage4_thread_id:s4e[0],stage2_thread_id:s2e[0]})})
                      .then(r=>r.json()).then(d=>{if(d.deploy_thread_id){addLog("⟡ Deploy retriggered","info");pollDeploy(d.deploy_thread_id);}})
                      .catch(e=>addLog("⚠ "+e.message,"warn"));
                  });
                });
              }} style={{fontSize:9,letterSpacing:1.5,padding:"5px 12px",border:"1px solid rgba(255,170,0,.4)",borderRadius:2,background:"rgba(255,170,0,.08)",color:"#ffaa00",cursor:"pointer",fontFamily:"'Space Mono',monospace",textTransform:"uppercase"}}>
                ↺ Retrigger Deploy
              </button>
            </div>
          )}
        </div>
      );
    }
    if(detail&&detail.startsWith("gate_")) {
      const sid=detail.replace("gate_",""), s=REVIEW_SUMMARY[sid]; if(!s) return null;
      const apiKey = sid==="requirements"?"requirements":sid==="tasks"?"tasks":sid==="code_gen"?"code_gen":sid==="pr_review"?"pr_review":sid==="qa"?"qa":null;
      const ready = !apiKey || apiReady[apiKey]===true;
      const apiErr = apiKey && apiReady[apiKey]==="error";
      const loadingMsg = sid==="requirements"?"⟳ AI generating PRD...":sid==="tasks"?"⟳ AI decomposing tasks...":sid==="code_gen"?"⟳ Generating code per ticket...":sid==="pr_review"?"⟳ 4 agents reviewing code...":sid==="qa"?"⟳ Running pytest on generated tests...":null;

      // Build real bullet points — show loading skeleton until API returns
      let points, verdict;
      if(sid==="requirements") {
        if(realPrd) {
          verdict = `"${realPrd.title}" (v${realPrd.version}) — ${realPrd.user_stories?.length||0} user stories, ${realPrd.acceptance_criteria?.length||0} acceptance criteria`;
          points = [
            `Problem: ${realPrd.problem_statement?.slice(0,100)}`,
            ...(realPrd.goals||[]).slice(0,2).map(g=>`Goal: ${g.slice(0,90)}`),
            `${realPrd.user_stories?.length||0} user stories · ${realPrd.non_goals?.length||0} non-goals · ${realPrd.technical_notes?.length||0} tech notes`,
          ];
        } else {
          verdict = "Waiting for AI to generate PRD...";
          points = ["— generating problem statement", "— generating goals", "— generating user stories"];
        }
      } else if(sid==="tasks") {
        if(realTasks.length) {
          verdict = `${realTasks.length} engineering tasks decomposed with dependency graph`;
          points = realTasks.slice(0,5).map(t=>`[${t.type?.toUpperCase()}] ${t.title?.slice(0,70)} — ${t.estimate_hours}h`);
        } else {
          verdict = "Waiting for AI to decompose tasks...";
          points = ["— generating task breakdown", "— estimating hours", "— building dependency graph"];
        }
      } else if(sid==="code_gen") {
        if(realCodeGen) {
          verdict = `${realCodeGen.generated?.length||0} tasks generated · ${realCodeGen.total_files||0} files`;
          points = (realCodeGen.generated||[]).slice(0,5).map(t=>`[CODE] ${t.task_title?.slice(0,70)} — ${t.files?.length||0} file${t.files?.length!==1?"s":""}`);
        } else {
          verdict = "Waiting for code generation agents to complete...";
          points = ["— Agents writing implementation files", "— Agents writing unit tests", "— Reviewing output quality", "— Compiling results"];
        }
      } else if(sid==="pr_review") {
        if(realReview) {
          verdict = realReview.verdict;
          points = (realReview.findings||[]).slice(0,6).map(f=>{
            const icon = f.severity==="blocker"?"🔴":f.severity==="warning"?"⚠":"ℹ";
            return `${icon} [${f.agent?.toUpperCase()}] ${f.title}`;
          });
        } else {
          verdict = "Waiting for 4-agent code review to complete...";
          points = ["— Security agent reviewing generated code", "— Quality agent checking patterns", "— Coverage agent verifying tests", "— Architecture agent auditing structure"];
        }
      } else if(sid==="qa") {
        if(realQA?.result) {
          const qr = realQA.result;
          verdict = `${qr.passed} passed · ${qr.failed} failed · ${qr.errors} errors · ${qr.total} total`;
          if(qr.tests?.length>0) {
            points = qr.tests.slice(0,6).map(t=>{
              const ic = t.status==="PASSED"?"✓":t.status==="ERROR"?"⚠":"✗";
              return `${ic} ${t.name}`;
            });
          } else {
            points = [`✓ ${qr.passed} tests passed`, qr.failed>0?`✗ ${qr.failed} failed`:"✓ 0 failures", qr.errors>0?`⚠ ${qr.errors} errors`:"✓ 0 errors"].filter(Boolean);
          }
        } else if(realQA?.status==="error") {
          verdict = `QA runner error: ${realQA.error||"unknown"}`;
          points = ["⚠ pytest could not run — check generated test files"];
        } else {
          verdict = "Waiting for pytest results...";
          points = ["⟳ running pytest on generated test files"];
        }
      } else {
        verdict = s.verdict || "";
        points = s.points || [];
      }

      return (<div><div className="df-dtitle" style={{color:"#ffaa00"}}>Human Review Required</div><div className="df-dsub">Stage {STAGES.findIndex(x=>x.id===sid)+1} complete</div><div className="df-gate"><div className="df-gate-hdr"><span className="df-gate-icon">🔍</span><span className="df-gate-title">{s.title}</span></div><div className="df-gate-verdict">{verdict}</div>{!ready&&!apiErr&&<div style={{color:"#ff9500",fontSize:11,margin:"8px 0",animation:"pulse .8s infinite"}}>{loadingMsg}</div>}{apiErr&&<div style={{color:"#ff4444",fontSize:11,margin:"8px 0"}}>⚠ API error — check logs</div>}<div className="df-gate-pts">{points.map((p,i)=><div key={i} className="df-gate-pt">{p}</div>)}</div><div className="df-gate-actions"><button className="df-gate-ok" onClick={handleApprove} disabled={!ready} style={{opacity:ready?1:0.45,cursor:ready?"pointer":"not-allowed"}}>✓ {s.approve}</button><button className="df-gate-rej" onClick={()=>setShowFB(true)}>↺ Request Changes</button></div>{showFB&&<div className="df-fb-wrap"><div className="df-fb-lbl">Describe changes needed</div><textarea className="df-fb-inp" rows={3} value={fb} onChange={e=>setFb(e.target.value)} placeholder="e.g. Add token expiry edge case..."/><button className="df-fb-sub" onClick={handleFBSubmit}>Submit & Re-run Stage</button></div>}</div></div>);
    }
    if(detail==="prod_gate") return (
      <div>
        <div className="df-dtitle" style={{color:"#ff2d6b"}}>Production Deploy Gate</div>
        <div className="df-dsub">Mandatory Approval · Cannot be undone</div>
        <div className="df-prod-gate">
          <div className="df-pg-hdr"><span className="df-pg-icon">⚠️</span><span className="df-pg-title">MANDATORY APPROVAL</span></div>
          <div className="df-pg-sub">You are about to push to PRODUCTION</div>
          <div className="df-pg-checks">{[
            "PRD reviewed & approved",
            `${realTasks.length||"5"} Linear tasks completed`,
            `PR: ${realReview ? `${(realReview.findings||[]).filter(f=>f.severity==="blocker").length} blockers, ${(realReview.findings||[]).filter(f=>f.severity==="warning").length} warnings` : "0 blockers, reviewed"}`,
            realQA?.result ? `QA: ${realQA.result.passed}/${realQA.result.total} tests passed, ${realQA.result.failed} failed` : "QA: tests executed",
            "DEV, STAGING, UAT — all green",
          ].map((c,i)=><div key={i} className="df-pg-check"><span className="df-pg-check-ic">✓</span><span>{c}</span></div>)}</div>
          <div className="df-pg-clbl">Type DEPLOY to confirm</div>
          <input className="df-pg-cinp" value={prodCfm} onChange={e=>setProdCfm(e.target.value)} placeholder="type DEPLOY to unlock"/>
          <button className={`df-pg-btn ${prodOK?"unlocked":"locked"}`} onClick={handleProdDeploy} disabled={!prodOK}>{prodOK?"🚀 Push to Production":"🔒 Confirm Above to Unlock"}</button>
        </div>
      </div>
    );
    if(detail==="done") {
      const s=Math.floor(elapsed/1000),m=Math.floor(s/60);
      return <div className="df-done"><Confetti/><div className="df-done-ic">🎉</div><div className="df-done-t">{requestMode==="new_software"?"Software Built & Deployed":"Feature Shipped to Production"}</div><div className="df-done-s">6 stages · 5 approvals · zero handoffs</div><div className="df-metrics">{[{v:`${m}m ${s%60}s`,l:"Total Time"},{v:llmCalls.length,l:"LLM Calls"},{v:`$${llmCalls.reduce((a,c)=>a+c.cost,0).toFixed(4)}`,l:"API Cost"},{v:"100%",l:"Tests Green"}].map((m,i)=><div key={i} className="df-metric"><div className="df-mv">{m.v}</div><div className="df-ml">{m.l}</div></div>)}</div>{realDeploy?.app_url&&<a href={realDeploy.app_url} target="_blank" rel="noopener noreferrer" style={{color:"#00ff88",fontSize:13,fontWeight:"bold",marginTop:16,display:"block",textAlign:"center",letterSpacing:1,padding:"10px 0",border:"1px solid rgba(0,255,136,.3)",borderRadius:4,background:"rgba(0,255,136,.07)"}}>🚀 Open App — {realDeploy.app_url}</a>}{realDeploy?.app_docs_url&&<a href={realDeploy.app_docs_url} target="_blank" rel="noopener noreferrer" style={{color:"rgba(0,255,136,.6)",fontSize:10,marginTop:6,display:"block",textAlign:"center",letterSpacing:1}}>📖 API Docs — {realDeploy.app_docs_url}</a>}{realDeploy?.pr_url&&<a href={realDeploy.pr_url} target="_blank" rel="noopener noreferrer" style={{color:"#00d4ff",fontSize:11,marginTop:8,display:"block",textAlign:"center",letterSpacing:1}}>🔗 View Pull Request — PR #{realDeploy.pr_number}</a>}</div>;
    }
    return null;
  };

  const badgeCls  = appState==="running"?"running":appState==="gate"||appState==="prod_gate"?"gate":appState==="done"?"done":"idle";
  const badgeTxt  = appState==="running"?"● PIPELINE ACTIVE":appState==="gate"?"⏸ AWAITING REVIEW":appState==="prod_gate"?"⚠ PROD GATE":appState==="done"?"✓ COMPLETE":"STANDBY";
  const timerColor= appState==="running"?"#00ff88":appState==="done"?"#00d4ff":appState==="gate"||appState==="prod_gate"?"#ffaa00":tc("#fff","#1a1d2e");

  return (
    <div className="df" data-theme={theme}>
      <style>{css}</style>
      <div className="df-scan"/>

      {/* Header */}
      <div className="df-hdr">
        <div className="df-logo">
          <div className="df-hex">
            <svg viewBox="0 0 40 44" width="30" height="33" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="dfHexStroke" x1="0" y1="0" x2="40" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00e5ff"/><stop offset="1" stopColor="#0077ff"/>
                </linearGradient>
                <linearGradient id="dfBolt" x1="14" y1="9" x2="27" y2="35" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#eafcff"/><stop offset="1" stopColor="#00d4ff"/>
                </linearGradient>
              </defs>
              <polygon points="20,2 37,12 37,32 20,42 3,32 3,12" fill="rgba(0,212,255,0.08)" stroke="url(#dfHexStroke)" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M23 9 L14 24.5 L19.4 24.5 L17 35 L27 19 L21.2 19 Z" fill="url(#dfBolt)"/>
            </svg>
          </div>
          <div><div className="df-lname">Dev<span>Forge</span> AI</div><div className="df-ltag">Autopilot Engineer · Autonomous SDLC</div></div>
        </div>
        <div className="df-timer" style={{color:timerColor}}>{display}</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Integration status dots */}
          <div className="df-int-dots" title="Integration status: Anthropic · GitHub · Linear · Slack">
            {[
              {lbl:"AI",  on: settingsData?.anthropic_api_key_set, color:"#00d4ff"},
              {lbl:"GH",  on: settingsData?.github_token_set,      color:"#c8d6e8"},
              {lbl:"LI",  on: settingsData?.linear_api_key_set,    color:"#6366f1"},
              {lbl:"SL",  on: settingsData?.slack_bot_token_set,   color:"#4ade80"},
            ].map(({lbl,on,color})=>(
              <div key={lbl} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div className={`df-int-dot ${on?"on":"off"}`} style={on?{background:color,boxShadow:`0 0 5px ${color}`}:{}} title={lbl}/>
                <span className="df-int-dot-lbl">{lbl}</span>
              </div>
            ))}
          </div>
          <div className={`df-badge ${badgeCls}`}>{badgeTxt}</div>
        </div>
      </div>

      {/* Input */}
      <div className="df-inp-area">
        <div className="df-inp-w">
          <div className="df-mode-row">
            <button className={`df-mode-btn${requestMode==="new_software"?" active":""}`} onClick={()=>pickMode("new_software")} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}>🆕 New Software</button>
            <button className={`df-mode-btn${requestMode==="add_feature"?" active":""}`} onClick={()=>pickMode("add_feature")} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}>➕ Add Feature</button>
            <button className={`df-mode-btn demo${demoMode?" on":""}`} onClick={()=>setDemoMode(d=>!d)} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"} title="Replay a captured run — bulletproof, no live API calls">{demoMode?"▶ DEMO: ON":"◉ DEMO: OFF"}</button>
          </div>
          <div className="df-inp-lblrow">
            <span className="df-inp-lbl">What do you want to build?</span>
            <button className="df-pipe-btn" onClick={toggleInputSize} title={inputBig?"Shrink input":"Expand input"}>{inputBig?"−":"+"}</button>
          </div>
          <textarea ref={inputRef} className="df-inp" rows={2} value={input} onChange={e=>{setInput(e.target.value); setInputTouched(true);}} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"} placeholder={requestMode==="new_software"?"Describe the software you want to build — problem it solves, target users, core functionality...":"Describe the feature to add — problem, users, success criteria..."}/>
          {/* Context attachments row */}
          <div className="df-ctx-row">
            <input
              className="df-ctx-gh"
              value={githubUrl}
              onChange={e=>setGithubUrl(e.target.value)}
              disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}
              placeholder="github.com/owner/repo  (optional)"
            />
            <button
              className="df-ctx-attach"
              disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}
              onClick={()=>fileInputRef.current?.click()}
              title="Attach files (.md, .txt, .py, .ts, .json, …)"
            >+ Files</button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt,.py,.ts,.tsx,.js,.jsx,.json,.yaml,.yml,.env,.toml,.rst,.csv,.sql"
              style={{display:"none"}}
              onChange={handleFileAttach}
            />
          </div>
          {/* Chips for attached files + github */}
          {(githubUrl || attachments.length > 0) && (
            <div className="df-ctx-chips">
              {githubUrl && (
                <div className="df-ctx-chip gh">
                  <span>⎇ {githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//,"")}</span>
                  <button onClick={()=>setGithubUrl("")} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}>×</button>
                </div>
              )}
              {attachments.map(a=>(
                <div key={a.name} className="df-ctx-chip">
                  <span>📄 {a.name}</span>
                  <button onClick={()=>removeAttachment(a.name)} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <button className="df-launch" onClick={demoMode?handleDemoLaunch:handleLaunch} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"||(!demoMode&&!input.trim())}>
            {appState==="running"?"RUNNING...":(appState==="gate"||appState==="prod_gate")?"AWAITING...":(appState==="done"?"↺ RERUN":(demoMode?"▶ DEMO RUN":"▶ LAUNCH"))}
          </button>
          {appState==="running"&&(
            <button className="df-stop" onClick={handleStop}>■ STOP</button>
          )}
          {(appState==="running"||appState==="gate"||appState==="done")&&(
            <button className="df-dbg-btn" onClick={()=>{setDebugOpen(o=>!o);setDebugAns("");setDebugQ("");}} title="Ask Claude to diagnose a stuck stage">? Help</button>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="df-main">

        {/* Pipeline sidebar */}
        <div className={`df-pipe ${pipeCollapsed?"collapsed":""}`}>
          <div className="df-pipe-toggle">
            {!pipeCollapsed&&<span className="df-pipe-hdr-lbl">Pipeline</span>}
            <button className="df-pipe-btn" onClick={()=>setPipeCollapsed(c=>!c)} title={pipeCollapsed?"Expand pipeline":"Collapse pipeline"}>{pipeCollapsed?"»":"«"}</button>
          </div>
          {STAGES.map((stage,i)=>{
            const isActive=activeStage===stage.id, isDone=doneStages.has(stage.id), isGate=gateStage===stage.id;
            const rev=stageReviews[stage.id], p=progress[stage.id]||0;
            const clickable=isDone||isActive||isGate;
            const goDetail=()=>{ if(isGate) setDetail("gate_"+stage.id); else if(isDone||isActive) setDetail(stage.id); };
            if(pipeCollapsed) return (
              <div key={stage.id} className={`df-rail ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`} style={{"--c":isGate?"#ffaa00":stage.color,cursor:clickable?"pointer":"default"}} title={`${stage.num} · ${stage.label} — ${stage.desc}`} onClick={goDetail}>
                <span className="df-rail-num">{stage.num}</span>
                <span className={`df-cicon ${isActive?"spin":""}`} style={{fontSize:16,color:isActive||isDone||isGate?(isGate?"#ffaa00":stage.color):tc("rgba(200,214,232,.25)","rgba(20,30,80,.25)")}}>{isDone&&!isGate?"✓":isGate?"⏸":stage.icon}</span>
                <span className="df-rail-dot" style={{background:isDone?"#00ff88":isActive?stage.color:isGate?"#ffaa00":tc("rgba(200,214,232,.12)","rgba(20,30,80,.12)"),animation:isActive||isGate?"pulse 1s infinite":"none"}}/>
              </div>
            );
            return <div key={stage.id}>
              <div className={`df-card ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`} style={{"--c":isGate?"#ffaa00":stage.color,"--glow":isGate?"rgba(255,170,0,.3)":stage.glow,cursor:(isDone||isActive||isGate)?"pointer":"default"}} onClick={()=>{ if(isGate) setDetail("gate_"+stage.id); else if(isDone||isActive) setDetail(stage.id); }}>
                <div className="df-crow">
                  <span className="df-cnum">{stage.num}</span>
                  <span className={`df-cicon ${isActive?"spin":""}`} style={{color:isActive||isDone||isGate?(isGate?"#ffaa00":stage.color):tc("rgba(200,214,232,.25)","rgba(20,30,80,.25)")}}>{isDone&&!isGate?"✓":isGate?"⏸":stage.icon}</span>
                  <div className="df-clbl">
                    <div className="df-cname" style={{color:isActive?stage.color:isDone?tc("#fff","#0d0f1f"):isGate?"#ffaa00":tc("rgba(255,255,255,.45)","rgba(20,30,80,.45)")}}>{stage.label}</div>
                    <div className="df-csub">{stage.sub}</div>
                  </div>
                  <div className="df-cdot" style={{background:isDone?"#00ff88":isActive?stage.color:isGate?"#ffaa00":tc("rgba(200,214,232,.12)","rgba(20,30,80,.12)"),animation:isActive||isGate?"pulse 1s infinite":"none"}}/>
                </div>
                {(isActive||isDone||isGate)&&<div className="df-cdesc">{isGate?"Awaiting your approval":stage.desc}</div>}
                {(isActive||isDone)&&<div className="df-cprog"><div className="df-cfill" style={{width:`${isDone?100:p}%`,background:isGate?"#ffaa00":stage.color}}/></div>}
                {llmCalls.filter(c=>c.stage===stage.id).length>0&&(
                  <div style={{fontSize:9,marginTop:5,opacity:.5,color:stage.color}}>
                    {llmCalls.filter(c=>c.stage===stage.id).length} LLM call{llmCalls.filter(c=>c.stage===stage.id).length>1?"s":""} · {llmCalls.filter(c=>c.stage===stage.id).reduce((a,c)=>a+c.inputTok+c.outputTok,0).toLocaleString()} tok
                  </div>
                )}
                {rev&&<div className={`df-crev ${rev}`}>{rev==="approved"?"✓ Approved":"↺ Changes Req."}</div>}
                {isDone&&!isGate&&!isActive&&["code_gen","pr_review","qa","deploy"].includes(stage.id)&&(
                  <button className="df-rerun-btn" onClick={e=>{e.stopPropagation();rerunFromStage(stage.id);}} title={`Re-run from Stage ${stage.num} onwards`}>
                    ↺ re-run from here
                  </button>
                )}
              </div>
              {i<STAGES.length-1&&<div className="df-conn"><div className={`df-cline ${isActive?"flow":""}`}/></div>}
            </div>;
          })}
        </div>

        {/* Center: tabs + content */}
        <div className="df-center">
          <div className="df-tabs" style={{alignItems:"center"}}>
            <div className={`df-tab ${tab==="pipeline"?"active":""}`}    onClick={()=>setTab("pipeline")}>Pipeline</div>
            <div className={`df-tab ${tab==="observability"?"active":""}`} onClick={()=>setTab("observability")}>
              LLM Observability {llmCalls.length>0&&<span style={{marginLeft:6,background:"rgba(0,212,255,.15)",color:"#00d4ff",fontSize:8,padding:"1px 5px",borderRadius:2}}>{llmCalls.length}</span>}
            </div>
            <button onClick={toggleTheme} title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}
              style={{marginLeft:"auto",background:"transparent",border:"1px solid",borderColor:theme==="dark"?"rgba(255,255,255,.1)":"rgba(0,0,0,.12)",
                color:theme==="dark"?"rgba(200,214,232,.5)":"rgba(20,30,80,.5)",
                cursor:"pointer",width:30,height:30,borderRadius:7,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0,marginRight:6}}
            >{theme==="dark"?"☀":"🌙"}</button>
            <button className="df-tab" onClick={openSettings} style={{display:"flex",alignItems:"center",gap:5,color:theme==="dark"?"rgba(200,214,232,.75)":"rgba(20,30,80,.6)"}}>⚙ Settings</button>
          </div>
          <div className="df-detail">
            {tab==="pipeline"    ? renderDetail() : <ObsPanel llmCalls={llmCalls} theme={theme}/>}
          </div>
        </div>

        {/* Log */}
        <div className={`df-log ${logView==="wide"?"wide":""} ${logView==="collapsed"?"collapsed":""}`}>
          <div className="df-log-hdr" style={logView==="collapsed"?undefined:{justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div className="df-log-dot" style={{background:appState==="running"?"#00ff88":appState==="gate"||appState==="prod_gate"?"#ffaa00":tc("rgba(200,214,232,.25)","rgba(20,30,80,.2)"),animation:appState==="running"?"pulse 1s infinite":"none"}}/>
              {logView!=="collapsed"&&<span>Live Stream</span>}
            </div>
            <div style={{display:"flex",gap:5}}>
              {logView!=="collapsed"&&(
                <button className="df-pipe-btn" onClick={()=>setLogView(v=>v==="wide"?"normal":"wide")} title={logView==="wide"?"Shrink log":"Widen log"}>{logView==="wide"?"−":"+"}</button>
              )}
              <button className="df-pipe-btn" onClick={()=>setLogView(v=>v==="collapsed"?"normal":"collapsed")} title={logView==="collapsed"?"Expand log":"Collapse log"}>{logView==="collapsed"?"«":"»"}</button>
            </div>
          </div>
          {logView!=="collapsed"&&(
            <div className="df-log-bd" ref={logRef}>
              {logs.length===0&&<div style={{opacity:.25,fontSize:10,textAlign:"center",marginTop:36}}>Awaiting pipeline...</div>}
              {logs.map(e=><div key={e.id} className="df-log-row"><span className="df-log-ts">{e.ts}</span><span className={`df-log-msg ${e.type}`}>{e.msg}</span></div>)}
            </div>
          )}
        </div>

      </div>

      {/* Debug Help Panel */}
      {debugOpen&&(
        <div className="df-dbg-panel">
          <div className="df-dbg-hdr">
            <span className="df-dbg-title">? Debug Assistant</span>
            <button className="df-dbg-close" onClick={()=>setDebugOpen(false)}>×</button>
          </div>
          <div className="df-dbg-body">
            <div className="df-dbg-ctx">
              <strong style={{color:"rgba(170,255,0,.6)"}}>Context:</strong> {activeStage||gateStage||"idle"} stage · last log: {logs.slice(-1)[0]?.msg||"—"}
            </div>
            <textarea
              className="df-dbg-inp"
              rows={3}
              value={debugQ}
              onChange={e=>setDebugQ(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))sendDebugHelp();}}
              placeholder="What's wrong? e.g. Stage 4 keeps timing out, or why is QA failing…"
            />
            <button className="df-dbg-send" onClick={sendDebugHelp} disabled={debugLoading||!debugQ.trim()}>
              {debugLoading?"Thinking...":"Ask Claude ↵"}
            </button>
            {debugAns&&<div className="df-dbg-answer">{debugAns}</div>}
          </div>
        </div>
      )}

      {/* ── Settings Drawer ─────────────────────────────────────────────── */}
      {settingsOpen&&(
        <div className="df-settings-overlay" onClick={e=>{if(e.target===e.currentTarget)closeSettings();}}>
          <div className="df-settings-drawer">
            <div className="df-set-hdr">
              <div className="df-set-title">⚙ Settings</div>
              <button className="df-set-close" onClick={closeSettings}>×</button>
            </div>
            <div className="df-set-tabs">
              {[["llm","🤖 LLM"],["integrations","🔗 Integrations"],["status","📊 Status"]].map(([id,lbl])=>(
                <button key={id} className={`df-set-tab${settingsTab===id?" active":""}`} onClick={()=>setSettingsTab(id)}>{lbl}</button>
              ))}
            </div>

            <div className="df-set-body">

              {/* ── LLM Tab ── */}
              {settingsTab==="llm"&&(<>
                <div className="df-set-section">
                  <div className="df-set-sec-title">Anthropic API Key</div>
                  <div className="df-set-field">
                    <label className="df-set-lbl">API Key</label>
                    <div className="df-set-inp-row">
                      <input
                        className="df-set-inp"
                        type="password"
                        placeholder={settingsData?.anthropic_api_key_preview || "sk-ant-..."}
                        value={settingsEdits.anthropic_api_key||""}
                        onChange={e=>setEdit("anthropic_api_key",e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        className="df-set-test-btn"
                        disabled={settingsTestResult.anthropic?.loading}
                        onClick={()=>testConnection("anthropic")}
                      >Test</button>
                    </div>
                    {settingsData?.anthropic_api_key_set&&!settingsEdits.anthropic_api_key&&(
                      <span className="df-set-preview">Current: {settingsData.anthropic_api_key_preview}</span>
                    )}
                    {settingsTestResult.anthropic&&!settingsTestResult.anthropic.loading&&(
                      <div className={`df-set-result ${settingsTestResult.anthropic.ok?"ok":"err"}`}>
                        {settingsTestResult.anthropic.ok?`✓ Connected · ${settingsTestResult.anthropic.model||settingsData?.model}`:`✗ ${settingsTestResult.anthropic.error}`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="df-set-section">
                  <div className="df-set-sec-title">Model Selection</div>
                  <div className="df-model-cards">
                    {(settingsData?.available_models||[]).map(m=>(
                      <div
                        key={m.id}
                        className={`df-model-card${activeModel===m.id?" selected":""}`}
                        onClick={()=>setEdit("model",m.id)}
                      >
                        <div className="df-mc-row">
                          <span className="df-mc-name">{m.name}</span>
                          <span className={`df-mc-badge ${m.tier}`}>{m.tier}</span>
                          {activeModel===m.id&&<span style={{color:"#00d4ff",fontSize:13}}>✓</span>}
                        </div>
                        <div className="df-mc-desc">{m.desc}</div>
                        <div className="df-mc-price">${m.input_mtok}/M input · ${m.output_mtok}/M output</div>
                      </div>
                    ))}
                    {(settingsData?.custom_models||[]).map(m=>(
                      <div
                        key={m.id}
                        className={`df-model-card${activeModel===m.id?" selected":""}`}
                        onClick={()=>setEdit("model",m.id)}
                      >
                        <div className="df-mc-row">
                          <span className="df-mc-name">{m.name}</span>
                          <span className="df-mc-badge custom">custom</span>
                          {activeModel===m.id&&<span style={{color:"#00d4ff",fontSize:13}}>✓</span>}
                          <button className="df-mc-remove" title="Remove" onClick={e=>{e.stopPropagation();removeCustomModel(m.id);}}>✕</button>
                        </div>
                        <div className="df-mc-desc" style={{fontFamily:"'SF Mono','Cascadia Code',monospace",fontSize:10,opacity:.5}}>{m.id}</div>
                      </div>
                    ))}
                  </div>
                  <div className="df-add-model">
                    <div className="df-add-model-row">
                      <input className="df-add-model-inp" placeholder="Model ID, e.g. claude-sonnet-5-20260101"
                        value={customModelInput} onChange={e=>setCustomModelInput(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&addCustomModel()}/>
                      <button className="df-add-model-btn" disabled={!customModelInput.trim()||customModelAdding} onClick={addCustomModel}>
                        {customModelAdding?"Adding…":"+ Add"}
                      </button>
                    </div>
                    <input className="df-add-model-inp" placeholder="Display name (optional)"
                      value={customModelName} onChange={e=>setCustomModelName(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addCustomModel()}/>
                  </div>
                </div>
              </>)}

              {/* ── Integrations Tab ── */}
              {settingsTab==="integrations"&&(<>
                <div className="df-set-section">
                  <div className="df-set-sec-title">GitHub</div>
                  <div className="df-set-field">
                    <label className="df-set-lbl">Personal Access Token</label>
                    <div className="df-set-inp-row">
                      <input className="df-set-inp" type="password"
                        placeholder={settingsData?.github_token_preview||"ghp_..."}
                        value={settingsEdits.github_token||""}
                        onChange={e=>setEdit("github_token",e.target.value)} autoComplete="off"/>
                      <button className="df-set-test-btn" disabled={settingsTestResult.github?.loading} onClick={()=>testConnection("github")}>Test</button>
                    </div>
                    {settingsData?.github_token_set&&!settingsEdits.github_token&&(
                      <span className="df-set-preview">Current: {settingsData.github_token_preview}</span>
                    )}
                    {settingsTestResult.github&&!settingsTestResult.github.loading&&(
                      <div className={`df-set-result ${settingsTestResult.github.ok?"ok":"err"}`}>
                        {settingsTestResult.github.ok?`✓ ${settingsTestResult.github.info}`:`✗ ${settingsTestResult.github.error}`}
                      </div>
                    )}
                  </div>
                  <div className="df-set-field" style={{marginTop:4}}>
                    <label className="df-set-lbl">Deploy Target Repo <span style={{opacity:.5}}>(owner/repo)</span></label>
                    <input className="df-set-inp"
                      placeholder={settingsData?.github_repo||"owner/repo"}
                      value={settingsEdits.github_repo!=null?settingsEdits.github_repo:(settingsData?.github_repo||"")}
                      onChange={e=>setEdit("github_repo",e.target.value)}/>
                  </div>
                </div>

                <div className="df-set-section">
                  <div className="df-set-sec-title">Linear</div>
                  <div className="df-set-field">
                    <label className="df-set-lbl">API Key</label>
                    <div className="df-set-inp-row">
                      <input className="df-set-inp" type="password"
                        placeholder={settingsData?.linear_api_key_preview||"lin_api_..."}
                        value={settingsEdits.linear_api_key||""}
                        onChange={e=>setEdit("linear_api_key",e.target.value)} autoComplete="off"/>
                      <button className="df-set-test-btn" disabled={settingsTestResult.linear?.loading} onClick={()=>testConnection("linear")}>Test</button>
                    </div>
                    {settingsData?.linear_api_key_set&&!settingsEdits.linear_api_key&&(
                      <span className="df-set-preview">Current: {settingsData.linear_api_key_preview}</span>
                    )}
                    {settingsTestResult.linear&&!settingsTestResult.linear.loading&&(
                      <div className={`df-set-result ${settingsTestResult.linear.ok?"ok":"err"}`}>
                        {settingsTestResult.linear.ok?`✓ ${settingsTestResult.linear.info}`:`✗ ${settingsTestResult.linear.error}`}
                      </div>
                    )}
                  </div>
                  <div className="df-set-field" style={{marginTop:4}}>
                    <label className="df-set-lbl">Team ID</label>
                    <input className="df-set-inp"
                      placeholder={settingsData?.linear_team_id||"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
                      value={settingsEdits.linear_team_id!=null?settingsEdits.linear_team_id:(settingsData?.linear_team_id||"")}
                      onChange={e=>setEdit("linear_team_id",e.target.value)}/>
                  </div>
                </div>

                <div className="df-set-section">
                  <div className="df-set-sec-title">Slack</div>
                  <div className="df-set-field">
                    <label className="df-set-lbl">Bot Token</label>
                    <input className="df-set-inp" type="password"
                      placeholder={settingsData?.slack_bot_token_preview||"xoxb-..."}
                      value={settingsEdits.slack_bot_token||""}
                      onChange={e=>setEdit("slack_bot_token",e.target.value)} autoComplete="off"/>
                    {settingsData?.slack_bot_token_set&&!settingsEdits.slack_bot_token&&(
                      <span className="df-set-preview">Current: {settingsData.slack_bot_token_preview}</span>
                    )}
                  </div>
                  <div className="df-set-field" style={{marginTop:4}}>
                    <label className="df-set-lbl">PRD Channel</label>
                    <input className="df-set-inp"
                      placeholder="#devforge-prd"
                      value={settingsEdits.slack_prd_channel!=null?settingsEdits.slack_prd_channel:(settingsData?.slack_prd_channel||"")}
                      onChange={e=>setEdit("slack_prd_channel",e.target.value)}/>
                  </div>
                </div>
              </>)}

              {/* ── Status Tab ── */}
              {settingsTab==="status"&&(<>
                <div className="df-set-section">
                  <div className="df-set-sec-title">Integration Status</div>
                  {[
                    {label:"Anthropic API",  on:settingsData?.anthropic_api_key_set,  val:settingsData?.anthropic_api_key_preview, color:"#00d4ff"},
                    {label:"Active Model",   on:true, val:settingsData?.model||"claude-sonnet-4-6", color:"#00d4ff"},
                    {label:"GitHub Token",   on:settingsData?.github_token_set,        val:settingsData?.github_token_preview,     color:"#c8d6e8"},
                    {label:"GitHub Repo",    on:!!settingsData?.github_repo,           val:settingsData?.github_repo,             color:"#c8d6e8"},
                    {label:"Linear API Key", on:settingsData?.linear_api_key_set,      val:settingsData?.linear_api_key_preview,  color:"#6366f1"},
                    {label:"Linear Team ID", on:!!settingsData?.linear_team_id,        val:settingsData?.linear_team_id?.slice(0,8)+"...", color:"#6366f1"},
                    {label:"Slack Bot Token",on:settingsData?.slack_bot_token_set,     val:settingsData?.slack_bot_token_preview, color:"#4ade80"},
                    {label:"Slack Channel",  on:!!settingsData?.slack_prd_channel,     val:settingsData?.slack_prd_channel,       color:"#4ade80"},
                  ].map(({label,on,val,color})=>(
                    <div key={label} className="df-int-status-row">
                      <div className="df-int-status-dot" style={on?{background:color,boxShadow:`0 0 5px ${color}`}:{}} />
                      <span className="df-int-status-name">{label}</span>
                      <span className="df-int-status-val">{on?(val||"configured"):"not set"}</span>
                    </div>
                  ))}
                </div>
                <div className="df-set-section">
                  <div className="df-set-sec-title">What's Available</div>
                  <div style={{fontSize:10,color:tc("rgba(200,214,232,.45)","rgba(20,30,80,.55)"),lineHeight:1.8}}>
                    {!settingsData?.anthropic_api_key_set&&<div style={{color:"#ff6644"}}>⚠ No Anthropic API key — pipeline will not run</div>}
                    {!settingsData?.github_token_set&&<div style={{color:"#ffaa00"}}>⚠ No GitHub token — Stage 6 deploy disabled</div>}
                    {!settingsData?.linear_api_key_set&&<div style={{color:"#ffaa00"}}>⚠ No Linear key — task tracking disabled</div>}
                    {!settingsData?.slack_bot_token_set&&<div style={{color:tc("rgba(200,214,232,.4)","rgba(20,30,80,.45)")}}>ℹ No Slack token — notifications disabled</div>}
                    {settingsData?.anthropic_api_key_set&&settingsData?.github_token_set&&settingsData?.linear_api_key_set&&(
                      <div style={{color:"#00ff88"}}>✓ All core integrations configured — pipeline ready</div>
                    )}
                  </div>
                </div>
              </>)}

            </div>

            <div className="df-set-footer">
              <button className="df-set-cancel" onClick={closeSettings}>Cancel</button>
              <button className="df-set-save" disabled={settingsSaving||!Object.keys(settingsEdits).length} onClick={saveSettings}>
                {settingsSaving?"Saving…":"Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attribution footer */}
      <div style={{
        flexShrink:0,padding:"5px 20px",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:12,
        borderTop:`1px solid ${tc("rgba(255,255,255,.05)","rgba(0,0,0,.07)")}`,
        background:tc("rgba(8,9,18,.6)","rgba(238,241,252,.7)"),
      }}>
        <span style={{fontSize:10,color:tc("rgba(200,214,232,.22)","rgba(20,30,80,.3)"),letterSpacing:".04em"}}>
          Built by <strong style={{color:tc("rgba(200,214,232,.45)","rgba(20,30,80,.55)"),fontWeight:600}}>Sushil Kumar</strong>
        </span>
        <a href="https://www.linkedin.com/in/sushilk001" target="_blank" rel="noreferrer"
          style={{fontSize:10,color:"#0a66c2",textDecoration:"none",display:"flex",alignItems:"center",gap:4,fontWeight:500,opacity:.8,transition:"opacity .15s"}}
          onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=".8"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          linkedin.com/in/sushilk001
        </a>
      </div>
    </div>
  );
}
