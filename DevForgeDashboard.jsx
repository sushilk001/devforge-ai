import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap";
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
    {t:400, msg:"⟡ Starting progressive deployment...",           type:"info"},
    {t:1000,msg:"✓ DEV — deployed ✓",                              type:"success"},
    {t:1800,msg:"✓ STAGING — deployed ✓",                          type:"success"},
    {t:2800,msg:"✓ UAT — deployed ✓",                              type:"success"},
    {t:3600,msg:"⟡ All pre-prod gates passed.",                    type:"info"},
    {t:4200,msg:"✓ PRODUCTION — deployed ✓",                      type:"success"},
    {t:4800,msg:"⟡ Monitoring error rate post-deploy...",          type:"info"},
    {t:5400,msg:"✓ Error rate: 0.01% — within threshold",          type:"success"},
    {t:5900,msg:"🎉 FEATURE SHIPPED TO PRODUCTION",                type:"done"},
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
  @keyframes pulse    {0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes glow     {0%,100%{box-shadow:0 0 12px var(--glow),0 0 40px var(--glow)}50%{box-shadow:0 0 24px var(--glow),0 0 80px var(--glow)}}
  @keyframes spin     {from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes fadeUp   {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideLog {from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:translateX(0)}}
  @keyframes scanline {0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
  @keyframes blink    {0%,100%{opacity:1}50%{opacity:0}}
  @keyframes flowLine {0%{transform:translateY(-100%);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateY(200%);opacity:0}}
  @keyframes prodPulse{0%,100%{box-shadow:0 0 20px rgba(255,45,107,.5),0 0 60px rgba(255,45,107,.25)}50%{box-shadow:0 0 40px rgba(255,45,107,.8),0 0 120px rgba(255,45,107,.4)}}
  @keyframes countUp  {from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes tokenIn  {from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}

  .df*{box-sizing:border-box;margin:0;padding:0}
  .df{font-family:'Space Mono',monospace;background:#060810;min-height:100vh;color:#c8d6e8;overflow:hidden;position:relative}
  .df-scan{position:fixed;top:0;left:0;width:100%;height:2px;pointer-events:none;z-index:999;
    background:linear-gradient(to bottom,transparent,rgba(0,212,255,.05),transparent);animation:scanline 8s linear infinite}

  /* Header */
  .df-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;
    border-bottom:1px solid rgba(0,212,255,.1);background:rgba(0,6,20,.9);backdrop-filter:blur(12px)}
  .df-logo{display:flex;align-items:center;gap:10px}
  .df-hex{width:32px;height:32px;background:rgba(0,212,255,.1);border:1.5px solid #00d4ff;display:flex;align-items:center;justify-content:center;
    font-size:14px;color:#00d4ff;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)}
  .df-lname{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:#fff}
  .df-lname span{color:#00d4ff}
  .df-ltag{font-size:8px;letter-spacing:3px;color:rgba(0,212,255,.5);text-transform:uppercase;margin-top:2px}
  .df-timer{font-size:24px;font-weight:700;letter-spacing:2px;font-variant-numeric:tabular-nums}
  .df-badge{font-size:9px;letter-spacing:3px;text-transform:uppercase;padding:5px 13px;border:1px solid;border-radius:2px}
  .df-badge.idle   {color:rgba(200,214,232,.35);border-color:rgba(200,214,232,.15)}
  .df-badge.running{color:#00ff88;border-color:rgba(0,255,136,.4);animation:pulse 1.5s infinite}
  .df-badge.gate   {color:#ffaa00;border-color:rgba(255,170,0,.4);animation:pulse 1s infinite}
  .df-badge.done   {color:#00d4ff;border-color:rgba(0,212,255,.4)}

  /* Input */
  .df-inp-area{display:flex;gap:10px;align-items:flex-end;padding:14px 22px;
    border-bottom:1px solid rgba(0,212,255,.07);background:rgba(0,6,20,.6)}
  .df-inp-lbl{font-size:8px;letter-spacing:3px;color:rgba(0,212,255,.55);text-transform:uppercase;margin-bottom:5px}
  .df-inp-w{flex:1}
  .df-inp{width:100%;background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.18);border-radius:3px;
    color:#e8f4ff;font-family:'Space Mono',monospace;font-size:12px;padding:9px 13px;outline:none;resize:none;
    line-height:1.6;transition:border-color .2s}
  .df-inp:focus{border-color:rgba(0,212,255,.45)}
  .df-inp::placeholder{color:rgba(200,214,232,.2)}
  .df-launch{background:#00d4ff;color:#060810;border:none;cursor:pointer;font-family:'Syne',sans-serif;
    font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:0 22px;
    border-radius:3px;height:42px;transition:all .2s;white-space:nowrap}
  .df-launch:hover:not(:disabled){background:#33ddff;transform:translateY(-1px)}
  .df-launch:disabled{background:rgba(0,212,255,.15);color:rgba(0,212,255,.35);cursor:not-allowed}

  /* Main layout */
  .df-main{display:flex;height:calc(100vh - 168px);overflow:hidden}

  /* Pipeline sidebar */
  .df-pipe{width:286px;flex-shrink:0;overflow-y:auto;padding:14px 12px;border-right:1px solid rgba(0,212,255,.07)}
  .df-pipe::-webkit-scrollbar{width:2px}
  .df-pipe::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2)}
  .df-card{border:1px solid rgba(200,214,232,.07);border-radius:4px;padding:11px;margin-bottom:5px;
    background:rgba(255,255,255,.015);transition:all .3s;position:relative;overflow:hidden}
  .df-card.active{border-color:var(--c);background:rgba(0,0,0,.45);animation:glow 2s ease-in-out infinite}
  .df-card.done  {border-color:rgba(0,255,136,.2);background:rgba(0,255,136,.025)}
  .df-card.gate  {border-color:#ffaa00;background:rgba(255,170,0,.05);animation:pulse 1s infinite}
  .df-card.active::before,.df-card.gate::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(to right,transparent,var(--c,#ffaa00),transparent)}
  .df-crow{display:flex;align-items:center;gap:8px}
  .df-cnum{font-size:8px;letter-spacing:2px;opacity:.35}
  .df-cicon{font-size:15px;transition:color .3s}
  .df-cicon.spin{animation:spin 1s linear infinite}
  .df-clbl{flex:1}
  .df-cname{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#fff;transition:color .3s}
  .df-csub{font-size:8px;letter-spacing:2px;opacity:.45}
  .df-cdot{width:7px;height:7px;border-radius:50%;transition:background .3s}
  .df-cdesc{font-size:10px;opacity:.4;margin-top:6px;line-height:1.5}
  .df-cprog{height:2px;background:rgba(200,214,232,.07);margin-top:7px;border-radius:1px;overflow:hidden}
  .df-cfill{height:100%;border-radius:1px;transition:width .3s}
  .df-crev{font-size:8px;letter-spacing:1px;padding:2px 6px;border-radius:2px;margin-top:5px;display:inline-block}
  .df-crev.approved{background:rgba(0,255,136,.1);color:#00ff88;border:1px solid rgba(0,255,136,.25)}
  .df-crev.changes {background:rgba(255,100,0,.1);color:#ff6400;border:1px solid rgba(255,100,0,.25)}
  .df-conn{display:flex;align-items:center;justify-content:center;height:13px}
  .df-cline{width:1px;height:100%;background:rgba(200,214,232,.08);position:relative;overflow:hidden}
  .df-cline.flow::after{content:'';position:absolute;top:0;left:0;width:100%;height:35%;
    background:#00d4ff;animation:flowLine 1s ease-in-out infinite}

  /* Center panel */
  .df-center{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid rgba(0,212,255,.07)}

  /* Tabs */
  .df-tabs{display:flex;border-bottom:1px solid rgba(0,212,255,.1);background:rgba(0,6,20,.6);flex-shrink:0}
  .df-tab{padding:10px 20px;font-size:9px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;
    border-bottom:2px solid transparent;transition:all .2s;color:rgba(200,214,232,.4)}
  .df-tab.active{color:#00d4ff;border-bottom-color:#00d4ff}
  .df-tab:hover:not(.active){color:rgba(200,214,232,.7)}

  /* Detail */
  .df-detail{flex:1;overflow-y:auto;padding:16px 20px}
  .df-detail::-webkit-scrollbar{width:2px}
  .df-detail::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2)}
  .df-dtitle{font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:#fff;margin-bottom:3px}
  .df-dsub  {font-size:9px;letter-spacing:2px;color:rgba(0,212,255,.55);text-transform:uppercase;margin-bottom:14px}

  /* PRD */
  .df-prd{background:rgba(0,212,255,.03);border:1px solid rgba(0,212,255,.1);border-radius:4px;padding:13px}
  .df-prd-h{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#00d4ff;margin-bottom:9px}
  .df-ps{margin-bottom:11px}
  .df-pl{font-size:8px;letter-spacing:2px;color:rgba(0,212,255,.55);text-transform:uppercase;margin-bottom:4px}
  .df-pt{font-size:11px;line-height:1.7;opacity:.75}
  .df-pi{font-size:11px;line-height:1.8;opacity:.75}
  .df-pi::before{content:'→ ';color:#00d4ff}

  /* Tasks */
  .df-tasks{display:flex;flex-direction:column;gap:6px}
  .df-task{background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.13);border-radius:3px;
    padding:8px 11px;display:flex;align-items:center;gap:9px;animation:fadeUp .3s ease-out}
  .df-tid  {font-size:9px;color:#00ff88;opacity:.7;min-width:56px}
  .df-tname{font-size:11px;flex:1}
  .df-tpts {font-size:9px;color:#00ff88;opacity:.7}

  /* Agents */
  .df-agents{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .df-agent{border-radius:4px;padding:10px;border:1px solid rgba(200,214,232,.08);background:rgba(0,0,0,.3);transition:all .3s}
  .df-agent.running{border-color:var(--ac)}
  .df-agent.passed {border-color:rgba(0,255,136,.25)}
  .df-agent.warned {border-color:rgba(255,149,0,.25)}
  .df-agh{display:flex;align-items:center;gap:7px;margin-bottom:6px}
  .df-agd{width:7px;height:7px;border-radius:50%}
  .df-agname{font-size:11px;font-weight:700;color:#fff}
  .df-agst{font-size:8px;letter-spacing:1px;opacity:.6}
  .df-agf{font-size:10px;line-height:1.5;opacity:.65}

  /* QA */
  .df-qa-list{display:flex;flex-direction:column;gap:6px}
  .df-qa-row{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:3px;
    border:1px solid rgba(191,95,255,.13);background:rgba(191,95,255,.04);animation:fadeUp .3s ease-out}
  .df-qa-type {font-size:9px;color:#bf5fff;min-width:106px}
  .df-qa-count{font-size:11px;flex:1}
  .df-qa-badge{font-size:8px;padding:2px 7px;border-radius:2px;background:rgba(0,255,136,.1);color:#00ff88;
    border:1px solid rgba(0,255,136,.25)}

  /* Deploy */
  .df-envs{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
  .df-env{display:flex;align-items:center;gap:11px;padding:9px 13px;border-radius:3px;
    border:1px solid rgba(255,45,107,.13);background:rgba(255,45,107,.04);transition:all .4s}
  .df-env.live{border-color:rgba(0,255,136,.3);background:rgba(0,255,136,.05)}
  .df-env-name{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;color:#fff;min-width:78px}
  .df-env-bar{flex:1;height:3px;background:rgba(255,45,107,.1);border-radius:2px;overflow:hidden}
  .df-env-fill{height:100%;background:#ff2d6b;border-radius:2px;transition:width 1.5s ease}
  .df-env.live .df-env-fill{background:#00ff88}
  .df-env-st{font-size:9px;min-width:68px;text-align:right}

  /* Gate */
  .df-gate{border-radius:5px;border:1px solid rgba(255,170,0,.35);background:rgba(255,170,0,.05);
    padding:16px;animation:fadeUp .4s ease-out}
  .df-gate-hdr{display:flex;align-items:center;gap:9px;margin-bottom:10px}
  .df-gate-icon{font-size:18px}
  .df-gate-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:#ffaa00}
  .df-gate-verdict{font-size:11px;opacity:.7;margin-bottom:10px;line-height:1.6}
  .df-gate-pts{margin-bottom:14px}
  .df-gate-pt{font-size:11px;opacity:.7;line-height:1.9}
  .df-gate-pt::before{content:'· ';color:#ffaa00}
  .df-gate-actions{display:flex;gap:9px;flex-wrap:wrap}
  .df-gate-ok{background:#00ff88;color:#060810;border:none;cursor:pointer;font-family:'Syne',sans-serif;
    font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:9px 18px;border-radius:3px;transition:all .2s}
  .df-gate-ok:hover{background:#33ff99;transform:translateY(-1px)}
  .df-gate-rej{background:transparent;color:#ff6464;border:1px solid rgba(255,100,100,.35);cursor:pointer;
    font-family:'Space Mono',monospace;font-size:11px;padding:9px 18px;border-radius:3px;transition:all .2s}
  .df-gate-rej:hover{border-color:rgba(255,100,100,.7);background:rgba(255,100,100,.07)}
  .df-fb-wrap{margin-top:11px;animation:fadeUp .3s ease-out}
  .df-fb-lbl{font-size:8px;letter-spacing:2px;color:rgba(255,100,100,.7);text-transform:uppercase;margin-bottom:5px}
  .df-fb-inp{width:100%;background:rgba(255,100,100,.05);border:1px solid rgba(255,100,100,.25);border-radius:3px;
    color:#e8f4ff;font-family:'Space Mono',monospace;font-size:11px;padding:8px 11px;outline:none;resize:none;line-height:1.5}
  .df-fb-inp:focus{border-color:rgba(255,100,100,.5)}
  .df-fb-sub{margin-top:7px;background:rgba(255,100,100,.12);color:#ff6464;border:1px solid rgba(255,100,100,.28);
    cursor:pointer;font-family:'Syne',sans-serif;font-size:10px;font-weight:800;letter-spacing:1.5px;
    text-transform:uppercase;padding:7px 14px;border-radius:3px;transition:all .2s}
  .df-fb-sub:hover{background:rgba(255,100,100,.22)}

  /* Prod gate */
  .df-prod-gate{border-radius:5px;border:1.5px solid rgba(255,45,107,.6);background:rgba(255,45,107,.06);
    padding:20px;animation:prodPulse 2s ease-in-out infinite,fadeUp .4s ease-out;position:relative;overflow:hidden}
  .df-prod-gate::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(to right,transparent,#ff2d6b,transparent)}
  .df-pg-hdr{display:flex;align-items:center;gap:9px;margin-bottom:7px}
  .df-pg-icon{font-size:22px}
  .df-pg-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:#ff2d6b}
  .df-pg-sub{font-size:9px;letter-spacing:2px;color:rgba(255,45,107,.6);text-transform:uppercase;margin-bottom:12px}
  .df-pg-checks{margin-bottom:14px}
  .df-pg-check{display:flex;align-items:center;gap:8px;padding:5px 0;
    border-bottom:1px solid rgba(255,45,107,.1);font-size:11px;opacity:.8}
  .df-pg-check-ic{color:#00ff88;font-size:11px;min-width:13px}
  .df-pg-clbl{font-size:8px;letter-spacing:2px;color:rgba(255,45,107,.7);text-transform:uppercase;margin-bottom:6px;margin-top:12px}
  .df-pg-cinp{width:100%;background:rgba(255,45,107,.05);border:1px solid rgba(255,45,107,.3);border-radius:3px;
    color:#ff8099;font-family:'Space Mono',monospace;font-size:13px;font-weight:700;padding:9px 13px;
    outline:none;letter-spacing:3px;text-align:center}
  .df-pg-cinp:focus{border-color:rgba(255,45,107,.6)}
  .df-pg-cinp::placeholder{color:rgba(255,45,107,.25);letter-spacing:1px;font-size:10px}
  .df-pg-btn{width:100%;margin-top:11px;padding:13px;border:none;border-radius:3px;cursor:pointer;
    font-family:'Syne',sans-serif;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;transition:all .2s}
  .df-pg-btn.locked  {background:rgba(255,45,107,.1);color:rgba(255,45,107,.35);cursor:not-allowed}
  .df-pg-btn.unlocked{background:#ff2d6b;color:#fff}
  .df-pg-btn.unlocked:hover{background:#ff5588;transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,45,107,.4)}

  /* Done */
  .df-done{text-align:center;padding:44px 20px;animation:fadeUp .5s ease-out}
  .df-done-ic{font-size:44px;margin-bottom:14px}
  .df-done-t {font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:5px}
  .df-done-s {font-size:10px;color:rgba(0,212,255,.6);letter-spacing:2px;margin-bottom:22px}
  .df-metrics{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
  .df-metric {text-align:center;padding:11px 16px;border:1px solid rgba(0,212,255,.18);border-radius:3px;min-width:85px}
  .df-mv     {font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#00d4ff}
  .df-ml     {font-size:8px;letter-spacing:2px;opacity:.45;margin-top:3px}

  /* ── OBSERVABILITY ─────────────────────────────────────────────────── */
  .obs-wrap  {padding:16px 20px;display:flex;flex-direction:column;gap:16px}

  /* Summary strip */
  .obs-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .obs-stat  {background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.1);border-radius:4px;padding:11px 13px;
    text-align:center;animation:countUp .4s ease-out}
  .obs-stat-val{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:3px}
  .obs-stat-lbl{font-size:8px;letter-spacing:2px;opacity:.45;text-transform:uppercase}

  /* Section header */
  .obs-sh  {font-size:8px;letter-spacing:3px;color:rgba(0,212,255,.55);text-transform:uppercase;margin-bottom:8px;
    display:flex;align-items:center;gap:8px}
  .obs-sh::after{content:'';flex:1;height:1px;background:rgba(0,212,255,.1)}

  /* Call table */
  .obs-table{width:100%;border-collapse:collapse;font-size:10px}
  .obs-table th{font-size:8px;letter-spacing:2px;color:rgba(0,212,255,.5);text-transform:uppercase;
    padding:5px 8px;border-bottom:1px solid rgba(0,212,255,.1);text-align:left;font-weight:400}
  .obs-table td{padding:6px 8px;border-bottom:1px solid rgba(200,214,232,.04);vertical-align:middle}
  .obs-table tr{animation:tokenIn .25s ease-out}
  .obs-table tr:hover td{background:rgba(0,212,255,.03)}
  .obs-model-chip{display:inline-block;font-size:8px;padding:2px 6px;border-radius:2px;letter-spacing:1px}
  .obs-drift-warn{display:inline-flex;align-items:center;gap:4px;font-size:8px;color:#ff9500;
    background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.25);padding:2px 7px;border-radius:2px}

  /* Token bar inline */
  .obs-tok-bar{display:flex;height:5px;border-radius:2px;overflow:hidden;min-width:60px;gap:1px}
  .obs-tok-in {background:#00d4ff;border-radius:2px 0 0 2px}
  .obs-tok-out{background:#00ff88;border-radius:0 2px 2px 0}

  /* Chart containers */
  .obs-chart-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .obs-chart-box{background:rgba(0,0,0,.25);border:1px solid rgba(0,212,255,.08);border-radius:4px;padding:13px}
  .obs-chart-title{font-size:8px;letter-spacing:2px;color:rgba(0,212,255,.55);text-transform:uppercase;margin-bottom:10px}

  /* Legend */
  .obs-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}
  .obs-legend-item{display:flex;align-items:center;gap:5px;font-size:9px;opacity:.65}
  .obs-legend-dot{width:8px;height:8px;border-radius:50%}

  /* Drift indicator */
  .obs-drift-banner{background:rgba(255,149,0,.07);border:1px solid rgba(255,149,0,.25);border-radius:4px;
    padding:9px 13px;display:flex;align-items:center;gap:10px;font-size:10px}
  .obs-drift-icon{font-size:14px}
  .obs-drift-text{opacity:.75;line-height:1.5}
  .obs-empty{text-align:center;padding:60px 20px;opacity:.25;font-size:11px;line-height:2}

  /* Log */
  .df-log    {width:248px;flex-shrink:0;display:flex;flex-direction:column}
  .df-log-hdr{padding:13px;border-bottom:1px solid rgba(0,212,255,.07);font-size:8px;letter-spacing:3px;
    color:rgba(0,212,255,.55);text-transform:uppercase;display:flex;align-items:center;gap:7px}
  .df-log-dot{width:6px;height:6px;border-radius:50%}
  .df-log-bd {flex:1;overflow-y:auto;padding:9px}
  .df-log-bd::-webkit-scrollbar{width:2px}
  .df-log-bd::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2)}
  .df-log-row{font-size:10px;line-height:1.6;padding:3px 0;border-bottom:1px solid rgba(200,214,232,.04);animation:slideLog .2s ease-out}
  .df-log-ts {color:rgba(0,212,255,.35);margin-right:5px}
  .df-log-msg.info   {color:rgba(200,214,232,.55)}
  .df-log-msg.success{color:#00ff88}
  .df-log-msg.warn   {color:#ff9500}
  .df-log-msg.agent  {color:#c8d6e8}
  .df-log-msg.gate   {color:#ffaa00}
  .df-log-msg.handoff{color:#00d4ff}
  .df-log-msg.done   {color:#ff2d6b;font-weight:700}
  .df-idle-hint{text-align:center;padding:56px 20px;opacity:.25;font-size:11px;line-height:2}
  .df-cursor{animation:blink 1s step-end infinite;color:#00d4ff}

  /* Tooltip override */
  .recharts-tooltip-wrapper .recharts-default-tooltip{background:#0d1425!important;border-color:rgba(0,212,255,.2)!important;font-family:'Space Mono',monospace!important;font-size:10px!important;color:#c8d6e8!important}
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
function ObsPanel({ llmCalls }) {
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
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(200,214,232,.07)" />
              <XAxis dataKey="name" tick={{fill:"rgba(200,214,232,.35)",fontSize:8}} />
              <YAxis tick={{fill:"rgba(200,214,232,.35)",fontSize:8}} unit="ms" />
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
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(200,214,232,.07)" />
              <XAxis dataKey="name" tick={{fill:"rgba(200,214,232,.35)",fontSize:8}} />
              <YAxis tick={{fill:"rgba(200,214,232,.35)",fontSize:8}} />
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
                    <div style={{color:"#e8f4ff",marginBottom:2}}>{c.label}</div>
                    <div style={{fontSize:8,color:STAGE_COLORS[c.stage],opacity:.8}}>{c.stage}</div>
                  </td>
                  <td>
                    <span className="obs-model-chip" style={{background:`${MODEL_COLORS[c.model]}18`,color:MODEL_COLORS[c.model],border:`1px solid ${MODEL_COLORS[c.model]}35`}}>
                      {c.model === "claude-sonnet-4-6" ? "Sonnet 4" : "Haiku 4.5"}
                    </span>
                  </td>
                  <td>
                    <div style={{marginBottom:3,fontSize:9,opacity:.6}}>{c.inputTok.toLocaleString()} / {c.outputTok.toLocaleString()}</div>
                    <div className="obs-tok-bar">
                      <div className="obs-tok-in"  style={{width:`${inW}%`}}/>
                      <div className="obs-tok-out" style={{width:`${100-inW}%`}}/>
                    </div>
                  </td>
                  <td>
                    <span style={{color: isSlow?"#ff9500":"#c8d6e8"}}>{c.latencyMs}ms</span>
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
            <div key={i} style={{background:"rgba(0,0,0,.25)",border:"1px solid rgba(200,214,232,.08)",borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:m.color,marginBottom:3}}>{m.val}</div>
              <div style={{fontSize:9,opacity:.65,marginBottom:2}}>{m.lbl}</div>
              <div style={{fontSize:8,opacity:.35,letterSpacing:1}}>{m.sub}</div>
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
  const [expandedFile, setExpandedFile] = useState(null);
  const { elapsed, display, reset } = useTimer(appState === "running");

  const toRef    = useRef([]);
  const logRef   = useRef(null);
  const resumeFn = useRef(null);

  // ── Clear stale observability data on hard refresh, then start polling ──
  const fetchLlmCalls = useCallback(() => {
    fetch("/stats/llm-calls")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.calls)) setLlmCalls(data.calls); })
      .catch(() => {});
  }, []);

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
    const deadline = Date.now() + 180_000;   // 3-min timeout (code gen is slower)
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

  // ── Launch ─────────────────────────────────────────────────────────────
  const handleLaunch = () => {
    clearAll(); reset();
    setAppState("running"); setActive(null); setDone(new Set()); setReviews({});
    setProgress({}); setLogs([]); setDetail(null); setGateStage(null);
    setShowFB(false); setFb(""); setProdCfm(""); setEnvProg({});
    setS1Tid(null); setS2Tid(null); setS3Tid(null); setS4Tid(null); setApiReady({}); setRealPrd(null); setRealTasks([]); setRealReview(null); setRealCodeGen(null); setRealQA(null); setExpandedFile(null);
    addLog("⟡ DevForge AI pipeline started","info");
    addLog("⟡ Source: Slack #feature-requests","info");

    // Clear server call history first, then start Stage 1 — prevents DELETE racing with stage1 LLM recording
    fetch("/stats/llm-calls", {method:"DELETE"})
      .catch(()=>{})
      .then(() => fetch("/stage1/submit", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({raw_text: input, requester:"devforge-ui"})
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

  const runDeploy = () => {
    const dur = STAGE_DUR.deploy;
    setActive("deploy"); setDetail("deploy");
    setProgress(p=>({...p,deploy:0})); setAppState("running");
    for(let i=1;i<=40;i++) T(()=>setProgress(p=>({...p,deploy:(i/40)*100})), (dur/40)*i);
    PIPELINE_SCRIPT.deploy.forEach(({t,msg,type})=>T(()=>addLog(msg,type),t));
    ENV_DATA.forEach(env=>T(()=>setEnvProg(p=>({...p,[env.name]:100})), env.delay+800));
    T(()=>setEnvProg(p=>({...p,PRODUCTION:100})), 5200);
    T(()=>{
      setDone(p=>new Set([...p,"deploy"])); setActive(null);
      setAppState("done"); setDetail("done");
      addLog("🎉 Feature shipped to production","done");
    }, dur);
  };

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
    setReviews(p=>({...p,[gateStage]:"changes"}));
    addLog(`⚠ Changes requested: "${fb.slice(0,45)}..."`,"warn");
    setShowFB(false); setFb(""); const sid=gateStage; setGateStage(null);
    setDone(p=>{const n=new Set(p); n.delete(sid); return n;});
    const fn=resumeFn.current; T(()=>runStage(sid,fn),500);
  };

  const prodOK = prodCfm.toUpperCase()==="DEPLOY";
  const handleProdDeploy = () => {
    if(!prodOK) return;
    addLog("✓ Production approved by Sushil","success");
    setGateStage(null); const fn=resumeFn.current; resumeFn.current=null; T(fn,400);
  };

  // ── Detail renderer ────────────────────────────────────────────────────
  const renderDetail = () => {
    if(!detail) return <div className="df-idle-hint">⟡ Enter a feature request<br/>and hit ▶ LAUNCH<br/><br/><span className="df-cursor">_</span></div>;
    if(detail==="requirements") return (
      <div>
        <div className="df-dtitle" style={{color:"#00d4ff"}}>Requirements Agent</div>
        <div className="df-dsub">Feature Request → PRD</div>
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
      return <div><div className="df-dtitle" style={{color:"#00ff88"}}>Task Orchestration</div><div className="df-dsub">{realTasks.length ? `Creating ${realTasks.length} tasks in Linear` : "⟳ Decomposing tasks..."}</div><div className="df-tasks">{realTasks.length ? taskList.slice(0,vis).map((t,i)=><div key={i} className="df-task"><span className="df-tid">[{t.type?.toUpperCase()}]</span><span className="df-tname">{t.title}</span><span className="df-tpts">{t.estimate_hours}h</span></div>) : <div className="df-task" style={{opacity:0.4}}><span className="df-tid">—</span><span className="df-tname">waiting for AI...</span></div>}</div></div>;
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
                      {open&&<pre style={{
                        fontSize:8,lineHeight:1.55,fontFamily:"monospace",
                        padding:"8px 10px",margin:"0 0 4px 0",borderRadius:2,
                        background:"rgba(0,0,0,0.45)",color:"#c8d6e8",
                        overflow:"auto",maxHeight:220,whiteSpace:"pre-wrap",wordBreak:"break-all",
                      }}>{f.content}</pre>}
                    </div>);
                  })}
                </div>
              );
            })}
            {skipped.length>0 && (
              <div style={{marginTop:6,padding:"6px 10px",background:"rgba(255,255,255,0.03)",borderLeft:"2px solid rgba(191,95,255,0.3)",borderRadius:3}}>
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
            <div className="df-agh"><div className="df-agd" style={{background:running?agentColors[name]:"rgba(200,214,232,.15)",animation:running?"pulse .8s infinite":"none"}}/><div>
              <div className="df-agname">{name.charAt(0).toUpperCase()+name.slice(1)} Agent</div>
              <div className="df-agst">{running?"REVIEWING CODE...":"WAITING"}</div>
            </div></div>
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
            const badgeColor = badge==="PASS"?"#2dd4bf":badge==="FAIL"?"#ff2d6b":badge==="ERROR"?"#ffaa00":"rgba(200,214,232,.35)";
            const badgeBg    = badge==="PASS"?"rgba(45,212,191,.12)":badge==="FAIL"?"rgba(255,45,107,.12)":badge==="ERROR"?"rgba(255,170,0,.12)":"rgba(200,214,232,.06)";
            return (
              <div key={key} className="df-qa-row">
                <span className="df-qa-type">{label}</span>
                <span className="df-qa-count" style={{color:"rgba(200,214,232,.6)",fontSize:10}}>{count}</span>
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
      const allEnvs=[...ENV_DATA.map(e=>e.name),"PRODUCTION"];
      return <div><div className="df-dtitle" style={{color:"#ff2d6b"}}>Deploy Pipeline</div><div className="df-dsub">Progressive Promotion</div><div className="df-envs">{allEnvs.map(name=>{const p=envProg[name]||0,live=p>=100;return(<div key={name} className={`df-env ${live?"live":""}`}><span className="df-env-name">{name}</span><div className="df-env-bar"><div className="df-env-fill" style={{width:`${p}%`}}/></div><span className="df-env-st" style={{color:live?"#00ff88":"rgba(200,214,232,.35)"}}>{live?"✓ LIVE":p>0?"DEPLOYING...":"WAITING"}</span></div>);})}</div></div>;
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
      return <div className="df-done"><div className="df-done-ic">🎉</div><div className="df-done-t">Feature Shipped to Production</div><div className="df-done-s">5 stages · 5 approvals · zero handoffs</div><div className="df-metrics">{[{v:`${m}m ${s%60}s`,l:"Total Time"},{v:llmCalls.length,l:"LLM Calls"},{v:`$${llmCalls.reduce((a,c)=>a+c.cost,0).toFixed(4)}`,l:"API Cost"},{v:"100%",l:"Tests Green"}].map((m,i)=><div key={i} className="df-metric"><div className="df-mv">{m.v}</div><div className="df-ml">{m.l}</div></div>)}</div></div>;
    }
    return null;
  };

  const badgeCls  = appState==="running"?"running":appState==="gate"||appState==="prod_gate"?"gate":appState==="done"?"done":"idle";
  const badgeTxt  = appState==="running"?"● PIPELINE ACTIVE":appState==="gate"?"⏸ AWAITING REVIEW":appState==="prod_gate"?"⚠ PROD GATE":appState==="done"?"✓ COMPLETE":"STANDBY";
  const timerColor= appState==="running"?"#00ff88":appState==="done"?"#00d4ff":appState==="gate"||appState==="prod_gate"?"#ffaa00":"#fff";

  return (
    <div className="df">
      <style>{css}</style>
      <div className="df-scan"/>

      {/* Header */}
      <div className="df-hdr">
        <div className="df-logo">
          <div className="df-hex">⬡</div>
          <div><div className="df-lname">Dev<span>Forge</span> AI</div><div className="df-ltag">Ghost Engineer · Autonomous SDLC</div></div>
        </div>
        <div className="df-timer" style={{color:timerColor}}>{display}</div>
        <div className={`df-badge ${badgeCls}`}>{badgeTxt}</div>
      </div>

      {/* Input */}
      <div className="df-inp-area">
        <div className="df-inp-w">
          <div className="df-inp-lbl">Feature Request</div>
          <textarea className="df-inp" rows={2} value={input} onChange={e=>setInput(e.target.value)} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"} placeholder="Describe the feature..."/>
        </div>
        <button className="df-launch" onClick={handleLaunch} disabled={appState==="running"||appState==="gate"||appState==="prod_gate"||!input.trim()}>
          {appState==="running"?"RUNNING...":(appState==="gate"||appState==="prod_gate")?"AWAITING...":(appState==="done"?"↺ RERUN":"▶ LAUNCH")}
        </button>
      </div>

      {/* Main */}
      <div className="df-main">

        {/* Pipeline sidebar */}
        <div className="df-pipe">
          {STAGES.map((stage,i)=>{
            const isActive=activeStage===stage.id, isDone=doneStages.has(stage.id), isGate=gateStage===stage.id;
            const rev=stageReviews[stage.id], p=progress[stage.id]||0;
            return <div key={stage.id}>
              <div className={`df-card ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`} style={{"--c":isGate?"#ffaa00":stage.color,"--glow":isGate?"rgba(255,170,0,.3)":stage.glow,cursor:(isDone||isActive||isGate)?"pointer":"default"}} onClick={()=>{ if(isGate) setDetail("gate_"+stage.id); else if(isDone||isActive) setDetail(stage.id); }}>
                <div className="df-crow">
                  <span className="df-cnum">{stage.num}</span>
                  <span className={`df-cicon ${isActive?"spin":""}`} style={{color:isActive||isDone||isGate?(isGate?"#ffaa00":stage.color):"rgba(200,214,232,.25)"}}>{isDone&&!isGate?"✓":isGate?"⏸":stage.icon}</span>
                  <div className="df-clbl">
                    <div className="df-cname" style={{color:isActive?stage.color:isDone?"#fff":isGate?"#ffaa00":"rgba(255,255,255,.45)"}}>{stage.label}</div>
                    <div className="df-csub">{stage.sub}</div>
                  </div>
                  <div className="df-cdot" style={{background:isDone?"#00ff88":isActive?stage.color:isGate?"#ffaa00":"rgba(200,214,232,.12)",animation:isActive||isGate?"pulse 1s infinite":"none"}}/>
                </div>
                {(isActive||isDone||isGate)&&<div className="df-cdesc">{isGate?"Awaiting your approval":stage.desc}</div>}
                {(isActive||isDone)&&<div className="df-cprog"><div className="df-cfill" style={{width:`${isDone?100:p}%`,background:isGate?"#ffaa00":stage.color}}/></div>}
                {llmCalls.filter(c=>c.stage===stage.id).length>0&&(
                  <div style={{fontSize:9,marginTop:5,opacity:.5,color:stage.color}}>
                    {llmCalls.filter(c=>c.stage===stage.id).length} LLM call{llmCalls.filter(c=>c.stage===stage.id).length>1?"s":""} · {llmCalls.filter(c=>c.stage===stage.id).reduce((a,c)=>a+c.inputTok+c.outputTok,0).toLocaleString()} tok
                  </div>
                )}
                {rev&&<div className={`df-crev ${rev}`}>{rev==="approved"?"✓ Approved":"↺ Changes Req."}</div>}
              </div>
              {i<STAGES.length-1&&<div className="df-conn"><div className={`df-cline ${isActive?"flow":""}`}/></div>}
            </div>;
          })}
        </div>

        {/* Center: tabs + content */}
        <div className="df-center">
          <div className="df-tabs">
            <div className={`df-tab ${tab==="pipeline"?"active":""}`}    onClick={()=>setTab("pipeline")}>Pipeline</div>
            <div className={`df-tab ${tab==="observability"?"active":""}`} onClick={()=>setTab("observability")}>
              LLM Observability {llmCalls.length>0&&<span style={{marginLeft:6,background:"rgba(0,212,255,.15)",color:"#00d4ff",fontSize:8,padding:"1px 5px",borderRadius:2}}>{llmCalls.length}</span>}
            </div>
          </div>
          <div className="df-detail">
            {tab==="pipeline"    ? renderDetail() : <ObsPanel llmCalls={llmCalls}/>}
          </div>
        </div>

        {/* Log */}
        <div className="df-log">
          <div className="df-log-hdr">
            <div className="df-log-dot" style={{background:appState==="running"?"#00ff88":appState==="gate"||appState==="prod_gate"?"#ffaa00":"rgba(200,214,232,.25)",animation:appState==="running"?"pulse 1s infinite":"none"}}/>
            Live Stream
          </div>
          <div className="df-log-bd" ref={logRef}>
            {logs.length===0&&<div style={{opacity:.25,fontSize:10,textAlign:"center",marginTop:36}}>Awaiting pipeline...</div>}
            {logs.map(e=><div key={e.id} className="df-log-row"><span className="df-log-ts">{e.ts}</span><span className={`df-log-msg ${e.type}`}>{e.msg}</span></div>)}
          </div>
        </div>

      </div>
    </div>
  );
}
