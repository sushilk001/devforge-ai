// Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  { id:"requirements", num:"01",label:"Requirements", sub:"Agent",   icon:"◈",color:"#00d4ff",glow:"rgba(0,212,255,0.35)",  desc:"Natural language → structured PRD" },
  { id:"tasks",        num:"02",label:"Task Orch.",   sub:"Agent",   icon:"◆",color:"#00ff88",glow:"rgba(0,255,136,0.35)",  desc:"Task graph · critical path · Linear issues" },
  { id:"code_gen",     num:"03",label:"Code Gen",     sub:"Agent",   icon:"◈",color:"#bf5fff",glow:"rgba(191,95,255,0.35)", desc:"Full working codebase generated to disk" },
  { id:"pr_review",    num:"04",label:"PR Review",    sub:"Panel",   icon:"◉",color:"#e066ff",glow:"rgba(224,102,255,0.35)",desc:"Security · quality · coverage · architecture" },
  { id:"qa",           num:"05",label:"QA",           sub:"Agent",   icon:"◆",color:"#2dd4bf",glow:"rgba(45,212,191,0.35)", desc:"pytest runner · pass/fail report per case" },
  { id:"compliance",   num:"06",label:"Compliance",  sub:"Panel",   icon:"⚖",color:"#f59e0b",glow:"rgba(245,158,11,0.35)",  desc:"WCAG 2.2 · GDPR · OWASP · License audit" },
  { id:"deploy",       num:"07",label:"Deploy",       sub:"Pipeline",icon:"▲",color:"#ff2d6b",glow:"rgba(255,45,107,0.35)", desc:"GitHub push · open PR · notify Slack" },
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
  compliance:[
    {t:300, msg:"⟡ Starting compliance & governance audit...",     type:"info"},
    {t:900, msg:"⟡ Running WCAG 2.2 / Section 508 check...",       type:"info"},
    {t:1800,msg:"⟡ Running GDPR / privacy analysis...",            type:"info"},
    {t:2700,msg:"⟡ Running OWASP security compliance check...",    type:"info"},
    {t:3600,msg:"⟡ Running license & regulatory audit...",         type:"info"},
    {t:4800,msg:"⏸ Compliance report ready — awaiting review...",  type:"gate"},
  ],
  deploy:[
    {t:400, msg:"⟡ Pushing generated code to GitHub...",           type:"info"},
    {t:1400,msg:"⟡ Claude writing PR description...",               type:"info"},
    {t:2600,msg:"⟡ Creating GitHub Pull Request...",               type:"info"},
    {t:3600,msg:"⟡ Notifying Slack #devforge-prd...",              type:"info"},
    {t:4400,msg:"⟡ Closing Linear issues as Done...",              type:"info"},
    {t:5900,msg:"🎉 PR CREATED — DELIVERED",                       type:"done"},
  ],
};

const STAGE_DUR = { requirements:5200, tasks:4400, code_gen:6500, pr_review:5400, qa:5000, compliance:5800, deploy:6200 };


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
const STAGE_COLORS = { requirements:"#00d4ff", tasks:"#00ff88", code_gen:"#bf5fff", pr_review:"#e066ff", qa:"#2dd4bf", compliance:"#f59e0b", deploy:"#ff2d6b" };

// ── CSS ────────────────────────────────────────────────────────────────────
const css = `

  /* ── Animations ─────────────────────────────────────────────────────── */
  @keyframes pulse     {0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes glow      {0%,100%{box-shadow:0 0 12px var(--glow),0 0 36px var(--glow)}50%{box-shadow:0 0 28px var(--glow),0 0 72px var(--glow),0 0 120px var(--glow)}}
  @keyframes spin      {from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes fadeUp    {from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn    {from{opacity:0}to{opacity:1}}
  @keyframes slideLog  {from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
  @keyframes blink     {0%,100%{opacity:1}50%{opacity:0}}
  @keyframes flowLine  {0%{transform:translateY(-100%);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateY(300%);opacity:0}}
  @keyframes prodPulse {0%,100%{box-shadow:0 0 20px rgba(255,45,107,.4),0 0 60px rgba(255,45,107,.2)}50%{box-shadow:0 0 48px rgba(255,45,107,.75),0 0 120px rgba(255,45,107,.35)}}
  @keyframes countUp   {from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes tokenIn   {from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
  @keyframes logoGlow  {0%,100%{opacity:.3;transform:scale(.88)}50%{opacity:.85;transform:scale(1.12)}}
  @keyframes nodeRing  {0%,100%{box-shadow:0 0 0 0 var(--glow),0 0 10px var(--glow)}60%{box-shadow:0 0 0 10px rgba(0,0,0,0),0 0 28px var(--glow)}}
  @keyframes shimmer   {0%{background-position:200% center}100%{background-position:-200% center}}
  @keyframes aurora    {0%,100%{opacity:.18;transform:translateX(0) scale(1)}50%{opacity:.32;transform:translateX(-50px) scale(1.08)}}
  @keyframes aurora2   {0%,100%{opacity:.12;transform:translateX(0) scale(1.04)}50%{opacity:.22;transform:translateX(70px) scale(1)}}
  @keyframes dkBgShift {0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
  @keyframes ping      {0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(2.6);opacity:0}}
  @keyframes stageIn   {from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
  @keyframes gateEnter {from{opacity:0;transform:scale(.97) translateY(4px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes dotTravel {0%{top:0%;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:100%;opacity:0}}
  @keyframes chargeUp  {0%{background-position:200% center}100%{background-position:0% center}}
  @keyframes doneFloat {0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes borderRun {0%{background-position:0% 0%}100%{background-position:200% 0%}}

  /* ── Base ────────────────────────────────────────────────────────────── */
  .df*{box-sizing:border-box;margin:0;padding:0}
  .df{
    font-family:-apple-system,'SF Pro Text','Helvetica Neue',system-ui,sans-serif;
    background:linear-gradient(-45deg,#000510,#000d28,#00071a,#000c22,#000510);
    background-size:400% 400%;
    animation:dkBgShift 18s ease infinite;
    height:100vh;color:#d4daf5;overflow:hidden;position:relative;
    display:flex;flex-direction:column;-webkit-font-smoothing:antialiased;
  }
  .df::before,.df::after{
    content:'';position:absolute;border-radius:50%;pointer-events:none;z-index:0;
  }
  .df::before{
    width:1100px;height:1100px;top:-360px;left:-240px;
    background:radial-gradient(circle,rgba(0,160,255,.28) 0%,rgba(0,80,220,.12) 40%,transparent 70%);
    filter:blur(40px);
    animation:aurora 14s ease-in-out infinite;
  }
  .df::after{
    width:900px;height:900px;bottom:-260px;right:-140px;
    background:radial-gradient(circle,rgba(30,20,240,.22) 0%,rgba(0,120,255,.10) 45%,transparent 70%);
    filter:blur(36px);
    animation:aurora2 18s ease-in-out infinite;
  }
  .df-scan{display:none}
  .df>*{position:relative;z-index:1}

  /* ── Header ─────────────────────────────────────────────────────────── */
  .df-hdr{
    display:flex;align-items:center;justify-content:space-between;
    padding:12px 24px;flex-shrink:0;position:relative;
    border-bottom:1px solid rgba(255,255,255,.07);
    background:rgba(0,3,12,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    box-shadow:0 1px 0 rgba(0,212,255,.06),0 2px 24px rgba(0,0,0,.3);
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
    background:linear-gradient(90deg,#00d4ff,#7c9fff,#00d4ff);
    background-size:200% auto;
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
    animation:shimmer 6s linear infinite;
  }
  .df-ltag{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.08em;color:rgba(120,160,220,.6);margin-top:4px}
  .df-ltag::before{content:'';width:5px;height:5px;border-radius:50%;background:#00ff88;flex-shrink:0;
    box-shadow:0 0 6px #00ff88;animation:pulse 1.6s infinite}
  .df-timer{font-size:22px;font-weight:700;letter-spacing:.06em;font-variant-numeric:tabular-nums;
    font-family:'SF Mono','Cascadia Code',monospace;color:#d4daf5}
  .df-badge{font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 12px;border:1px solid;border-radius:20px}
  .df-badge.idle   {color:rgba(200,214,232,.65);border-color:rgba(200,214,232,.2)}
  .df-badge.running{color:#00ff88;border-color:rgba(0,255,136,.35);animation:pulse 1.5s infinite}
  .df-badge.gate   {color:#ffaa00;border-color:rgba(255,170,0,.35);animation:pulse 1s infinite}
  .df-badge.done   {color:#00d4ff;border-color:rgba(0,212,255,.35)}

  /* ── Input area ──────────────────────────────────────────────────────── */
  .df-inp-area{
    display:flex;gap:10px;align-items:flex-end;padding:14px 24px;flex-shrink:0;
    border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(0,3,12,.78);backdrop-filter:blur(12px);
    box-shadow:0 1px 0 rgba(0,212,255,.04);
  }
  .df-inp-lblrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .df-inp-lbl{font-size:13px;letter-spacing:.06em;color:rgba(120,160,220,.7);font-weight:500}
  .df-mode-row{display:flex;gap:6px;margin-bottom:8px}
  .df-mode-btn{
    font-family:-apple-system,system-ui,sans-serif;font-size:13px;letter-spacing:.02em;
    padding:6px 14px;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,.1);
    background:transparent;color:rgba(200,214,232,.65);transition:all .15s;font-weight:500;
  }
  .df-mode-btn.active{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.45);color:#00d4ff}
  .df-mode-btn:disabled{opacity:.4;cursor:not-allowed}
  .df-mode-btn.demo{margin-left:auto;border-color:rgba(255,170,0,.35);color:rgba(255,170,0,.65)}
  .df-mode-btn.demo.on{background:rgba(255,170,0,.12);border-color:rgba(255,170,0,.5);color:#ffaa00;animation:pulse 2s infinite}
  .df-inp-w{flex:1;min-width:0}
  .df-ctx-row{display:flex;gap:7px;margin-top:7px;align-items:center;flex-wrap:wrap}
  .df-ctx-gh{
    flex:1;min-width:160px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:8px;color:#d4daf5;font-family:'SF Mono','Cascadia Code',monospace;
    font-size:11px;padding:6px 10px;outline:none;transition:border-color .2s;
  }
  .df-ctx-gh::placeholder{color:rgba(200,214,232,.42)}
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
    width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
    border-radius:10px;color:#e8eeff;font-family:-apple-system,system-ui,sans-serif;
    font-size:13px;padding:11px 14px;outline:none;resize:vertical;
    min-height:46px;max-height:55vh;line-height:1.6;transition:border-color .2s;
  }
  .df-inp::-webkit-resizer{border-width:0 5px 5px 0;border-style:solid;border-color:transparent rgba(0,212,255,.35)}
  .df-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-inp::placeholder{color:rgba(200,214,232,.45)}
  .df-launch{
    background:linear-gradient(110deg,#0073b1,#0099ee,#00c4ff,#0099ee,#0073b1);
    background-size:300% auto;
    color:#fff;border:none;cursor:pointer;
    font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;
    font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    padding:0 24px;border-radius:10px;height:44px;white-space:nowrap;
    box-shadow:0 2px 20px rgba(0,153,238,.38),0 0 0 1px rgba(0,196,255,.18);
    animation:shimmer 3s linear infinite;
    transition:box-shadow .2s,transform .2s;
  }
  .df-launch:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 32px rgba(0,153,238,.55),0 0 0 1px rgba(0,196,255,.3)}
  .df-launch:disabled{background:rgba(0,212,255,.1);color:rgba(0,212,255,.3);cursor:not-allowed;box-shadow:none;animation:none}
  .df-stop{
    background:transparent;border:1px solid rgba(255,60,60,.45);color:#ff5555;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;letter-spacing:.04em;
    text-transform:uppercase;padding:0 16px;border-radius:10px;height:44px;transition:all .2s;white-space:nowrap;
  }
  .df-stop:hover{background:rgba(255,60,60,.1);border-color:#ff5555}
  .df-rerun-btn{
    display:flex;align-items:center;gap:4px;margin-top:5px;padding:4px 10px;
    font-family:-apple-system,system-ui,sans-serif;font-size:11px;letter-spacing:.02em;font-weight:500;
    background:transparent;border:1px solid rgba(255,255,255,.1);border-radius:7px;
    color:rgba(200,214,232,.65);cursor:pointer;transition:all .15s;width:100%;
  }
  .df-rerun-btn:hover{border-color:rgba(0,212,255,.35);color:#00d4ff;background:rgba(0,212,255,.06)}
  .df-dbg-btn{
    background:rgba(0,180,255,.08);border:1px solid rgba(0,180,255,.3);color:rgba(0,210,255,.85);
    cursor:pointer;font-family:-apple-system,system-ui,sans-serif;font-size:11px;font-weight:600;
    letter-spacing:.04em;text-transform:uppercase;padding:0 16px;border-radius:10px;height:44px;
    transition:all .2s;box-shadow:0 0 12px rgba(0,180,255,.1),inset 0 1px 0 rgba(255,255,255,.06);
  }
  .df-dbg-btn:hover{
    background:rgba(0,180,255,.15);border-color:rgba(0,210,255,.55);color:#00d4ff;
    box-shadow:0 0 20px rgba(0,180,255,.2),inset 0 1px 0 rgba(255,255,255,.08);
    transform:translateY(-1px);
  }
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
  .df-int-dot.off{background:rgba(200,214,232,.35)}
  .df-int-dot-lbl{font-size:9px;letter-spacing:.04em;color:rgba(200,214,232,.58)}
  .df-settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;justify-content:flex-end;animation:fadeUp .15s ease-out}
  .df-settings-drawer{
    width:480px;max-width:100vw;height:100vh;
    background:#00040e;border-left:1px solid rgba(255,255,255,.08);
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
    border:none;border-bottom:2px solid transparent;transition:all .2s;color:rgba(200,214,232,.6);
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
  .df-set-inp::placeholder{color:rgba(200,214,232,.42)}
  .df-set-preview{font-size:10px;color:rgba(200,214,232,.52);font-family:'SF Mono','Cascadia Code',monospace;margin-top:2px}
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
  .df-mc-price{font-size:10px;color:rgba(200,214,232,.55);margin-top:5px;font-family:'SF Mono','Cascadia Code',monospace}
  .df-mc-remove{margin-left:auto;background:none;border:none;color:rgba(255,100,100,.5);cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;line-height:1;transition:color .15s}
  .df-mc-remove:hover{color:rgba(255,80,80,.9)}
  .df-add-model{margin-top:12px;display:flex;flex-direction:column;gap:6px}
  .df-add-model-row{display:flex;gap:6px}
  .df-add-model-inp{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:8px 12px;font-size:12px;color:#d4daf5;outline:none;font-family:inherit;transition:border-color .15s}
  .df-add-model-inp:focus{border-color:rgba(0,212,255,.4)}
  .df-add-model-inp::placeholder{color:rgba(200,214,232,.42)}
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
  .df-int-status-val{font-size:10px;color:rgba(200,214,232,.58);font-family:'SF Mono','Cascadia Code',monospace}
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
  .df-main{display:flex;flex:1;min-height:0;overflow:hidden;position:relative}
  .df[data-theme='light'] .df-main::before{
    content:'';position:absolute;pointer-events:none;z-index:0;border-radius:50%;
    width:700px;height:700px;bottom:-100px;left:30%;
    background:radial-gradient(circle,rgba(249,168,212,.75) 0%,rgba(253,186,116,.45) 40%,transparent 65%);
    filter:blur(70px);
    animation:lBlob3 20s ease-in-out infinite;
  }
  .df[data-theme='light'] .df-main>*{position:relative;z-index:1}

  /* ── Pipeline sidebar ────────────────────────────────────────────────── */
  .df-pipe{
    width:298px;flex-shrink:0;overflow-y:auto;overflow-x:hidden;
    padding:10px 10px;border-right:1px solid rgba(255,255,255,.06);
    transition:width .3s cubic-bezier(.25,.8,.25,1);
    background:rgba(0,3,12,.65);backdrop-filter:blur(8px);
  }
  .df-pipe.collapsed{width:60px;padding:10px 8px}
  .df-pipe::-webkit-scrollbar{width:2px}
  .df-pipe::-webkit-scrollbar-thumb{background:rgba(0,212,255,.15)}
  .df-pipe-toggle{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;min-height:20px}
  .df-pipe-hdr-lbl{font-size:12px;letter-spacing:.14em;color:rgba(120,160,220,.55);text-transform:uppercase;font-weight:600}
  .df-pipe-btn{
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(200,214,232,.6);cursor:pointer;
    width:26px;height:26px;border-radius:6px;font-size:13px;line-height:1;
    display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;
  }
  .df-pipe-btn:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#d4daf5}
  .df-rail{
    display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 0;border-radius:8px;
    margin-bottom:3px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.015);transition:all .2s;
  }
  .df-rail:hover{background:rgba(255,255,255,.04)}
  .df-rail.active{border-color:var(--c);background:rgba(0,0,0,.35)}
  .df-rail.done{border-color:rgba(0,255,136,.18);background:rgba(0,255,136,.02)}
  .df-rail.gate{border-color:#ffaa00;background:rgba(255,170,0,.04)}
  .df-rail-num{font-size:12px;letter-spacing:.06em;opacity:.6;font-weight:600}
  .df-rail-dot{width:6px;height:6px;border-radius:50%}
  .df-card{
    border:1px solid rgba(255,255,255,.07);
    border-left:3px solid color-mix(in srgb,var(--c,#00d4ff) 50%,transparent);
    border-radius:12px;padding:10px 12px;margin-bottom:4px;
    background:color-mix(in srgb,var(--c,#00d4ff) 4%,rgba(0,3,12,.45));
    transition:all .3s;position:relative;overflow:hidden;
    animation:stageIn .35s ease-out both;
  }
  .df-card:hover{
    background:color-mix(in srgb,var(--c,#00d4ff) 8%,rgba(0,3,12,.5));
    border-left-color:color-mix(in srgb,var(--c,#00d4ff) 75%,transparent);
    border-color:rgba(255,255,255,.12);
  }
  .df-card.active{
    border-color:var(--c);
    background:linear-gradient(135deg,rgba(0,0,0,.2),rgba(0,212,255,.06));
    animation:glow 2.4s ease-in-out infinite;
    box-shadow:0 0 0 1px rgba(var(--c-rgb,0,212,255),.12),0 8px 32px rgba(0,0,0,.4);
  }
  .df-card.done  {border-color:rgba(0,255,136,.3);background:rgba(0,255,136,.04);box-shadow:0 4px 16px rgba(0,255,136,.06)}
  .df-card.gate  {border-color:#ffaa00;background:rgba(255,170,0,.05);animation:pulse 1.1s ease-in-out infinite;box-shadow:0 0 20px rgba(255,170,0,.12)}
  .df-card.active::before{
    content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,transparent,var(--c),var(--c),transparent);
    opacity:.9;
  }
  .df-card.gate::before{
    content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,transparent,#ffaa00,#ffaa00,transparent);
  }
  .df-card.active::after{
    content:'';position:absolute;inset:0;border-radius:12px;
    background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--c,#00d4ff) 12%,transparent),transparent 60%);
    pointer-events:none;
  }
  .df-crow{display:flex;align-items:center;gap:7px}
  .df-cnum{font-size:11px;letter-spacing:.06em;color:var(--c,rgba(200,214,232,.6));opacity:.7;font-weight:700}
  .df-cicon{font-size:15px;transition:color .3s}
  .df-cicon.spin{animation:spin 1s linear infinite}
  .df-clbl{flex:1}
  .df-cname{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:14px;font-weight:700;color:#fff;transition:color .3s}
  .df-csub{font-size:12px;letter-spacing:.06em;opacity:.65;font-weight:500}
  .df-cdot{width:7px;height:7px;border-radius:50%;transition:background .3s}
  .df-cdesc{font-size:10px;opacity:.65;margin-top:3px;line-height:1.4}
  .df-cprog{height:2px;background:rgba(255,255,255,.06);margin-top:5px;border-radius:1px;overflow:hidden}
  .df-cfill{height:100%;border-radius:1px;transition:width .3s}
  .df-crev{font-size:9px;letter-spacing:.04em;padding:2px 8px;border-radius:20px;margin-top:4px;display:inline-block;font-weight:600}
  .df-crev.approved{background:rgba(0,255,136,.1);color:#00ff88;border:1px solid rgba(0,255,136,.22)}
  .df-crev.changes {background:rgba(255,100,0,.1);color:#ff6400;border:1px solid rgba(255,100,0,.22)}
  .df-conn{display:flex;align-items:center;justify-content:center;height:7px}
  .df-cline{width:1px;height:100%;background:rgba(255,255,255,.08);position:relative;overflow:hidden}
  .df-cline.flow::after{content:'';position:absolute;top:0;left:0;width:100%;height:35%;
    background:var(--c,#00d4ff);animation:flowLine 1.2s ease-in-out infinite}

  /* ── Stage node (circular) ───────────────────────────────────────────── */
  .df-sn-row{display:flex;align-items:flex-start;gap:0;animation:stageIn .35s ease-out both}
  .df-sn-track{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:36px}
  .df-sn{
    width:28px;height:28px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    border:1.5px solid rgba(255,255,255,.2);
    background:rgba(255,255,255,.05);font-size:12px;
    transition:all .35s;flex-shrink:0;position:relative;
  }
  .df-sn.active{
    border-color:var(--c);background:rgba(0,212,255,.08);
    animation:nodeRing 1.8s ease-in-out infinite;
    box-shadow:0 0 16px var(--glow);
  }
  .df-sn.active .df-sn-ping{
    content:'';position:absolute;inset:-5px;border-radius:50%;
    border:1px solid var(--c,#00d4ff);animation:ping 1.8s ease-out infinite;
  }
  .df-sn.done{border-color:rgba(0,255,136,.5);background:rgba(0,255,136,.12);color:#00ff88}
  .df-sn.gate{border-color:#ffaa00;background:rgba(255,170,0,.08);animation:pulse 1.1s ease-in-out infinite}
  .df-sn-ping{position:absolute;inset:-5px;border-radius:50%;border:1px solid var(--c,#00d4ff);pointer-events:none}
  .df-sn-line{
    width:2px;flex:1;min-height:8px;
    background:linear-gradient(to bottom,rgba(255,255,255,.1),rgba(255,255,255,.04));
    position:relative;overflow:hidden;
  }
  .df-sn-line.flow::after{
    content:'';position:absolute;left:0;width:100%;height:40%;
    background:linear-gradient(to bottom,transparent,var(--c,#00d4ff),transparent);
    animation:dotTravel 1.4s ease-in-out infinite;
  }
  .df-sn-dot{
    width:4px;height:4px;border-radius:50%;
    background:var(--c,#00d4ff);position:absolute;left:50%;transform:translateX(-50%);
    animation:dotTravel 1.4s ease-in-out infinite;box-shadow:0 0 6px var(--c,#00d4ff);
  }
  .df-sn-content{flex:1;min-width:0;padding-bottom:4px}

  /* ── Center panel ────────────────────────────────────────────────────── */
  .df-center{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid rgba(255,255,255,.05)}

  /* Tabs */
  .df-tabs{
    display:flex;border-bottom:1px solid rgba(255,255,255,.06);
    background:rgba(0,3,12,.72);flex-shrink:0;padding:0 8px;
  }
  .df-tab{
    padding:12px 20px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
    border:none;border-bottom:2px solid transparent;background:transparent;transition:all .2s;
    color:rgba(200,214,232,.62);font-weight:500;font-family:-apple-system,system-ui,sans-serif;
  }
  .df-tab.active{color:#00d4ff;border-bottom-color:#00d4ff}
  .df-tab:hover:not(.active){color:rgba(200,214,232,.85)}

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
  .df-gate{
    border-radius:14px;border:1px solid rgba(255,170,0,.35);
    background:linear-gradient(135deg,rgba(255,170,0,.04),rgba(255,100,0,.03));
    padding:20px;animation:gateEnter .4s cubic-bezier(.2,.8,.3,1) both;
    position:relative;overflow:hidden;
    box-shadow:0 0 40px rgba(255,170,0,.08),0 8px 32px rgba(0,0,0,.3);
  }
  .df-gate::before{
    content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,transparent,#ffaa00,#ffcc44,#ffaa00,transparent);
    animation:shimmer 3s linear infinite;background-size:200% auto;
  }
  .df-gate-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .df-gate-icon{font-size:22px;filter:drop-shadow(0 0 8px rgba(255,170,0,.5))}
  .df-gate-title{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:16px;font-weight:800;color:#ffcc55;letter-spacing:.01em}
  .df-gate-verdict{font-size:12px;opacity:.75;margin-bottom:14px;line-height:1.7}
  .df-gate-pts{margin-bottom:18px}
  .df-gate-pt{font-size:12px;opacity:.72;line-height:2}
  .df-gate-pt::before{content:'→ ';color:#ffaa00}
  .df-gate-actions{display:flex;gap:10px;flex-wrap:wrap}
  .df-gate-ok{
    background:linear-gradient(135deg,#00cc77,#00ff99);color:#031a0e;border:none;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;font-weight:800;
    letter-spacing:.06em;text-transform:uppercase;padding:11px 24px;border-radius:9px;
    box-shadow:0 4px 20px rgba(0,255,136,.3);transition:all .2s;
  }
  .df-gate-ok:hover{background:linear-gradient(135deg,#00e088,#44ffaa);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,255,136,.45)}
  .df-gate-rej{
    background:transparent;color:#ff7070;border:1px solid rgba(255,100,100,.32);cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:12px;padding:11px 20px;border-radius:9px;transition:all .2s;
  }
  .df-gate-rej:hover{border-color:rgba(255,100,100,.65);background:rgba(255,100,100,.08);transform:translateY(-1px)}
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
    border-radius:14px;border:1.5px solid rgba(255,45,107,.55);
    background:linear-gradient(135deg,rgba(255,45,107,.06),rgba(255,0,50,.03));
    padding:22px;animation:prodPulse 2.4s ease-in-out infinite,gateEnter .5s cubic-bezier(.2,.8,.3,1) both;
    position:relative;overflow:hidden;
    box-shadow:0 0 48px rgba(255,45,107,.12),0 8px 40px rgba(0,0,0,.4);
  }
  .df-prod-gate::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,transparent,#ff2d6b,#ff6b9d,#ff2d6b,transparent);
    animation:shimmer 2.5s linear infinite;background-size:200% auto;}
  .df-pg-hdr{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .df-pg-icon{font-size:24px;filter:drop-shadow(0 0 10px rgba(255,45,107,.6))}
  .df-pg-title{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:17px;font-weight:800;color:#ff4d7f;letter-spacing:.01em}
  .df-pg-sub{font-size:10px;letter-spacing:.12em;color:rgba(255,45,107,.55);text-transform:uppercase;margin-bottom:14px;font-weight:600}
  .df-pg-checks{margin-bottom:14px}
  .df-pg-check{display:flex;align-items:center;gap:9px;padding:6px 0;
    border-bottom:1px solid rgba(255,45,107,.1);font-size:12px;opacity:.82}
  .df-pg-check-ic{color:#00ff88;font-size:11px;min-width:14px}
  .df-pg-clbl{font-size:10px;letter-spacing:.12em;color:rgba(255,45,107,.7);text-transform:uppercase;margin-bottom:7px;margin-top:14px;font-weight:600}
  .df-pg-cinp{
    width:100%;background:rgba(255,45,107,.05);border:1px solid rgba(255,45,107,.3);border-radius:9px;
    color:#ff8099;font-family:'SF Mono','Cascadia Code',monospace;font-size:13px;font-weight:700;
    padding:11px 14px;outline:none;letter-spacing:.2em;text-align:center;transition:border-color .2s;
  }
  .df-pg-cinp:focus{border-color:rgba(255,45,107,.6);box-shadow:0 0 0 3px rgba(255,45,107,.1)}
  .df-pg-cinp::placeholder{color:rgba(255,45,107,.22);letter-spacing:.04em;font-size:11px}
  .df-pg-btn{
    width:100%;margin-top:14px;padding:15px;border:none;border-radius:10px;cursor:pointer;
    font-family:-apple-system,system-ui,sans-serif;font-size:13px;font-weight:800;
    letter-spacing:.08em;text-transform:uppercase;transition:all .2s;
  }
  .df-pg-btn.locked  {background:rgba(255,45,107,.1);color:rgba(255,45,107,.32);cursor:not-allowed}
  .df-pg-btn.unlocked{background:linear-gradient(135deg,#cc1a4a,#ff2d6b);color:#fff}
  .df-pg-btn.unlocked:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(255,45,107,.45);background:linear-gradient(135deg,#e01f55,#ff4d80)}

  /* Done */
  .df-done{text-align:center;padding:52px 24px;animation:fadeUp .6s cubic-bezier(.2,.8,.3,1) both}
  .df-done-ic{font-size:56px;margin-bottom:18px;display:inline-block;animation:doneFloat 3s ease-in-out infinite;filter:drop-shadow(0 0 20px rgba(0,255,136,.4))}
  .df-done-t{
    font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;
    font-size:26px;font-weight:800;color:#fff;margin-bottom:6px;
    background:linear-gradient(135deg,#00ff88,#00d4ff,#7c9fff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
    background-size:200% auto;animation:shimmer 4s linear infinite;
  }
  .df-done-s{font-size:11px;color:rgba(0,212,255,.6);letter-spacing:.12em;margin-bottom:28px;font-weight:500;text-transform:uppercase}
  .df-metrics{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .df-metric{
    text-align:center;padding:14px 20px;
    border:1px solid rgba(0,212,255,.18);border-radius:12px;min-width:96px;
    background:linear-gradient(135deg,rgba(0,212,255,.04),rgba(0,212,255,.02));
    transition:transform .2s,box-shadow .2s;
  }
  .df-metric:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,212,255,.12)}
  .df-mv{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:24px;font-weight:800;color:#00d4ff}
  .df-ml{font-size:10px;letter-spacing:.08em;opacity:.6;margin-top:4px;font-weight:500;text-transform:uppercase}

  /* ── Observability ───────────────────────────────────────────────────── */
  .obs-wrap{padding:18px 22px;display:flex;flex-direction:column;gap:18px}
  .obs-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .obs-stat{
    background:linear-gradient(135deg,rgba(0,212,255,.04),rgba(0,212,255,.02));
    border:1px solid rgba(0,212,255,.12);border-radius:12px;
    padding:14px;text-align:center;animation:countUp .45s cubic-bezier(.2,.8,.3,1) both;
    transition:transform .2s,box-shadow .2s;
  }
  .obs-stat:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,212,255,.1)}
  .obs-stat-val{font-family:-apple-system,'SF Pro Display',system-ui,sans-serif;font-size:22px;font-weight:800;margin-bottom:4px;color:#00d4ff}
  .obs-stat-lbl{font-size:9px;letter-spacing:.12em;opacity:.45;text-transform:uppercase;font-weight:600}
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
  .obs-empty{text-align:center;padding:60px 20px;opacity:.52;font-size:12px;line-height:2}

  /* ── About Panel ─────────────────────────────────────────────────────── */
  .abt-wrap{padding:18px 22px;display:flex;flex-direction:column;gap:18px;overflow-y:auto;height:100%}
  .abt-hero{background:rgba(0,212,255,.03);border:1px solid rgba(0,212,255,.1);border-radius:12px;padding:18px 20px}
  .abt-title{font-size:17px;font-weight:800;letter-spacing:.02em;color:rgba(200,214,232,.95);margin-bottom:3px}
  .abt-tagline{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,212,255,.6);margin-bottom:10px;font-weight:600}
  .abt-desc{font-size:12px;line-height:1.75;opacity:.62;margin-bottom:14px}
  .abt-links{display:flex;gap:8px;flex-wrap:wrap}
  .abt-link{font-size:10px;padding:4px 11px;border-radius:6px;border:1px solid rgba(0,212,255,.25);color:rgba(0,212,255,.7);text-decoration:none;transition:all .2s;letter-spacing:.04em}
  .abt-link:hover{background:rgba(0,212,255,.08);color:#00d4ff;border-color:rgba(0,212,255,.45)}
  .abt-link-demo{border-color:rgba(191,95,255,.25);color:rgba(191,95,255,.7)}
  .abt-link-demo:hover{background:rgba(191,95,255,.08);color:#bf7fff;border-color:rgba(191,95,255,.45)}
  .abt-stages{display:flex;align-items:stretch;gap:3px;flex-wrap:wrap}
  .abt-stage{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:9px 10px;text-align:center;flex:1;min-width:72px;transition:border-color .2s}
  .abt-stage:hover{border-color:rgba(0,212,255,.2)}
  .abt-stage-icon{font-size:15px;margin-bottom:3px}
  .abt-stage-num{font-size:8px;letter-spacing:.1em;color:rgba(0,212,255,.5);text-transform:uppercase;font-weight:600;margin-bottom:2px}
  .abt-stage-lbl{font-size:10px;font-weight:700;color:rgba(200,214,232,.85);margin-bottom:2px}
  .abt-stage-sub{font-size:9px;opacity:.42;line-height:1.35}
  .abt-arrow{color:rgba(0,212,255,.3);font-size:13px;flex-shrink:0;align-self:center}
  .abt-gates{display:flex;gap:7px;margin-top:7px;flex-wrap:wrap}
  .abt-gate-chip{font-size:9px;padding:2px 9px;border-radius:20px;background:rgba(255,170,0,.06);border:1px solid rgba(255,170,0,.22);color:rgba(255,170,0,.65)}
  .abt-stack{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .abt-stack-group{background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.06);border-radius:9px;padding:10px 12px}
  .abt-stack-cat{font-size:8px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:7px}
  .abt-stack-items{display:flex;flex-direction:column;gap:4px}
  .abt-chip{font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid;display:inline-block;opacity:.78;line-height:1.5}

  /* ── Log panel ───────────────────────────────────────────────────────── */
  .df-log{
    width:260px;flex-shrink:0;display:flex;flex-direction:column;
    transition:width .3s cubic-bezier(.25,.8,.25,1);overflow:hidden;
    background:rgba(0,3,12,.7);border-left:1px solid rgba(0,180,255,.1);
    backdrop-filter:blur(10px);
  }
  .df-log.wide     {width:460px}
  .df-log.collapsed{width:48px}
  .df-log-hdr{
    padding:13px 14px;
    border-bottom:1px solid rgba(0,180,255,.1);
    font-size:10px;letter-spacing:.14em;color:rgba(0,200,255,.7);text-transform:uppercase;
    display:flex;align-items:center;gap:8px;font-weight:700;flex-shrink:0;
    background:rgba(0,20,50,.4);
    box-shadow:0 1px 0 rgba(0,180,255,.06);
  }
  .df-log.collapsed .df-log-hdr{flex-direction:column;gap:9px;padding:11px 0}
  .df-log-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .df-log-bd{flex:1;overflow-y:auto;padding:10px 12px}
  .df-log-bd::-webkit-scrollbar{width:2px}
  .df-log-bd::-webkit-scrollbar-thumb{background:rgba(0,180,255,.2)}
  .df-log-row{
    font-size:12px;line-height:1.7;padding:5px 0;
    border-bottom:1px solid rgba(0,180,255,.06);
    animation:slideLog .2s ease-out;
  }
  .df-log-row:hover{background:rgba(0,180,255,.04);border-radius:4px;padding-left:3px;padding-right:3px;margin:0 -3px}
  .df-log-ts {color:rgba(0,200,255,.6);margin-right:7px;font-family:'SF Mono','Cascadia Code',monospace;font-size:10px;letter-spacing:.02em}
  .df-log-msg.info   {color:rgba(200,220,255,.8)}
  .df-log-msg.success{color:#00ff99;text-shadow:0 0 8px rgba(0,255,153,.25)}
  .df-log-msg.warn   {color:#ffb340}
  .df-log-msg.agent  {color:#a8c8f8}
  .df-log-msg.gate   {color:#ffd060;text-shadow:0 0 8px rgba(255,190,0,.2)}
  .df-log-msg.handoff{color:#00d4ff;text-shadow:0 0 8px rgba(0,212,255,.2)}
  .df-log-msg.done   {color:#ff4d80;font-weight:700;text-shadow:0 0 10px rgba(255,45,107,.3)}
  /* ── Idle hero ── */
  @keyframes heroFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  @keyframes stagePop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pipeFlow{0%{background-position:-60px 0}100%{background-position:60px 0}}
  .df-idle-hero{
    display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
    height:100%;min-height:0;padding:36px 20px 20px;box-sizing:border-box;overflow-y:auto;
  }
  .df-idle-hero-title{
    font-size:36px;font-weight:900;letter-spacing:-.04em;color:#c8d4f0;
    margin-bottom:6px;text-align:center;animation:heroFloat 4s ease-in-out infinite;
  }
  .df-idle-hero-title em{
    font-style:normal;
    background:linear-gradient(90deg,#00d4ff,#bf5fff,#e066ff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df-idle-hero-sub{
    font-size:14px;color:rgba(150,180,240,.6);letter-spacing:.1em;
    margin-bottom:28px;text-transform:uppercase;text-align:center;
  }
  .df-idle-pipeline{
    display:flex;align-items:stretch;gap:0;margin-bottom:22px;
    flex-wrap:nowrap;justify-content:center;
  }
  .df-idle-scard{
    display:flex;flex-direction:column;align-items:center;gap:5px;
    padding:14px 11px;border-radius:10px;
    border:1px solid color-mix(in srgb,var(--c,rgba(255,255,255,.15)) 28%,rgba(255,255,255,.05));
    background:color-mix(in srgb,var(--c,rgba(255,255,255,.04)) 6%,rgba(0,3,12,.3));
    min-width:94px;animation:stagePop .4s ease-out both;
    transition:transform .25s,box-shadow .25s,border-color .25s,background .25s;cursor:default;
  }
  .df-idle-scard:hover{
    transform:translateY(-5px);background:rgba(255,255,255,.08);
    border-color:var(--c,rgba(255,255,255,.15));
    box-shadow:0 8px 28px rgba(0,0,0,.4),0 0 0 1px var(--c,rgba(255,255,255,.1));
  }
  .df-idle-scard-icon{font-size:28px;line-height:1}
  .df-idle-scard-num{font-size:11px;color:rgba(150,180,240,.4);letter-spacing:.06em;font-weight:700}
  .df-idle-scard-name{font-size:15px;font-weight:700;color:#c8d4f0;text-align:center;line-height:1.2}
  .df-idle-scard-sub{font-size:12px;color:rgba(150,180,240,.5);text-align:center;line-height:1.35;max-width:96px}
  .df-idle-arrow{
    width:22px;height:2px;flex-shrink:0;position:relative;align-self:center;
    background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.15),rgba(255,255,255,0));
    background-size:44px 2px;animation:pipeFlow 2s linear infinite;
  }
  .df-idle-arrow::after{
    content:'›';position:absolute;top:50%;right:-6px;transform:translateY(-50%);
    font-size:13px;color:rgba(255,255,255,.22);line-height:1;
  }
  .df-idle-hint{font-size:15px;color:rgba(120,180,255,.55);text-align:center;letter-spacing:.02em;margin-bottom:28px}
  .df-cursor{animation:blink 1s step-end infinite;color:#00d4ff}
  .df-idle-features{
    display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;max-width:720px;
  }
  .df-idle-feat{
    display:flex;align-items:flex-start;gap:10px;padding:13px 15px;border-radius:10px;
    background:color-mix(in srgb,var(--fi-color,rgba(255,255,255,.04)) 6%,rgba(0,3,12,.3));
    border:1px solid color-mix(in srgb,var(--fi-color,rgba(255,255,255,.07)) 22%,rgba(255,255,255,.05));
    border-left:3px solid color-mix(in srgb,var(--fi-color,#00d4ff) 55%,transparent);
    flex:1;min-width:190px;max-width:225px;
  }
  .df-idle-feat-icon{font-size:22px;flex-shrink:0;margin-top:1px}
  .df-idle-feat-title{font-size:14px;font-weight:700;color:#c8d4f0;margin-bottom:4px}
  .df-idle-feat-desc{font-size:12px;color:rgba(150,180,240,.5);line-height:1.55}
  .df-idle-stack{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:640px}
  .df-idle-chip{
    font-size:12px;font-weight:600;letter-spacing:.04em;padding:5px 13px;border-radius:20px;
    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
    color:rgba(150,180,240,.55);
  }
  .df-log-empty{opacity:.5;font-size:11px;text-align:center;margin-top:44px;color:rgba(0,200,255,.7);letter-spacing:.06em}

  /* ── Footer ── */
  .df-foot{
    flex-shrink:0;height:30px;display:flex;align-items:center;justify-content:center;
    gap:8px;position:relative;overflow:hidden;
    background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.04);
  }
  .df-foot::before{
    content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(90deg,transparent 0,transparent 23px,rgba(255,255,255,.022) 23px,rgba(255,255,255,.022) 24px);
  }
  .df-foot-brand{font-size:11px;font-weight:700;color:rgba(200,214,232,.35);letter-spacing:.01em;position:relative}
  .df-foot-brand em{
    font-style:normal;
    background:linear-gradient(90deg,#00d4ff,#bf5fff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df-foot-dots{display:flex;align-items:center;gap:4px;position:relative}
  .df-foot-dot{width:5px;height:5px;border-radius:50%;opacity:.5}
  .df-foot-sep{font-size:10px;color:rgba(200,214,232,.18);position:relative}
  .df-foot-tag{font-size:9px;color:rgba(200,214,232,.28);letter-spacing:.07em;text-transform:uppercase;position:relative}

  /* ── Fullscreen code viewer ──────────────────────────────────────────── */
  .df-fsv{position:fixed;inset:0;z-index:3000;background:rgba(4,5,14,.97);display:flex;flex-direction:column;animation:fadeUp .15s ease-out}
  .df-fsv-hdr{
    display:flex;align-items:center;gap:10px;padding:13px 20px;flex-shrink:0;
    border-bottom:1px solid rgba(191,95,255,.22);
    background:rgba(8,9,18,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  }
  .df-fsv-dot{width:8px;height:8px;border-radius:50%;background:#bf5fff;flex-shrink:0;box-shadow:0 0 6px rgba(191,95,255,.6)}
  .df-fsv-fname{font-family:'SF Mono','Cascadia Code',monospace;font-size:14px;font-weight:600;color:#e8eeff;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .df-fsv-task{font-size:10px;letter-spacing:.04em;color:rgba(191,95,255,.65);flex-shrink:0;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
  .df-fsv-copy{
    background:rgba(191,95,255,.1);border:1px solid rgba(191,95,255,.3);color:#bf5fff;
    cursor:pointer;font-size:11px;padding:5px 14px;border-radius:6px;font-weight:500;
    transition:all .15s;white-space:nowrap;font-family:-apple-system,system-ui,sans-serif;
  }
  .df-fsv-copy:hover{background:rgba(191,95,255,.2);border-color:#bf5fff}
  .df-fsv-copy.copied{color:#00ff88;border-color:rgba(0,255,136,.4);background:rgba(0,255,136,.08)}
  .df-fsv-close{
    background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(200,214,232,.6);
    cursor:pointer;font-size:18px;width:34px;height:34px;border-radius:8px;line-height:1;
    display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;
  }
  .df-fsv-close:hover{background:rgba(255,68,68,.1);border-color:rgba(255,68,68,.4);color:#ff5555}
  .df-fsv-body{flex:1;overflow:auto;padding:0}
  .df-fsv-body pre{margin:0;border-radius:0;border:none;max-height:none!important;height:100%;font-size:13px!important;padding:20px 24px!important}
  .df-fsv-exp{
    background:transparent;border:none;color:rgba(191,95,255,.55);cursor:pointer;
    font-size:13px;padding:2px 5px;border-radius:3px;line-height:1;transition:color .12s;flex-shrink:0;
  }
  .df-fsv-exp:hover{color:#bf5fff}

  /* Tooltip */
  .recharts-tooltip-wrapper .recharts-default-tooltip{
    background:#0d1128!important;border-color:rgba(0,212,255,.18)!important;
    font-family:-apple-system,system-ui,sans-serif!important;font-size:11px!important;color:#d4daf5!important;
    border-radius:8px!important;
  }

  /* ════════════════════════════════════════════════════════════════════════
     LIGHT THEME — animated aurora, glassmorphism, full colour coding
     Stage colours (from STAGES array, used via var(--c)):
       Requirements #00d4ff  Tasks #00ff88  Code Gen #bf5fff
       PR Review    #e066ff  QA    #2dd4bf  Deploy   #ff2d6b
  ══════════════════════════════════════════════════════════════════════════ */

  /* ── Light-mode blob animations (defined here, usable globally) ── */
  @keyframes lBgShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
  @keyframes lBlob1{
    0%,100%{transform:translate(0,0) scale(1);opacity:.82}
    20%{transform:translate(90px,-60px) scale(1.22);opacity:1}
    50%{transform:translate(20px,80px) scale(.86);opacity:.72}
    75%{transform:translate(-70px,25px) scale(1.1);opacity:.9}
  }
  @keyframes lBlob2{
    0%,100%{transform:translate(0,0) scale(1);opacity:.78}
    30%{transform:translate(-80px,60px) scale(1.18);opacity:.98}
    62%{transform:translate(60px,-70px) scale(.88);opacity:.68}
    82%{transform:translate(15px,35px) scale(1.08);opacity:.88}
  }
  @keyframes lBlob3{
    0%,100%{transform:translate(0,0) scale(1);opacity:.6}
    35%{transform:translate(60px,50px) scale(1.15);opacity:.82}
    70%{transform:translate(-50px,-40px) scale(.9);opacity:.55}
  }

  /* ── Base — animated aurora background ── */
  .df[data-theme='light']{
    background:linear-gradient(-45deg,#a8d4ff,#d0b0ff,#a2f0d0,#ffb0cc,#b8d8ff,#a8d4ff);
    background-size:500% 500%;
    animation:lBgShift 14s ease infinite;
    color:#0d1526;
  }
  .df[data-theme='light']::before{
    width:1100px;height:1100px;top:-320px;left:-260px;
    background:radial-gradient(circle,rgba(56,189,248,.9) 0%,rgba(103,232,249,.55) 38%,transparent 65%);
    filter:blur(72px);
    animation:lBlob1 16s ease-in-out infinite;
  }
  .df[data-theme='light']::after{
    width:950px;height:950px;bottom:-260px;right:-200px;
    background:radial-gradient(circle,rgba(196,181,253,.95) 0%,rgba(167,139,250,.6) 38%,transparent 65%);
    filter:blur(62px);
    animation:lBlob2 12s ease-in-out infinite;
  }

  /* ── Header — frosted glass ── */
  .df[data-theme='light'] .df-hdr{
    background:rgba(255,255,255,.82);
    backdrop-filter:blur(24px) saturate(180%);
    border-bottom:1px solid rgba(255,255,255,.7);
    box-shadow:0 1px 0 rgba(0,0,0,.07),0 4px 24px rgba(0,0,0,.08);
  }
  .df[data-theme='light'] .df-lname{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-lname span{
    background:linear-gradient(90deg,#0055c8,#7c3aed);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df[data-theme='light'] .df-ltag{color:#4e607f;font-weight:500}
  .df[data-theme='light'] .df-timer{color:#0d1526;font-weight:800;letter-spacing:.03em}
  .df[data-theme='light'] .df-badge.idle   {color:#4e607f;border-color:rgba(78,96,127,.3);background:rgba(255,255,255,.6)}
  .df[data-theme='light'] .df-badge.running{color:#15803d;border-color:rgba(22,163,74,.4);background:rgba(240,253,244,.8)}
  .df[data-theme='light'] .df-badge.gate   {color:#92400e;border-color:rgba(217,119,6,.4);background:rgba(255,251,235,.8)}
  .df[data-theme='light'] .df-badge.done   {color:#0055c8;border-color:rgba(0,85,200,.4);background:rgba(239,246,255,.8)}
  .df[data-theme='light'] .df-settings-btn{border-color:rgba(0,0,0,.15);color:#2c3a56;background:rgba(255,255,255,.7);backdrop-filter:blur(8px);font-weight:600}
  .df[data-theme='light'] .df-settings-btn:hover{background:rgba(255,255,255,.9);border-color:#0055c8;color:#0055c8}
  .df[data-theme='light'] .df-int-dot.off{background:#aab6d0}
  .df[data-theme='light'] .df-int-dot-lbl{color:#4e607f;font-weight:500}

  /* ── Input area — frosted glass ── */
  .df[data-theme='light'] .df-inp-area{
    background:rgba(255,255,255,.78);
    backdrop-filter:blur(20px) saturate(160%);
    border-bottom:1px solid rgba(255,255,255,.65);
    box-shadow:0 2px 12px rgba(0,0,0,.07);
  }
  .df[data-theme='light'] .df-inp-lbl{color:#0d1526;font-weight:700;font-size:13px;letter-spacing:.01em}
  .df[data-theme='light'] .df-mode-btn{border:1.5px solid rgba(0,0,0,.14);color:#2c3a56;background:rgba(255,255,255,.65);font-weight:600;backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-mode-btn:hover{border-color:#0055c8;color:#0055c8;background:rgba(239,246,255,.9)}
  .df[data-theme='light'] .df-mode-btn.active{background:linear-gradient(135deg,#0055c8,#7c3aed);border-color:transparent;color:#fff;font-weight:700;box-shadow:0 2px 14px rgba(0,85,200,.35)}
  .df[data-theme='light'] .df-inp{
    background:rgba(255,255,255,.9);border:1.5px solid rgba(0,0,0,.12);color:#0d1526;
    box-shadow:0 1px 4px rgba(0,0,0,.06);font-size:14px;
  }
  .df[data-theme='light'] .df-inp:focus{border-color:#0055c8;box-shadow:0 0 0 3px rgba(0,85,200,.14)}
  .df[data-theme='light'] .df-inp::placeholder{color:#8899b4}
  .df[data-theme='light'] .df-ctx-gh{background:rgba(255,255,255,.9);border:1.5px solid rgba(0,0,0,.12);color:#0d1526}
  .df[data-theme='light'] .df-ctx-gh::placeholder{color:#8899b4}
  .df[data-theme='light'] .df-ctx-gh:focus{border-color:#0055c8}
  .df[data-theme='light'] .df-ctx-attach{border:1.5px solid #0055c8;color:#0055c8;background:rgba(239,246,255,.85);font-weight:600}
  .df[data-theme='light'] .df-ctx-attach:hover{background:rgba(219,238,255,.95)}
  .df[data-theme='light'] .df-ctx-chip{background:rgba(219,238,255,.85);border-color:#93c5fd;color:#0055c8;font-weight:600}
  .df[data-theme='light'] .df-ctx-chip button{color:#8899b4}
  .df[data-theme='light'] .df-rerun-btn{border:1.5px solid rgba(0,0,0,.14);color:#2c3a56;background:rgba(255,255,255,.65);font-weight:600}
  .df[data-theme='light'] .df-rerun-btn:hover{border-color:#0055c8;color:#0055c8;background:rgba(219,238,255,.9)}
  .df[data-theme='light'] .df-launch{
    background:linear-gradient(135deg,#0055c8,#5b21b6);
    box-shadow:0 4px 22px rgba(0,85,200,.45),0 0 0 1px rgba(255,255,255,.2);
  }
  .df[data-theme='light'] .df-launch:hover:not(:disabled){
    background:linear-gradient(135deg,#0043aa,#4c1d95);
    box-shadow:0 8px 30px rgba(0,85,200,.6);
  }
  .df[data-theme='light'] .df-stop{border:1.5px solid rgba(159,18,57,.4);color:#9f1239;background:rgba(255,241,243,.85);font-weight:600}
  .df[data-theme='light'] .df-stop:hover{background:rgba(255,228,235,.95);border-color:#9f1239}

  /* ── Debug button & panel ── */
  .df[data-theme='light'] .df-dbg-btn{
    background:rgba(239,246,255,.85);border:1.5px solid rgba(0,85,200,.3);color:#0055c8;
    font-weight:700;box-shadow:0 2px 10px rgba(0,85,200,.15);backdrop-filter:blur(8px);
  }
  .df[data-theme='light'] .df-dbg-btn:hover{background:rgba(219,238,255,.95);box-shadow:0 4px 16px rgba(0,85,200,.25)}
  .df[data-theme='light'] .df-dbg-panel{background:rgba(255,255,255,.92);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.8);box-shadow:-12px -12px 48px rgba(0,0,0,.14)}
  .df[data-theme='light'] .df-dbg-title{color:#0055c8;font-weight:800}
  .df[data-theme='light'] .df-dbg-close{color:#8899b4}
  .df[data-theme='light'] .df-dbg-ctx{color:#4e607f;background:rgba(239,246,255,.7);border-radius:6px}
  .df[data-theme='light'] .df-dbg-inp{background:rgba(255,255,255,.9);border:1.5px solid rgba(0,0,0,.12);color:#0d1526}
  .df[data-theme='light'] .df-dbg-inp::placeholder{color:#8899b4}
  .df[data-theme='light'] .df-dbg-inp:focus{border-color:#0055c8}
  .df[data-theme='light'] .df-dbg-answer{color:#2c3a56;background:rgba(239,246,255,.7);border:1px solid rgba(0,85,200,.15)}

  /* ── Tabs — frosted ── */
  .df[data-theme='light'] .df-tabs{background:rgba(255,255,255,.75);backdrop-filter:blur(16px);border-bottom:1px solid rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-tab{color:#4e607f;font-weight:600}
  .df[data-theme='light'] .df-tab.active{color:#0055c8;border-bottom-color:#0055c8;font-weight:800}
  .df[data-theme='light'] .df-tab:hover:not(.active){color:#0d1526;background:rgba(0,85,200,.05)}

  /* ── Pipeline sidebar — deep frosted glass with colour coding ── */
  .df[data-theme='light'] .df-pipe{
    background:rgba(210,224,252,.6);
    backdrop-filter:blur(22px) saturate(160%);
    border-right:1px solid rgba(255,255,255,.6);
  }
  .df[data-theme='light'] .df-pipe::-webkit-scrollbar-thumb{background:rgba(170,182,208,.6)}
  .df[data-theme='light'] .df-pipe-hdr-lbl{color:#0d1526;font-weight:800;font-size:11px;letter-spacing:.08em}
  .df[data-theme='light'] .df-pipe-btn{background:rgba(255,255,255,.65);border:1px solid rgba(255,255,255,.8);color:#2c3a56;font-weight:600;backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-pipe-btn:hover{background:rgba(255,255,255,.9);color:#0055c8}
  .df[data-theme='light'] .df-rail{border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.5);backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-rail:hover{background:rgba(255,255,255,.75)}
  .df[data-theme='light'] .df-rail.active{border-color:var(--c);background:rgba(255,255,255,.9);box-shadow:0 0 0 1px var(--c),0 4px 14px rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-rail.done{border-color:rgba(22,163,74,.5);background:rgba(240,253,244,.8)}
  .df[data-theme='light'] .df-rail.gate{border-color:rgba(217,119,6,.5);background:rgba(255,251,235,.8)}

  /* ── Stage cards — glass with stage colour accent ── */
  .df[data-theme='light'] .df-sn-row{animation:none;opacity:1}
  .df[data-theme='light'] .df-card{
    background:rgba(255,255,255,.76);
    backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,.72);
    border-left:3px solid var(--c,#6366f1);
    background-image:linear-gradient(135deg,rgba(255,255,255,.9) 0%,color-mix(in srgb,var(--c,#6366f1) 6%,rgba(255,255,255,.65)) 100%);
    box-shadow:0 2px 14px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.04);
    animation:none;opacity:1;
  }
  .df[data-theme='light'] .df-card:hover{
    background-image:linear-gradient(135deg,rgba(255,255,255,.96) 0%,color-mix(in srgb,var(--c,#6366f1) 10%,rgba(255,255,255,.85)) 100%);
    border-left-color:var(--c);
    box-shadow:0 6px 22px rgba(0,0,0,.1),0 0 0 1px color-mix(in srgb,var(--c) 25%,transparent);
  }
  .df[data-theme='light'] .df-card.active{
    background-image:linear-gradient(135deg,rgba(255,255,255,.98) 0%,color-mix(in srgb,var(--c,#6366f1) 14%,rgba(255,255,255,.88)) 100%);
    border-left:4px solid var(--c);
    box-shadow:0 0 0 1.5px var(--c),0 8px 28px color-mix(in srgb,var(--c) 15%,rgba(0,0,0,.08));
    animation:none;
  }
  .df[data-theme='light'] .df-card.active::after{
    background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--c) 10%,transparent),transparent 60%);
  }
  .df[data-theme='light'] .df-card.done{
    background:rgba(240,253,244,.88);
    border-left:4px solid #16a34a;
    box-shadow:0 2px 12px rgba(22,163,74,.1);
  }
  .df[data-theme='light'] .df-card.gate{
    background:rgba(255,251,235,.88);
    border-left:4px solid #d97706;
    box-shadow:0 4px 18px rgba(217,119,6,.1);animation:none;
  }
  .df[data-theme='light'] .df-cnum{color:#8899b4!important;font-weight:700;opacity:1!important}
  .df[data-theme='light'] .df-cname{color:#0d1526!important;font-weight:800}
  .df[data-theme='light'] .df-csub{color:#4e607f!important;font-weight:600;opacity:1!important}
  .df[data-theme='light'] .df-cdesc{color:#4e607f!important;opacity:1!important}
  .df[data-theme='light'] .df-cprog{background:rgba(0,0,0,.08)!important}
  .df[data-theme='light'] .df-crev.approved{background:rgba(220,252,231,.8);color:#15803d;border-color:rgba(21,128,61,.3)}
  .df[data-theme='light'] .df-crev.changes {background:rgba(254,226,226,.8);color:#b91c1c;border-color:rgba(185,28,28,.25)}

  /* ── Stage node circles — colour coded per stage ── */
  .df[data-theme='light'] .df-sn{
    background:rgba(255,255,255,.85);
    backdrop-filter:blur(8px);
    border:2px solid var(--c,#6366f1);
    color:var(--c,#6366f1);
    box-shadow:0 2px 8px rgba(0,0,0,.1),0 0 0 3px rgba(255,255,255,.5);
  }
  .df[data-theme='light'] .df-sn.active{
    background:rgba(255,255,255,.95);
    border-color:var(--c);
    box-shadow:0 0 18px var(--glow,rgba(0,85,200,.4)),0 2px 8px rgba(0,0,0,.1);
    color:var(--c);
  }
  .df[data-theme='light'] .df-sn.done{
    background:rgba(220,252,231,.9);border-color:#16a34a;
    box-shadow:0 2px 10px rgba(22,163,74,.25);color:#15803d;
  }
  .df[data-theme='light'] .df-sn.gate{background:rgba(255,251,235,.9);border-color:#d97706;color:#92400e}
  .df[data-theme='light'] .df-sn-line{background:linear-gradient(to bottom,rgba(0,0,0,.12),rgba(0,0,0,.06))}
  .df[data-theme='light'] .df-sn-line.flow::after{background:linear-gradient(to bottom,transparent,#0055c8,transparent)}
  .df[data-theme='light'] .df-sn-dot{background:#0055c8;box-shadow:0 0 8px rgba(0,85,200,.7)}
  .df[data-theme='light'] .df-cline{background:rgba(0,0,0,.1)}
  .df[data-theme='light'] .df-cline.flow::after{background:#0055c8}
  .df[data-theme='light'] .df-conn{opacity:1}

  /* ── Center panel — frosted ── */
  .df[data-theme='light'] .df-center{border-right:1px solid rgba(255,255,255,.5)}
  .df[data-theme='light'] .df-detail{background:rgba(248,251,255,.7);backdrop-filter:blur(12px)}
  .df[data-theme='light'] .df-detail::-webkit-scrollbar-thumb{background:rgba(170,182,208,.5)}
  .df[data-theme='light'] .df-dtitle{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-dsub{
    background:linear-gradient(90deg,#0055c8,#7c3aed);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
    font-weight:800;
  }

  /* ── PRD ── */
  .df[data-theme='light'] .df-prd{background:rgba(239,246,255,.85);border:1px solid rgba(147,197,253,.5);backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-prd-h{color:#0055c8;font-weight:700}
  .df[data-theme='light'] .df-pl{color:#0055c8}
  .df[data-theme='light'] .df-pt{color:#2c3a56;opacity:1}
  .df[data-theme='light'] .df-pi{color:#2c3a56;opacity:1}
  .df[data-theme='light'] .df-pi::before{color:#0055c8}

  /* ── Tasks ── */
  .df[data-theme='light'] .df-task{background:rgba(240,253,244,.85);border:1px solid rgba(22,163,74,.25);backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-tid {color:#15803d;font-weight:700}
  .df[data-theme='light'] .df-tname{color:#0d1526;font-weight:700}
  .df[data-theme='light'] .df-tpts {color:#15803d;font-weight:700}

  /* ── Agents ── */
  .df[data-theme='light'] .df-agent{background:rgba(255,255,255,.78);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.7);box-shadow:0 1px 6px rgba(0,0,0,.06)}
  .df[data-theme='light'] .df-agent.running{border-color:var(--ac);background:rgba(239,246,255,.85)}
  .df[data-theme='light'] .df-agent.passed {border-color:rgba(22,163,74,.35);background:rgba(240,253,244,.85)}
  .df[data-theme='light'] .df-agname{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-agst{color:#4e607f;font-weight:500;opacity:1}
  .df[data-theme='light'] .df-agf{color:#2c3a56;opacity:1;line-height:1.7}

  /* ── QA ── */
  .df[data-theme='light'] .df-qa-row{background:rgba(250,245,255,.85);border:1px solid rgba(109,40,217,.18);backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-qa-type {color:#7c3aed;font-weight:700}
  .df[data-theme='light'] .df-qa-count{color:#2c3a56;font-weight:600}
  .df[data-theme='light'] .df-qa-badge{background:rgba(220,252,231,.85);color:#15803d;border-color:rgba(22,163,74,.3)}

  /* ── Deploy environments ── */
  .df[data-theme='light'] .df-env{background:rgba(255,241,243,.85);border:1px solid rgba(159,18,57,.18);backdrop-filter:blur(8px)}
  .df[data-theme='light'] .df-env.live{background:rgba(240,253,244,.85);border-color:rgba(22,163,74,.3)}
  .df[data-theme='light'] .df-env-name{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-env-bar{background:rgba(252,213,224,.7)}
  .df[data-theme='light'] .df-env.live .df-env-fill{background:#16a34a}
  .df[data-theme='light'] .df-env-st{color:#4e607f;font-weight:600}

  /* ── Gate panel ── */
  .df[data-theme='light'] .df-gate{
    background:rgba(255,251,235,.88);
    backdrop-filter:blur(16px);
    border:2px solid #d97706;
    box-shadow:0 8px 32px rgba(217,119,6,.14);animation:none;
  }
  .df[data-theme='light'] .df-gate::before{background:linear-gradient(90deg,transparent,#b45309,#d97706,#b45309,transparent)}
  .df[data-theme='light'] .df-gate-icon{filter:none}
  .df[data-theme='light'] .df-gate-title{color:#78350f;font-weight:800}
  .df[data-theme='light'] .df-gate-verdict{color:#44403c;font-weight:500;opacity:1}
  .df[data-theme='light'] .df-gate-pt{color:#44403c;opacity:1}
  .df[data-theme='light'] .df-gate-pt::before{color:#b45309}
  .df[data-theme='light'] .df-gate-ok{background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;font-weight:700;box-shadow:0 4px 18px rgba(22,163,74,.35)}
  .df[data-theme='light'] .df-gate-ok:hover{box-shadow:0 8px 30px rgba(22,163,74,.5)}
  .df[data-theme='light'] .df-gate-rej{color:#9f1239;border-color:rgba(159,18,57,.35);background:rgba(255,241,243,.85);font-weight:700}
  .df[data-theme='light'] .df-gate-rej:hover{background:rgba(255,228,235,.95)}
  .df[data-theme='light'] .df-fb-lbl{color:#9f1239;font-weight:700}
  .df[data-theme='light'] .df-fb-inp{background:rgba(255,255,255,.9);border:1.5px solid rgba(159,18,57,.3);color:#0d1526}
  .df[data-theme='light'] .df-fb-inp:focus{border-color:#9f1239}
  .df[data-theme='light'] .df-fb-sub{background:rgba(255,241,243,.85);color:#9f1239;border-color:rgba(159,18,57,.35);font-weight:700}
  .df[data-theme='light'] .df-fb-sub:hover{background:rgba(255,228,235,.95)}

  /* ── Prod gate ── */
  .df[data-theme='light'] .df-prod-gate{
    background:rgba(255,241,243,.9);backdrop-filter:blur(20px);
    border:2px solid rgba(159,18,57,.45);
    box-shadow:0 8px 40px rgba(159,18,57,.12);animation:none;
  }
  .df[data-theme='light'] .df-prod-gate::before{background:linear-gradient(90deg,transparent,#9f1239,#e11d48,#9f1239,transparent)}
  .df[data-theme='light'] .df-pg-title{color:#881337;font-weight:800}
  .df[data-theme='light'] .df-pg-sub{color:rgba(136,19,55,.7);font-weight:500}
  .df[data-theme='light'] .df-pg-check{color:#2c3a56;border-bottom-color:rgba(159,18,57,.1)}
  .df[data-theme='light'] .df-pg-cinp{background:rgba(255,255,255,.9);border:1.5px solid rgba(159,18,57,.35);color:#881337}
  .df[data-theme='light'] .df-pg-btn.unlocked{background:linear-gradient(135deg,#881337,#9f1239)}
  .df[data-theme='light'] .df-pg-btn.unlocked:hover{box-shadow:0 8px 24px rgba(136,19,55,.35)}

  /* ── Done state ── */
  .df[data-theme='light'] .df-done-ic{filter:drop-shadow(0 0 18px rgba(22,163,74,.45))}
  .df[data-theme='light'] .df-done-t{
    background:linear-gradient(135deg,#0055c8,#7c3aed,#15803d);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:none;
  }
  .df[data-theme='light'] .df-done-s{color:#4e607f;font-weight:500}
  .df[data-theme='light'] .df-metric{background:rgba(255,255,255,.8);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.8);box-shadow:0 2px 12px rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-metric:hover{box-shadow:0 6px 22px rgba(0,85,200,.14)}
  .df[data-theme='light'] .df-mv{color:#0055c8;font-weight:800}
  .df[data-theme='light'] .df-ml{color:#4e607f;font-weight:500}

  .df[data-theme='light'] .df-cursor{color:#0055c8}

  /* ── Observability — frosted stats ── */
  .df[data-theme='light'] .obs-wrap{background:rgba(248,251,255,.7);backdrop-filter:blur(12px)}
  .df[data-theme='light'] .obs-stat{background:rgba(255,255,255,.8);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.8);box-shadow:0 2px 10px rgba(0,0,0,.07)}
  .df[data-theme='light'] .obs-stat:hover{box-shadow:0 6px 20px rgba(0,85,200,.12)}
  .df[data-theme='light'] .obs-stat-val{color:#0055c8;font-weight:800}
  .df[data-theme='light'] .obs-stat-lbl{color:#4e607f;font-weight:600;opacity:1}
  .df[data-theme='light'] .obs-sh{
    background:linear-gradient(90deg,#0055c8,#7c3aed);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;
  }
  .df[data-theme='light'] .obs-sh::after{background:rgba(0,0,0,.1)}
  .df[data-theme='light'] .obs-table th{color:#2c3a56;border-bottom:2px solid rgba(0,0,0,.08);font-weight:800}
  .df[data-theme='light'] .obs-table td{border-bottom-color:rgba(0,0,0,.05);color:#2c3a56}
  .df[data-theme='light'] .obs-table tr:hover td{background:rgba(239,246,255,.6)}
  .df[data-theme='light'] .obs-chart-box{background:rgba(255,255,255,.8);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.8);box-shadow:0 2px 10px rgba(0,0,0,.06)}
  .df[data-theme='light'] .obs-chart-title{color:#2c3a56;font-weight:800}
  .df[data-theme='light'] .obs-legend-item{color:#4e607f;font-weight:500;opacity:1}
  .df[data-theme='light'] .obs-empty{color:#8899b4;opacity:1}
  .df[data-theme='light'] .obs-drift-banner{background:rgba(255,251,235,.85);border-color:#d97706}
  .df[data-theme='light'] .recharts-tooltip-wrapper .recharts-default-tooltip{background:rgba(255,255,255,.95)!important;border-color:rgba(0,0,0,.1)!important;color:#0d1526!important;box-shadow:0 8px 24px rgba(0,0,0,.14)!important;backdrop-filter:blur(12px)!important}

  /* ── Log panel — tinted frosted glass ── */
  .df[data-theme='light'] .df-log{background:rgba(220,232,255,.6);backdrop-filter:blur(18px) saturate(140%);border-left:1px solid rgba(255,255,255,.6)}
  .df[data-theme='light'] .df-log-hdr{
    background:rgba(255,255,255,.72);
    backdrop-filter:blur(16px);
    border-bottom:1px solid rgba(255,255,255,.65);
    color:#0055c8;font-weight:800;
  }
  .df[data-theme='light'] .df-log-dot{background:#0055c8;box-shadow:0 0 8px rgba(0,85,200,.5)}
  .df[data-theme='light'] .df-log-bd::-webkit-scrollbar-thumb{background:rgba(170,182,208,.5)}
  .df[data-theme='light'] .df-log-row{border-bottom-color:rgba(0,0,0,.06)}
  .df[data-theme='light'] .df-log-row:hover{background:rgba(255,255,255,.4)}
  .df[data-theme='light'] .df-log-ts{color:#6677a0;font-weight:600;font-size:10px}
  .df[data-theme='light'] .df-log-msg.info   {color:#1a2742;font-weight:500;font-size:12px}
  .df[data-theme='light'] .df-log-msg.agent  {color:#1e40af;font-weight:600}
  .df[data-theme='light'] .df-log-msg.success{color:#15803d;font-weight:600;text-shadow:none}
  .df[data-theme='light'] .df-log-msg.handoff{color:#0055c8;font-weight:600;text-shadow:none}
  .df[data-theme='light'] .df-log-msg.warn   {color:#92400e;font-weight:600;text-shadow:none}
  .df[data-theme='light'] .df-log-msg.gate   {color:#78350f;font-weight:700;text-shadow:none}
  .df[data-theme='light'] .df-log-msg.done   {color:#9f1239;font-weight:700;text-shadow:none}

  /* ── Settings drawer — frosted glass ── */
  .df[data-theme='light'] .df-settings-overlay{background:rgba(13,21,38,.3)}
  .df[data-theme='light'] .df-settings-drawer{background:rgba(248,251,255,.92);backdrop-filter:blur(24px);border-left:1px solid rgba(255,255,255,.7);box-shadow:-20px 0 60px rgba(0,0,0,.14)}
  .df[data-theme='light'] .df-set-hdr{background:rgba(255,255,255,.8);backdrop-filter:blur(16px);border-bottom:1px solid rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-set-title{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-set-close{color:#8899b4;font-size:22px;font-weight:700}
  .df[data-theme='light'] .df-set-close:hover{color:#9f1239;background:rgba(255,241,243,.8)}
  .df[data-theme='light'] .df-set-tabs{background:rgba(255,255,255,.75);backdrop-filter:blur(12px);border-bottom:1px solid rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-set-tab{color:#4e607f;font-weight:600}
  .df[data-theme='light'] .df-set-tab.active{color:#0055c8;border-bottom-color:#0055c8;font-weight:800}
  .df[data-theme='light'] .df-set-tab:hover{color:#0d1526}
  .df[data-theme='light'] .df-set-body{background:rgba(255,255,255,.7);backdrop-filter:blur(12px)}
  .df[data-theme='light'] .df-set-body::-webkit-scrollbar-thumb{background:rgba(170,182,208,.5)}
  .df[data-theme='light'] .df-set-sec-title{
    background:linear-gradient(90deg,#0055c8,#7c3aed);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;
  }
  .df[data-theme='light'] .df-set-lbl{color:#2c3a56;font-weight:700}
  .df[data-theme='light'] .df-set-inp{background:rgba(255,255,255,.9);border:1.5px solid rgba(0,0,0,.12);color:#0d1526}
  .df[data-theme='light'] .df-set-inp:focus{border-color:#0055c8;box-shadow:0 0 0 3px rgba(0,85,200,.12)}
  .df[data-theme='light'] .df-set-inp::placeholder{color:#8899b4}
  .df[data-theme='light'] .df-set-preview{color:#8899b4}
  .df[data-theme='light'] .df-set-test-btn{background:rgba(239,246,255,.85);border:1.5px solid rgba(0,85,200,.25);color:#0055c8;font-weight:700}
  .df[data-theme='light'] .df-set-test-btn:hover{background:rgba(219,238,255,.95)}
  .df[data-theme='light'] .df-set-result.ok {background:rgba(220,252,231,.85);border-color:rgba(22,163,74,.35);color:#15803d;font-weight:700}
  .df[data-theme='light'] .df-set-result.err{background:rgba(254,226,226,.85);border-color:rgba(185,28,28,.35);color:#b91c1c;font-weight:700}
  .df[data-theme='light'] .df-model-card{background:rgba(255,255,255,.78);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.8);box-shadow:0 1px 6px rgba(0,0,0,.06)}
  .df[data-theme='light'] .df-model-card:hover{background:rgba(255,255,255,.94);box-shadow:0 4px 16px rgba(0,85,200,.1)}
  .df[data-theme='light'] .df-model-card.selected{background:rgba(239,246,255,.92);border-color:#0055c8;box-shadow:0 0 0 2px rgba(0,85,200,.2)}
  .df[data-theme='light'] .df-model-card.selected::before{background:linear-gradient(to right,transparent,#0055c8,transparent)}
  .df[data-theme='light'] .df-mc-name{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-mc-desc{color:#4e607f;font-weight:500}
  .df[data-theme='light'] .df-mc-price{color:#8899b4}
  .df[data-theme='light'] .df-mc-remove{color:rgba(159,18,57,.55)}
  .df[data-theme='light'] .df-mc-remove:hover{color:#9f1239}
  .df[data-theme='light'] .df-add-model-inp{background:rgba(255,255,255,.9);border:1.5px solid rgba(0,0,0,.12);color:#0d1526}
  .df[data-theme='light'] .df-add-model-inp::placeholder{color:#8899b4}
  .df[data-theme='light'] .df-add-model-btn{background:rgba(239,246,255,.85);border:1.5px solid rgba(0,85,200,.25);color:#0055c8;font-weight:700}
  .df[data-theme='light'] .df-add-model-btn:hover{background:rgba(219,238,255,.95)}
  .df[data-theme='light'] .df-int-status-row{background:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.75)}
  .df[data-theme='light'] .df-int-status-dot.on{box-shadow:0 0 6px rgba(22,163,74,.55)}
  .df[data-theme='light'] .df-int-status-dot.off{background:#aab6d0}
  .df[data-theme='light'] .df-int-status-name{color:#2c3a56;font-weight:700}
  .df[data-theme='light'] .df-int-status-val{color:#4e607f;font-weight:500}
  .df[data-theme='light'] .df-set-footer{background:rgba(255,255,255,.75);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.07)}
  .df[data-theme='light'] .df-set-save{background:linear-gradient(135deg,#0055c8,#5b21b6);box-shadow:0 4px 16px rgba(0,85,200,.35)}
  .df[data-theme='light'] .df-set-cancel{background:rgba(255,255,255,.8);border:1px solid rgba(0,0,0,.12);color:#2c3a56;font-weight:600}
  .df[data-theme='light'] .df-set-cancel:hover{border-color:#0055c8;color:#0055c8;background:rgba(239,246,255,.9)}

  /* ── About panel — frosted ── */
  .df[data-theme='light'] .abt-wrap{color:#0d1526;background:rgba(248,251,255,.7);backdrop-filter:blur(12px)}
  .df[data-theme='light'] .abt-hero{background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.8);box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .df[data-theme='light'] .abt-title{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .abt-tagline{background:linear-gradient(90deg,#0055c8,#7c3aed);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800}
  .df[data-theme='light'] .abt-desc{color:#2c3a56;opacity:1;line-height:1.8}
  .df[data-theme='light'] .abt-link{color:#0055c8;border-color:rgba(0,85,200,.3);background:rgba(239,246,255,.8);font-weight:600}
  .df[data-theme='light'] .abt-link:hover{background:rgba(219,238,255,.95)}
  .df[data-theme='light'] .abt-stage{background:rgba(255,255,255,.8);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.8);box-shadow:0 2px 8px rgba(0,0,0,.07)}
  .df[data-theme='light'] .abt-stage:hover{box-shadow:0 6px 18px rgba(0,85,200,.1)}
  .df[data-theme='light'] .abt-stage-num{color:#0369a1;font-weight:700}
  .df[data-theme='light'] .abt-stage-lbl{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .abt-stage-sub{color:#4e607f;font-weight:500;opacity:1}
  .df[data-theme='light'] .abt-arrow{color:rgba(0,0,0,.2)}
  .df[data-theme='light'] .abt-gate-chip{background:rgba(255,251,235,.85);border-color:#d97706;color:#78350f;font-weight:700}
  .df[data-theme='light'] .abt-stack-group{background:rgba(255,255,255,.78);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.8)}
  .df[data-theme='light'] .abt-chip{opacity:1;font-weight:600;font-size:11px}

  /* ── Idle hero — light mode ── */
  .df[data-theme='light'] .df-idle-hero-title{color:#0d1526}
  .df[data-theme='light'] .df-idle-hero-title em{
    background:linear-gradient(90deg,#0055c8,#7c3aed,#e066ff);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df[data-theme='light'] .df-idle-hero-sub{color:rgba(78,96,127,.72);font-size:13px}
  .df[data-theme='light'] .df-idle-scard{
    background:rgba(255,255,255,.82);backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,.9);box-shadow:0 2px 12px rgba(0,0,0,.07);
    animation:none;opacity:1;
  }
  .df[data-theme='light'] .df-idle-scard:hover{
    background:rgba(255,255,255,.97);
    box-shadow:0 10px 28px rgba(0,0,0,.1),0 0 0 2px var(--c);
    border-color:var(--c);
  }
  .df[data-theme='light'] .df-idle-scard-num{color:rgba(78,96,127,.5);font-size:11px}
  .df[data-theme='light'] .df-idle-scard-name{color:#0d1526;font-weight:800;font-size:15px}
  .df[data-theme='light'] .df-idle-scard-sub{color:rgba(78,96,127,.65);font-size:12px}
  .df[data-theme='light'] .df-idle-arrow{background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.12),rgba(0,0,0,0));animation:none}
  .df[data-theme='light'] .df-idle-arrow::after{color:rgba(0,0,0,.2)}
  .df[data-theme='light'] .df-idle-hint{color:#2c3a56;font-size:15px;font-weight:500}
  .df[data-theme='light'] .df-cursor{color:#0055c8}
  .df[data-theme='light'] .df-idle-feat{background:rgba(255,255,255,.78);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(0,0,0,.06)}
  .df[data-theme='light'] .df-idle-feat-title{color:#0d1526;font-weight:800;font-size:14px}
  .df[data-theme='light'] .df-idle-feat-desc{color:rgba(78,96,127,.72);font-size:12px}
  .df[data-theme='light'] .df-idle-chip{background:rgba(255,255,255,.7);border-color:rgba(0,0,0,.1);color:#4e607f;font-size:12px}
  .df[data-theme='light'] .df-log-empty{color:#4e607f;opacity:.7}

  /* ── Footer — light mode ── */
  .df[data-theme='light'] .df-foot{
    background:rgba(255,255,255,.75);backdrop-filter:blur(16px) saturate(150%);
    border-top:1px solid rgba(255,255,255,.65);box-shadow:0 -1px 0 rgba(0,0,0,.04);
  }
  .df[data-theme='light'] .df-foot::before{
    background:repeating-linear-gradient(90deg,transparent 0,transparent 23px,rgba(0,0,0,.025) 23px,rgba(0,0,0,.025) 24px);
  }
  .df[data-theme='light'] .df-foot-brand{color:rgba(13,21,38,.5)}
  .df[data-theme='light'] .df-foot-brand em{
    background:linear-gradient(90deg,#0055c8,#7c3aed);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  }
  .df[data-theme='light'] .df-foot-sep{color:rgba(13,21,38,.2)}
  .df[data-theme='light'] .df-foot-tag{color:rgba(13,21,38,.38)}
  .df[data-theme='light'] .df-foot-dot{opacity:.75}

  /* ── Fullscreen viewer ── */
  .df[data-theme='light'] .df-fsv{background:rgba(248,251,255,.96);backdrop-filter:blur(20px)}
  .df[data-theme='light'] .df-fsv-hdr{background:rgba(255,255,255,.82);backdrop-filter:blur(16px);border-bottom:1px solid rgba(0,0,0,.08)}
  .df[data-theme='light'] .df-fsv-fname{color:#0d1526;font-weight:800}
  .df[data-theme='light'] .df-fsv-task{color:#7c3aed;font-weight:700}
  .df[data-theme='light'] .df-fsv-copy{background:rgba(245,240,255,.85);border:1px solid rgba(124,58,237,.3);color:#7c3aed;font-weight:700}
  .df[data-theme='light'] .df-fsv-close{border:1px solid rgba(0,0,0,.12);color:#4e607f;background:rgba(255,255,255,.8)}

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
              <XAxis dataKey="name" tick={{fill:tc("rgba(200,214,232,.58)","rgba(20,30,80,.6)"),fontSize:10}} />
              <YAxis tick={{fill:tc("rgba(200,214,232,.58)","rgba(20,30,80,.6)"),fontSize:10}} unit="ms" />
              <Tooltip content={<ChartTip/>} />
              <ReferenceLine y={avgLatency} stroke="rgba(255,149,0,.4)" strokeDasharray="3 3" label={{value:"avg",fill:"rgba(255,149,0,.7)",fontSize:10}} />
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
              <XAxis dataKey="name" tick={{fill:tc("rgba(200,214,232,.58)","rgba(20,30,80,.6)"),fontSize:10}} />
              <YAxis tick={{fill:tc("rgba(200,214,232,.58)","rgba(20,30,80,.6)"),fontSize:10}} />
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
                    <div style={{fontSize:10,color:STAGE_COLORS[c.stage],opacity:.85}}>{c.stage}</div>
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
                    {isSlow && <span style={{fontSize:10,color:"#ff9500",marginLeft:4}}>↑</span>}
                  </td>
                  <td style={{color:"#bf5fff"}}>${c.cost.toFixed(4)}</td>
                  <td><span style={{fontSize:10,color:"#00ff88",background:"rgba(0,255,136,.1)",padding:"2px 6px",borderRadius:2,border:"1px solid rgba(0,255,136,.25)"}}>OK</span></td>
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
              <div style={{fontSize:10,color:tc("rgba(200,214,232,.58)","rgba(20,30,80,.55)"),letterSpacing:1}}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── About Panel ────────────────────────────────────────────────────────────
function AboutPanel({ theme }) {
  const STAGES = [
    { num:1, icon:"📋", label:"Requirements",      sub:"PRD generation" },
    { num:2, icon:"🗂",  label:"Task Orchestration", sub:"Kahn's algorithm" },
    { num:3, icon:"🔍", label:"PR Review",          sub:"4× parallel agents" },
    { num:4, icon:"💻", label:"Code Generation",    sub:"Full codebase to disk" },
    { num:5, icon:"🧪", label:"QA",                 sub:"Test runner" },
    { num:6, icon:"🚀", label:"Deploy",             sub:"GitHub + Slack" },
  ];
  const STACK = [
    { cat:"AI / LLM",      color:"#bf7fff", lc:"#6d28d9", items:["Claude Sonnet 5", "Anthropic API"] },
    { cat:"Orchestration", color:"#00d4ff", lc:"#0369a1", items:["LangGraph 1.x", "MemorySaver checkpointing"] },
    { cat:"Backend",       color:"#00ff88", lc:"#065f46", items:["FastAPI", "Uvicorn", "Pydantic v2"] },
    { cat:"Frontend",      color:"#ffaa00", lc:"#92400e", items:["React 18", "Recharts", "Vite"] },
    { cat:"Integrations",  color:"#ff6b9d", lc:"#9d174d", items:["Slack SDK", "Linear GraphQL", "PyGithub"] },
    { cat:"Algorithm",     color:"#ff9500", lc:"#7c2d12", items:["Kahn's topological sort", "DP critical path"] },
  ];
  return (
    <div className="abt-wrap">
      <div className="abt-hero">
        <div className="abt-title">DevForge AI</div>
        <div className="abt-tagline">Autonomous end-to-end SDLC intelligence engine</div>
        <div className="abt-desc">
          Drop a feature request — AI agents autonomously handle requirements analysis, task planning,
          code review, code generation, QA testing, and GitHub deployment.
          Human review gates at each critical milestone keep you in control.
        </div>
        <div className="abt-links">
          <a className="abt-link" href="https://github.com/sushilk001/devforge-ai" target="_blank" rel="noreferrer">⬡ GitHub</a>
          <a className="abt-link abt-link-demo" href="https://tinyurl.com/DevForgeAI-demoVideo" target="_blank" rel="noreferrer">▶ Demo Video</a>
        </div>
      </div>

      <div>
        <div className="obs-sh">6-Stage Pipeline</div>
        <div className="abt-stages">
          {STAGES.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className="abt-stage">
                <div className="abt-stage-icon">{s.icon}</div>
                <div className="abt-stage-num">Stage {s.num}</div>
                <div className="abt-stage-lbl">{s.label}</div>
                <div className="abt-stage-sub">{s.sub}</div>
              </div>
              {i < STAGES.length - 1 && <div className="abt-arrow">›</div>}
            </React.Fragment>
          ))}
        </div>
        <div className="abt-gates">
          <span className="abt-gate-chip">⏸ Human gate after Stage 1 — approve or request changes</span>
          <span className="abt-gate-chip">⏸ Human gate after Stage 2 — approve or request changes</span>
        </div>
      </div>

      <div>
        <div className="obs-sh">Tech Stack</div>
        <div className="abt-stack">
          {STACK.map(g => {
            const sc = theme === "light" ? g.lc : g.color;
            return (
              <div key={g.cat} className="abt-stack-group">
                <div className="abt-stack-cat" style={{color:sc}}>{g.cat}</div>
                <div className="abt-stack-items">
                  {g.items.map(item => (
                    <span key={item} className="abt-chip" style={{borderColor:sc+"44",color:sc}}>{item}</span>
                  ))}
                </div>
              </div>
            );
          })}
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
  const [complianceTid, setComplianceTid] = useState(null);
  const [realCompliance, setRealCompliance] = useState(null);
  const [realDeploy, setRealDeploy]  = useState(null);
  const [expandedFile, setExpandedFile]   = useState(null);
  const [fullscreenFile, setFullscreenFile] = useState(null); // {filename, content, taskTitle, copied}
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
  useEffect(() => {
    const onKey = e => { if(e.key==="Escape" && fullscreenFile) setFullscreenFile(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreenFile]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const tc = (dark, light) => theme === "dark" ? dark : light;
  const { elapsed, display, reset } = useTimer(appState === "running");

  const toRef       = useRef([]);
  const logRef      = useRef(null);
  const resumeFn    = useRef(null);
  const inputRef    = useRef(null);
  const fileInputRef = useRef(null);
  const demoModeRef = useRef(false); // gates the observability poller during Demo Mode
  const s4TidRef    = useRef(null);  // always holds the latest stage4ThreadId for pipeline closures

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
      .then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d=>{ setSettingsData(d); setSettingsSaving(false); closeSettings(); })
      .catch(e=>{ setSettingsSaving(false); setSettingsTestResult(p=>({...p,_save:{ok:false,error:"Save failed: "+e.message}})); });
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
    const stageOrder = ["requirements","tasks","code_gen","pr_review","qa","compliance","deploy"];
    const idx = stageOrder.indexOf(fromStageId);
    if (idx < 0) return;

    // Clear done + data for stages from idx onwards
    setDone(prev => { const n=new Set(prev); stageOrder.slice(idx).forEach(s=>n.delete(s)); return n; });
    if (idx <= stageOrder.indexOf("code_gen"))   { setRealCodeGen(null);    setS4Tid(null);         setApiReady(p=>({...p,code_gen:false})); }
    if (idx <= stageOrder.indexOf("pr_review"))  { setRealReview(null);     setS3Tid(null);         setApiReady(p=>({...p,pr_review:false})); }
    if (idx <= stageOrder.indexOf("qa"))         { setRealQA(null);         setQaTid(null);         setApiReady(p=>({...p,qa:false})); }
    if (idx <= stageOrder.indexOf("compliance")) { setRealCompliance(null); setComplianceTid(null); setApiReady(p=>({...p,compliance:false})); }
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
      completed_stages: [...doneStages],
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

  const pollCompliance = (cTid) => {
    const deadline = Date.now() + 240_000;
    const FALLBACK = (verdict) => ({ findings:[], score:0, criticals:0, warnings_count:0, verdict, debt_history:[] });
    const poll = () => {
      if (Date.now() > deadline) {
        addLog("⚠ Compliance check timed out — proceeding with advisory","warn");
        setRealCompliance(FALLBACK("TIMED OUT — no results within time limit"));
        setApiReady(p=>({...p, compliance:true}));
        return;
      }
      fetch(`/compliance/status/${cTid}`).then(r=>r.json()).then(d=>{
        if (d.status==="complete") {
          fetch(`/compliance/report/${cTid}`).then(r=>r.json()).then(rpt=>{
            setRealCompliance(rpt);
            setApiReady(p=>({...p, compliance:true}));
            const c = rpt.criticals||0, w = rpt.warnings_count||0;
            if (c===0 && w===0) addLog("✓ Compliance audit passed — no issues found","success");
            else if (c===0)     addLog(`⚠ Compliance advisory: ${w} warning(s), no blockers`,"warn");
            else                addLog(`⚠ Compliance: ${c} critical issue(s), ${w} warning(s) — review required`,"warn");
          }).catch(()=>{
            setRealCompliance(FALLBACK("ADVISORY — report fetch failed"));
            setApiReady(p=>({...p,compliance:true}));
          });
        } else if (d.status==="error") {
          addLog(`⚠ Compliance check error: ${d.error||"unknown"}`,"warn");
          setRealCompliance(FALLBACK(`ERROR — ${d.error||"compliance check failed"}`));
          setApiReady(p=>({...p, compliance:true}));
        } else {
          setTimeout(poll, 4000);
        }
      }).catch(()=>setTimeout(poll,5000));
    };
    setTimeout(poll, 5000);
  };

  const runCompliance = (onComplete) => {
    const s4Tid = s4TidRef.current;
    runStage("compliance", onComplete);
    const FALLBACK = (verdict) => ({ findings:[], score:0, criticals:0, warnings_count:0, verdict, debt_history:[] });
    fetch(`/compliance/start/${s4Tid}`, {method:"POST"})
      .then(r=>r.json())
      .then(d=>{
        if (d.thread_id) {
          setComplianceTid(d.thread_id);
          pollCompliance(d.thread_id);
        } else {
          addLog("⚠ Compliance start failed — skipping","warn");
          setRealCompliance(FALLBACK("SKIPPED — compliance start failed"));
          setApiReady(p=>({...p,compliance:true}));
        }
      })
      .catch(()=>{
        addLog("⚠ Compliance API unreachable — skipping","warn");
        setRealCompliance(FALLBACK("UNREACHABLE — compliance API unavailable"));
        setApiReady(p=>({...p,compliance:true}));
      });
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
    setS1Tid(null); setS2Tid(null); setS3Tid(null); setS4Tid(null); setApiReady({}); setRealPrd(null); setRealTasks([]); setRealDepGraph(null); setRealReview(null); setRealCodeGen(null); setRealQA(null); setQaTid(null); setComplianceTid(null); setRealCompliance(null); setRealDeploy(null); setExpandedFile(null);
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
    const s6b = () => runCompliance(goProdGate);
    const s6 = () => runStage("qa",          s6b);
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
      compliance:   () => setRealCompliance(D.compliance),
    };

    const s7 = () => { addLog("⟡ PRODUCTION DEPLOY INITIATED","handoff"); pushCalls("deploy"); runDeploy(); T(() => setRealDeploy(D.deploy), STAGE_DUR.deploy - 600); };
    function goProdGate(){ setAppState("prod_gate"); setDetail("prod_gate"); addLog("⚠ PRODUCTION GATE — mandatory approval required","gate"); resumeFn.current = s7; }
    const demoStage = (id, onComplete) => {
      pushCalls(id);
      runStage(id, onComplete);
      // data lands ~0.6s before the gate, after the running animation has played
      T(() => { if (load[id]) load[id](); }, Math.max(800, (STAGE_DUR[id]||5000) - 600));
    };
    const s6b = () => demoStage("compliance",  goProdGate);
    const s6 = () => demoStage("qa",           s6b);
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
  useEffect(() => { s4TidRef.current = stage4ThreadId; }, [stage4ThreadId]);

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

    // Deploy from a named output directory on disk (survives server restart)
    const doFireFromDir = (dirName, attempt=0) => {
      if(attempt >= 4) { addLog("⚠ Deploy failed after 4 attempts — check backend logs","warn"); return; }
      fetch("/stage6/deploy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ output_dir_name: dirName })
      }).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d=>{
          if(d.deploy_thread_id) {
            addLog(`⟡ Deploy job started from disk (${dirName})...`,"info");
            pollDeploy(d.deploy_thread_id);
          } else {
            addLog(`⚠ Deploy start failed: ${JSON.stringify(d)}`,"warn");
          }
        }).catch(e=>{
          const delay = (attempt+1)*3000;
          addLog(`⚠ Deploy error: ${e.message} — retry ${attempt+1}/4 in ${delay/1000}s...`,"warn");
          setTimeout(()=>doFireFromDir(dirName, attempt+1), delay);
        });
    };

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
      // Recover thread IDs from sessions endpoints; fall back to disk output dirs
      addLog("⟡ Recovering session IDs from backend...","info");
      Promise.all([
        fetch("/stage4/sessions").then(r=>r.json()),
        fetch("/stage2/sessions").then(r=>r.json()),
      ]).then(([s4sessions, s2sessions]) => {
        const s4entry = Object.entries(s4sessions).sort((a,b)=>b[1].file_count-a[1].file_count)[0];
        const s2entry = Object.entries(s2sessions).sort((a,b)=>b[1].task_count-a[1].task_count)[0];
        if(s4entry && s2entry) {
          const s4tid = s4entry[0], s2tid = s2entry[0];
          addLog(`⟡ Recovered: stage4=${s4tid.slice(0,8)}... stage2=${s2tid.slice(0,8)}...`,"info");
          doFire(s4tid, s2tid, stage3ThreadId||null, qaThreadId||null);
        } else {
          // Sessions lost (server restart) — deploy directly from the most recent output dir on disk
          addLog("⟡ Sessions cleared (server restart) — scanning output dirs on disk...","info");
          fetch("/stage6/output-dirs").then(r=>r.json()).then(dirs=>{
            if(!dirs || !dirs.length) {
              addLog("⚠ No output directories found — re-run the full pipeline first","warn");
              return;
            }
            const dirName = dirs[0]; // newest first
            addLog(`⟡ Deploying from disk: output/${dirName}`,"info");
            doFireFromDir(dirName);
          }).catch(e=>addLog("⚠ Output dir scan failed: "+e.message,"warn"));
        }
      }).catch(e=>addLog("⚠ Session recovery failed: "+e.message,"warn"));
    }

    setGateStage(null); const fn=resumeFn.current; resumeFn.current=null; T(fn,400);
  };

  // ── Detail renderer ────────────────────────────────────────────────────
  const renderDetail = () => {
    if(!detail) return (
      <div className="df-idle-hero">
        <div className="df-idle-hero-title"><em>DevForge AI</em></div>
        <div className="df-idle-hero-sub">6 autonomous agents · full SDLC · human review gates</div>
        <div className="df-idle-pipeline">
          {STAGES.map((s,i)=>(
            <React.Fragment key={s.id}>
              <div className="df-idle-scard" style={{"--c":s.color,animationDelay:`${i*80}ms`}}>
                <span className="df-idle-scard-icon" style={{color:s.color}}>{s.icon}</span>
                <span className="df-idle-scard-num">{s.num}</span>
                <span className="df-idle-scard-name">{s.label}</span>
                <span className="df-idle-scard-sub">{s.desc}</span>
              </div>
              {i<STAGES.length-1&&<div className="df-idle-arrow"/>}
            </React.Fragment>
          ))}
        </div>
        <div className="df-idle-hint">⟡ {requestMode==="new_software"?"Describe what to build in the box above":"Paste a feature request above"}, then hit ▶ LAUNCH <span className="df-cursor">_</span></div>
        <div className="df-idle-features">
          {[
            {icon:"⏸",color:"#ffaa00",title:"Human Review Gates",desc:"Approve or reject at every checkpoint — targeted feedback loops back into the pipeline and agents self-correct"},
            {icon:"◉",color:"#e066ff",title:"Multi-Agent PR Review",desc:"4 specialized agents run in parallel: security posture, code quality, test coverage, and architecture coherence"},
            {icon:"◈",color:"#00d4ff",title:"LLM Observability",desc:"Real-time token counts, per-call latency, model routing, and cost breakdown across every agent in the run"},
          ].map((f,i)=>(
            <div key={i} className="df-idle-feat" style={{"--fi-color":f.color}}>
              <span className="df-idle-feat-icon" style={{color:f.color}}>{f.icon}</span>
              <div>
                <div className="df-idle-feat-title">{f.title}</div>
                <div className="df-idle-feat-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="df-idle-stack">
          {["LangGraph","FastAPI","React 18","Anthropic API","Linear","Slack","GitHub"].map(t=>(
            <span key={t} className="df-idle-chip">{t}</span>
          ))}
        </div>
      </div>
    );
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
                      {linearId && <span style={{fontSize:10,fontFamily:"monospace",color:"#bf5fff",opacity:.75}}>#{linearId.slice(-6)}</span>}
                      <span style={{fontSize:9,opacity:.5}}>{t.files?.length||0} file{t.files?.length!==1?"s":""}</span>
                    </div>
                  </div>
                  <div className="df-tname" style={{marginBottom:6}}>{t.task_title}</div>
                  {(t.files||[]).map((f,j)=>{
                    const fkey=`${i}-${j}`;
                    const open=expandedFile===fkey;
                    return (<div key={j}>
                      <div style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        fontSize:9,fontFamily:"monospace",padding:"3px 4px 3px 8px",marginBottom:2,
                        background:"rgba(191,95,255,0.08)",borderRadius:2,
                      }}>
                        <span style={{opacity:.75,cursor:"pointer",flex:1}} onClick={()=>setExpandedFile(open?null:fkey)}>→ {f.filename}</span>
                        <span style={{color:"#bf5fff",fontSize:10,minWidth:30,textAlign:"right",cursor:"pointer"}} onClick={()=>setExpandedFile(open?null:fkey)}>{open?"▲ hide":"▼ view"}</span>
                        <button className="df-fsv-exp" title="Full screen" onClick={()=>setFullscreenFile({filename:f.filename,content:f.content,taskTitle:t.task_title})}>⛶</button>
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
    if(detail==="compliance" || detail==="gate_compliance") {
      const rpt = realCompliance;
      const running = !rpt;
      const criticals = rpt?.criticals || 0;
      const warnings  = rpt?.warnings_count || 0;
      const score     = rpt?.score || 0;
      const scoreColor = criticals > 0 ? "#ff2d6b" : warnings > 0 ? "#f59e0b" : "#00ff88";
      const AGENT_LABELS = { accessibility:"WCAG 2.2 / 508", privacy:"GDPR / Privacy", security:"OWASP Top 10", licensing:"License / Regulatory" };
      const byAgent = {};
      (rpt?.findings||[]).forEach(f => { if(!byAgent[f.agent]) byAgent[f.agent]=[];  byAgent[f.agent].push(f); });
      const severityColor = s => s==="critical"?"#ff2d6b":s==="warning"?"#f59e0b":"#6b8ab0";
      return (
        <div>
          <div className="df-dtitle" style={{color:"#f59e0b"}}>Compliance & Governance</div>
          <div className="df-dsub">
            {running
              ? <span style={{animation:"pulse .8s infinite",display:"inline-block"}}>⟳ Running 4 compliance agents in parallel...</span>
              : rpt?.verdict}
          </div>
          {!running && (
            <>
              <div style={{display:"flex",gap:10,marginTop:10,marginBottom:12}}>
                <div style={{flex:1,padding:"8px 12px",borderRadius:8,background:"rgba(255,45,107,.08)",border:"1px solid rgba(255,45,107,.2)",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:"#ff2d6b"}}>{criticals}</div>
                  <div style={{fontSize:9,color:"rgba(200,214,232,.5)",letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Critical</div>
                </div>
                <div style={{flex:1,padding:"8px 12px",borderRadius:8,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:"#f59e0b"}}>{warnings}</div>
                  <div style={{fontSize:9,color:"rgba(200,214,232,.5)",letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Warnings</div>
                </div>
                <div style={{flex:1,padding:"8px 12px",borderRadius:8,background:`rgba(${criticals>0?"255,45,107":warnings>0?"245,158,11":"0,255,136"},.08)`,border:`1px solid rgba(${criticals>0?"255,45,107":warnings>0?"245,158,11":"0,255,136"},.2)`,textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:scoreColor}}>{score}</div>
                  <div style={{fontSize:9,color:"rgba(200,214,232,.5)",letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Debt Score</div>
                </div>
              </div>
              {Object.entries(byAgent).length === 0 && (
                <div style={{color:"#00ff88",fontSize:12,padding:"8px 12px",borderRadius:6,background:"rgba(0,255,136,.06)",border:"1px solid rgba(0,255,136,.15)"}}>✓ No compliance issues detected across all standards</div>
              )}
              {Object.entries(byAgent).map(([agent, findings]) => (
                <div key={agent} style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#f59e0b",letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>{AGENT_LABELS[agent]||agent}</div>
                  {findings.map((f,i) => (
                    <div key={i} style={{padding:"7px 10px",borderRadius:6,marginBottom:4,background:`rgba(${f.severity==="critical"?"255,45,107":f.severity==="warning"?"245,158,11":"107,138,176"},.06)`,border:`1px solid rgba(${f.severity==="critical"?"255,45,107":f.severity==="warning"?"245,158,11":"107,138,176"},.18)`,borderLeft:`3px solid ${severityColor(f.severity)}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                        <div style={{fontSize:11,fontWeight:700,color:tc("#c8d4f0","#1e3a5c"),flex:1}}>{f.title}</div>
                        <span style={{fontSize:9,fontWeight:700,color:severityColor(f.severity),letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>{f.severity}</span>
                      </div>
                      <div style={{fontSize:9,color:tc("rgba(200,214,232,.45)","rgba(20,30,80,.55)"),marginTop:2}}>{f.standard}{f.file ? ` · ${f.file}` : ""}</div>
                      <div style={{fontSize:10,color:tc("rgba(200,214,232,.65)","rgba(20,30,80,.7)"),marginTop:4,lineHeight:1.45}}>{f.description}</div>
                      <div style={{fontSize:10,color:"#00d4ff",marginTop:4,lineHeight:1.4}}>↳ {f.recommendation}</div>
                    </div>
                  ))}
                </div>
              ))}
              {(rpt?.debt_history||[]).length > 1 && (
                <div style={{marginTop:12,padding:"8px 12px",borderRadius:6,background:tc("rgba(200,214,232,.04)","rgba(20,30,80,.06)"),border:"1px solid rgba(245,158,11,.12)"}}>
                  <div style={{fontSize:9,color:"#f59e0b",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Compliance Debt History</div>
                  <div style={{display:"flex",gap:4,alignItems:"flex-end",height:32}}>
                    {rpt.debt_history.map((h,i)=>{
                      const maxScore = Math.max(...rpt.debt_history.map(x=>x.score),1);
                      const h_ = Math.max(4, Math.round((h.score/maxScore)*28));
                      const c = h.criticals>0?"#ff2d6b":h.score>0?"#f59e0b":"#00ff88";
                      return <div key={i} title={`${h.date}: score ${h.score}`} style={{flex:1,height:h_,background:c,borderRadius:2,opacity:.75}}/>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                    <span style={{fontSize:8,color:tc("rgba(200,214,232,.3)","rgba(20,30,80,.4)")}}>{rpt.debt_history[0]?.date}</span>
                    <span style={{fontSize:8,color:tc("rgba(200,214,232,.3)","rgba(20,30,80,.4)")}}>{rpt.debt_history[rpt.debt_history.length-1]?.date}</span>
                  </div>
                </div>
              )}
              <div style={{marginTop:12,padding:"9px 12px",borderRadius:6,background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)"}}>
                <div style={{fontSize:10,color:"rgba(200,214,232,.55)",marginBottom:6}}>This is an optional gate — you may proceed to deploy regardless of findings.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{ fetch(`/compliance/decision/${complianceTid}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approved"})}).catch(()=>{}); addLog("✓ Compliance approved — proceeding to deploy","success"); resumeFn.current && resumeFn.current(); }} style={{flex:1,padding:"6px 10px",borderRadius:5,border:"1px solid rgba(0,255,136,.35)",background:"rgba(0,255,136,.08)",color:"#00ff88",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓ Approve &amp; Deploy</button>
                  <button onClick={()=>{ fetch(`/compliance/decision/${complianceTid}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"deployed_anyway"})}).catch(()=>{}); addLog("⚠ Deployed with open compliance findings","warn"); resumeFn.current && resumeFn.current(); }} style={{flex:1,padding:"6px 10px",borderRadius:5,border:"1px solid rgba(245,158,11,.35)",background:"rgba(245,158,11,.08)",color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}}>⚡ Deploy Anyway</button>
                </div>
              </div>
            </>
          )}
        </div>
      );
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
              <div style={{fontSize:10,color:"#00d4ff",letterSpacing:3,textTransform:"uppercase",marginBottom:5}}>Pull Request</div>
              <a href={realDeploy.pr_url} target="_blank" rel="noopener noreferrer" style={{color:"#00d4ff",fontSize:11,wordBreak:"break-all",display:"block"}}>🔗 {realDeploy.pr_url}</a>
              <div style={{fontSize:9,opacity:.5,marginTop:4}}>{realDeploy.branch} · {realDeploy.files_pushed} files pushed{realDeploy.linear_issues_closed>0?` · ${realDeploy.linear_issues_closed} issues closed`:""}</div>
            </div>
          )}
          {realDeploy?.app_url && (
            <div style={{padding:"9px 12px",borderRadius:3,border:"1px solid rgba(0,255,136,.25)",background:"rgba(0,255,136,.06)",marginTop:8}}>
              <div style={{fontSize:10,color:"#00ff88",letterSpacing:3,textTransform:"uppercase",marginBottom:5}}>🟢 App Running</div>
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
          <div><div className="df-lname">Dev<span>Forge</span> AI</div><div className="df-ltag">Autonomous SDLC Pipeline · 6 AI Agents</div></div>
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
                <span className={`df-cicon ${isActive?"spin":""}`} style={{fontSize:16,color:isActive||isDone||isGate?(isGate?"#ffaa00":stage.color):tc("rgba(200,214,232,.25)","var(--c,#5566dd)")}}>{isDone&&!isGate?"✓":isGate?"⏸":stage.icon}</span>
                <span className="df-rail-dot" style={{background:isDone?"#00ff88":isActive?stage.color:isGate?"#ffaa00":tc("rgba(200,214,232,.12)","var(--c)"),animation:isActive||isGate?"pulse 1s infinite":"none"}}/>
              </div>
            );
            return (
              <div key={stage.id} className="df-sn-row" style={{animationDelay:`${i*60}ms`}}>
                <div className="df-sn-track">
                  <div className={`df-sn ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`}
                    style={{"--c":isGate?"#ffaa00":stage.color,"--glow":isGate?"rgba(255,170,0,.4)":stage.glow}}>
                    {isActive&&<span className="df-sn-ping"/>}
                    <span className={isActive?"spin":""} style={{display:"inline-block",fontSize:11,transition:"color .3s",
                      color:isActive?(isGate?"#ffaa00":stage.color):isDone?"#00ff88":isGate?"#ffaa00":tc("rgba(200,214,232,.3)","var(--c,#5566dd)")}}>
                      {isDone&&!isGate?"✓":isGate?"⏸":stage.icon}
                    </span>
                  </div>
                  {i<STAGES.length-1&&(
                    <div className={`df-sn-line ${isActive?"flow":""}`} style={{height:56}}/>
                  )}
                </div>
                <div className="df-sn-content">
                  <div className={`df-card ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`}
                    style={{"--c":isGate?"#ffaa00":stage.color,"--glow":isGate?"rgba(255,170,0,.3)":stage.glow,
                      cursor:(isDone||isActive||isGate)?"pointer":"default"}}
                    onClick={()=>{ if(isGate) setDetail("gate_"+stage.id); else if(isDone||isActive) setDetail(stage.id); }}>
                    <div className="df-crow">
                      <span className="df-cnum">{stage.num}</span>
                      <div className="df-clbl">
                        <div className="df-cname" style={{color:isActive?stage.color:isDone?tc("#fff","#0d1526"):isGate?"#ffcc55":tc("rgba(255,255,255,.42)","rgba(13,21,38,.62)")}}>{stage.label}</div>
                        <div className="df-csub">{stage.sub}</div>
                      </div>
                      <div className="df-cdot" style={{background:isDone?"#00ff88":isActive?stage.color:isGate?"#ffaa00":tc("rgba(200,214,232,.12)","rgba(20,30,80,.12)"),animation:isActive||isGate?"pulse 1s infinite":"none"}}/>
                    </div>
                    {(isActive||isDone||isGate)&&<div className="df-cdesc">{isGate?"Awaiting your approval":stage.desc}</div>}
                    {(isActive||isDone)&&<div className="df-cprog"><div className="df-cfill" style={{width:`${isDone?100:p}%`,background:isGate?"#ffaa00":stage.color}}/></div>}
                    {llmCalls.filter(c=>c.stage===stage.id).length>0&&(
                      <div style={{fontSize:10,marginTop:4,fontWeight:600,
                        color:theme==="light"?"#1e3a5c":stage.color,
                        opacity:theme==="light"?0.82:0.7}}>
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
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: tabs + content */}
        <div className="df-center">
          <div className="df-tabs" style={{alignItems:"center"}}>
            <div className={`df-tab ${tab==="pipeline"?"active":""}`}    onClick={()=>setTab("pipeline")}>Pipeline</div>
            <div className={`df-tab ${tab==="observability"?"active":""}`} onClick={()=>setTab("observability")}>
              LLM Observability {llmCalls.length>0&&<span style={{marginLeft:6,background:"rgba(0,212,255,.15)",color:"#00d4ff",fontSize:10,padding:"1px 5px",borderRadius:2}}>{llmCalls.length}</span>}
            </div>
            <div className={`df-tab ${tab==="about"?"active":""}`} onClick={()=>setTab("about")}>About</div>
            <button onClick={toggleTheme} title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}
              style={{marginLeft:"auto",background:"transparent",border:"1px solid",borderColor:theme==="dark"?"rgba(255,255,255,.1)":"rgba(0,0,0,.12)",
                color:theme==="dark"?"rgba(200,214,232,.5)":"rgba(20,30,80,.5)",
                cursor:"pointer",width:30,height:30,borderRadius:7,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0,marginRight:6}}
            >{theme==="dark"?"☀":"🌙"}</button>
            <button className="df-tab" onClick={openSettings} style={{display:"flex",alignItems:"center",gap:5,color:theme==="dark"?"rgba(200,214,232,.75)":"rgba(20,30,80,.6)"}}>⚙ Settings</button>
          </div>
          <div className="df-detail">
            {tab==="pipeline" ? renderDetail() : tab==="about" ? <AboutPanel theme={theme}/> : <ObsPanel llmCalls={llmCalls} theme={theme}/>}
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
              {logs.length===0&&<div className="df-log-empty">⟡ Awaiting pipeline...</div>}
              {logs.map(e=><div key={e.id} className="df-log-row"><span className="df-log-ts">{e.ts}</span><span className={`df-log-msg ${e.type}`}>{e.msg}</span></div>)}
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div className="df-foot">
        <span className="df-foot-brand">DevForge <em>AI</em></span>
        <div className="df-foot-dots">
          {STAGES.map(s=><span key={s.id} className="df-foot-dot" style={{background:s.color}}/>)}
        </div>
        <span className="df-foot-sep">·</span>
        <span className="df-foot-tag">Autonomous SDLC Intelligence Engine</span>
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
      {fullscreenFile&&(
        <div className="df-fsv" onClick={e=>{if(e.target===e.currentTarget)setFullscreenFile(null);}}>
          <div className="df-fsv-hdr">
            <div className="df-fsv-dot"/>
            <div className="df-fsv-fname">{fullscreenFile.filename}</div>
            {fullscreenFile.taskTitle && <div className="df-fsv-task">{fullscreenFile.taskTitle}</div>}
            <button className="df-fsv-copy"
              onClick={()=>{
                navigator.clipboard?.writeText(fullscreenFile.content||"");
                setFullscreenFile(f=>({...f,_copied:true}));
                setTimeout(()=>setFullscreenFile(f=>f?{...f,_copied:false}:f),1800);
              }}
            >{fullscreenFile._copied?"✓ Copied":"Copy"}</button>
            <button className="df-fsv-close" title="Close (Esc)" onClick={()=>setFullscreenFile(null)}>×</button>
          </div>
          <div className="df-fsv-body">
            <CodeBlock code={fullscreenFile.content||""} style={{maxHeight:"none",height:"100%",borderRadius:0,border:"none",fontSize:13,padding:"20px 24px"}}/>
          </div>
        </div>
      )}

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
                      placeholder={settingsData?.github_repo_preview||"owner/repo"}
                      value={settingsEdits.github_repo!=null?settingsEdits.github_repo:""}
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
                    {label:"GitHub Repo",    on:!!settingsData?.github_repo,           val:settingsData?.github_repo_preview,     color:"#c8d6e8"},
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

    </div>
  );
}
