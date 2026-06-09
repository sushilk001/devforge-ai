import { useState, useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap";
document.head.appendChild(fontLink);

// ── Stages ─────────────────────────────────────────────────────────────────
const STAGES = [
  { id:"requirements",num:"01",label:"Requirements",sub:"Agent",   icon:"◈",color:"#00d4ff",glow:"rgba(0,212,255,0.35)",  desc:"Feature Request → PRD" },
  { id:"tasks",       num:"02",label:"Task Orch.",  sub:"Agent",   icon:"◆",color:"#00ff88",glow:"rgba(0,255,136,0.35)",  desc:"PRD → Linear Tasks" },
  { id:"pr_review",   num:"03",label:"PR Review",   sub:"Panel",   icon:"◉",color:"#ff9500",glow:"rgba(255,149,0,0.35)",  desc:"4 Agents reviewing code" },
  { id:"qa",          num:"04",label:"QA",          sub:"Agent",   icon:"◈",color:"#bf5fff",glow:"rgba(191,95,255,0.35)", desc:"Automated test suite" },
  { id:"deploy",      num:"05",label:"Deploy",      sub:"Pipeline",icon:"▲",color:"#ff2d6b",glow:"rgba(255,45,107,0.35)", desc:"Dev → Staging → UAT → Prod" },
];

// ── Pipeline log scripts ───────────────────────────────────────────────────
const PIPELINE_SCRIPT = {
  requirements:[
    {t:300, msg:"⟡ Receiving feature request from Slack...",      type:"info"},
    {t:900, msg:"⟡ Parsing intent with Claude claude-sonnet-4-20250514...",    type:"info"},
    {t:1600,msg:"✓ Problem statement extracted",                   type:"success"},
    {t:2100,msg:"✓ Target users: [end-users, admins]",             type:"success"},
    {t:2600,msg:"✓ Business value scored: HIGH",                   type:"success"},
    {t:3200,msg:"⟡ Generating PRD document...",                    type:"info"},
    {t:4400,msg:"✓ PRD v1.0 — 6 stories, 8 criteria",             type:"success"},
    {t:5000,msg:"⏸ Awaiting human review...",                      type:"gate"},
  ],
  tasks:[
    {t:300, msg:"⟡ Ingesting approved PRD v1.0...",               type:"info"},
    {t:900, msg:"⟡ Decomposing into dev tasks...",                 type:"info"},
    {t:1500,msg:"✓ Task DEV-101 created [3pts]",                   type:"success"},
    {t:1900,msg:"✓ Task DEV-102 created [5pts]",                   type:"success"},
    {t:2300,msg:"✓ Task DEV-103 created [3pts]",                   type:"success"},
    {t:2700,msg:"✓ Task DEV-104 created [2pts]",                   type:"success"},
    {t:3100,msg:"✓ Task DEV-105 created [3pts]",                   type:"success"},
    {t:3700,msg:"✓ Dependency graph built. Sprint assigned.",      type:"success"},
    {t:4200,msg:"⏸ Awaiting human review...",                      type:"gate"},
  ],
  pr_review:[
    {t:300, msg:"⟡ PR #247 detected — forgot-password feature",   type:"info"},
    {t:700, msg:"⟡ Launching 4-agent panel...",                    type:"info"},
    {t:1000,msg:"🔴 Security Agent     → scanning...",             type:"agent"},
    {t:1200,msg:"🟡 Quality Agent      → analysing...",            type:"agent"},
    {t:1400,msg:"🟢 Coverage Agent     → mapping...",              type:"agent"},
    {t:1600,msg:"🔵 Architecture Agent → checking...",             type:"agent"},
    {t:2800,msg:"✓ Security: No CVEs. No secrets. PASSED",        type:"success"},
    {t:3200,msg:"⚠ Quality: Complexity 12 on resetHandler. WARN", type:"warn"},
    {t:3600,msg:"✓ Coverage: 91%. PASSED",                         type:"success"},
    {t:4000,msg:"✓ Architecture: Clean layering. PASSED",          type:"success"},
    {t:4700,msg:"⟡ Orchestrator: 1 warning, 0 blockers",          type:"info"},
    {t:5200,msg:"⏸ Awaiting human review...",                      type:"gate"},
  ],
  qa:[
    {t:400, msg:"⟡ Generating tests from acceptance criteria...", type:"info"},
    {t:1100,msg:"✓ 14 test cases generated",                       type:"success"},
    {t:1600,msg:"⟡ Running suite on staging...",                   type:"info"},
    {t:2200,msg:"✓ Unit tests      14/14 passed",                  type:"success"},
    {t:2800,msg:"✓ Integration      8/8  passed",                  type:"success"},
    {t:3400,msg:"✓ E2E (Playwright)  5/5  passed",                 type:"success"},
    {t:3900,msg:"✓ Visual regression: 0 diffs",                    type:"success"},
    {t:4400,msg:"⏸ Awaiting human review...",                      type:"gate"},
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

const STAGE_DUR = { requirements:5200, tasks:4400, pr_review:5400, qa:4600, deploy:6200 };

// ── LLM Observability call scripts ────────────────────────────────────────
const LLM_CALL_SCRIPT = {
  requirements:[
    {t:1600, call:{id:1,  stage:"requirements", label:"parse_request",      model:"claude-sonnet-4-20250514", inputTok:342,  outputTok:187,  latencyMs:820,  cost:0.0018}},
    {t:4400, call:{id:2,  stage:"requirements", label:"generate_prd",       model:"claude-sonnet-4-20250514", inputTok:891,  outputTok:1243, latencyMs:3140, cost:0.0089}},
  ],
  tasks:[
    {t:3700, call:{id:3,  stage:"tasks",        label:"generate_tasks",     model:"claude-sonnet-4-20250514", inputTok:1456, outputTok:643,  latencyMs:2280, cost:0.0062}},
  ],
  pr_review:[
    {t:2800, call:{id:4,  stage:"pr_review",    label:"security_agent",     model:"claude-haiku-4-5",         inputTok:2341, outputTok:312,  latencyMs:1240, cost:0.0008}},
    {t:3200, call:{id:5,  stage:"pr_review",    label:"quality_agent",      model:"claude-haiku-4-5",         inputTok:2198, outputTok:428,  latencyMs:1680, cost:0.0009}},
    {t:3600, call:{id:6,  stage:"pr_review",    label:"coverage_agent",     model:"claude-haiku-4-5",         inputTok:1876, outputTok:289,  latencyMs:1120, cost:0.0007}},
    {t:4000, call:{id:7,  stage:"pr_review",    label:"architecture_agent", model:"claude-haiku-4-5",         inputTok:2043, outputTok:356,  latencyMs:1390, cost:0.0008}},
    {t:4700, call:{id:8,  stage:"pr_review",    label:"orchestrator",       model:"claude-sonnet-4-20250514", inputTok:1123, outputTok:478,  latencyMs:1860, cost:0.0041}},
  ],
  qa:[
    {t:4400, call:{id:9,  stage:"qa",           label:"generate_tests",     model:"claude-sonnet-4-20250514", inputTok:1234, outputTok:892,  latencyMs:2640, cost:0.0073}},
  ],
  deploy:[
    {t:3600, call:{id:10, stage:"deploy",       label:"deploy_planner",     model:"claude-haiku-4-5",         inputTok:456,  outputTok:234,  latencyMs:890,  cost:0.0003}},
  ],
};

// ── Review summaries ───────────────────────────────────────────────────────
const REVIEW_SUMMARY = {
  requirements:{ title:"PRD Ready for Review",  verdict:"Claude generated a complete PRD with 6 user stories and 8 acceptance criteria.",
    points:["Problem: No self-service reset → 200+ weekly tickets","Goals: Reduce tickets 80%, flow in <2 mins","6 user stories covering end-users & admins","8 acceptance criteria — Given/When/Then format"],
    approve:"Approve PRD → Begin Task Creation" },
  tasks:{ title:"Sprint Tasks Ready for Review", verdict:"5 tasks created in Linear with effort estimates and a dependency graph.",
    points:["DEV-101: API endpoint (3 pts)","DEV-102: Email service (5 pts)","DEV-103: Token validation (3 pts)","DEV-104: UI reset form (2 pts)","DEV-105: Test suite (3 pts)"],
    approve:"Approve Tasks → Raise PR" },
  pr_review:{ title:"PR Review Complete", verdict:"4-agent panel finished. 1 warning, 0 blockers found.",
    points:["✓ Security: No CVEs, no secrets, injection-clean","⚠ Quality: resetHandler complexity 12 (threshold 10)","✓ Coverage: 91% on auth module","✓ Architecture: Clean separation"],
    approve:"Approve PR → Run QA" },
  qa:{ title:"QA Suite Passed", verdict:"All 27 tests passed across unit, integration, E2E, and visual regression.",
    points:["Unit tests: 14/14 passed","Integration: 8/8 passed","E2E (Playwright): 5/5 passed","Visual regression: 0 diffs"],
    approve:"Approve QA → Production Gate" },
};

const TASKS_DATA = [
  {id:"DEV-101",name:"POST /auth/forgot-password endpoint",   pts:"3 pts"},
  {id:"DEV-102",name:"Email service integration (SendGrid)",  pts:"5 pts"},
  {id:"DEV-103",name:"Token generation, expiry & validation", pts:"3 pts"},
  {id:"DEV-104",name:"UI — Reset password form + success",    pts:"2 pts"},
  {id:"DEV-105",name:"Unit & integration test suite",         pts:"3 pts"},
];
const AGENTS_DATA = [
  {id:"security",name:"Security Agent",    color:"#ff4466",finding:"No CVEs. No hardcoded secrets. SQL injection: clean.",          status:"PASSED",sc:"#00ff88"},
  {id:"quality", name:"Quality Agent",     color:"#ffaa00",finding:"resetHandler complexity: 12 (threshold 10). Refactor advised.", status:"WARN",  sc:"#ff9500"},
  {id:"coverage",name:"Coverage Agent",    color:"#00ff88",finding:"Auth module: 91% coverage. 14/14 critical paths covered.",      status:"PASSED",sc:"#00ff88"},
  {id:"arch",    name:"Architecture Agent",color:"#6699ff",finding:"Clean layering. No direct DB calls in controller.",             status:"PASSED",sc:"#00ff88"},
];
const QA_DATA = [
  {type:"Unit Tests",       count:"14 / 14 passed"},
  {type:"Integration",      count:"8 / 8 passed"},
  {type:"E2E (Playwright)", count:"5 / 5 passed"},
  {type:"Visual Regression",count:"0 diffs"},
];
const ENV_DATA = [{name:"DEV",delay:1000},{name:"STAGING",delay:1800},{name:"UAT",delay:2800}];

const MODEL_COLORS = { "claude-sonnet-4-20250514":"#00d4ff", "claude-haiku-4-5":"#00ff88" };
const STAGE_COLORS = { requirements:"#00d4ff", tasks:"#00ff88", pr_review:"#ff9500", qa:"#bf5fff", deploy:"#ff2d6b" };

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

  // Token chart data
  const tokenData = llmCalls.map(c => ({
    name: c.label.replace("_"," "), input: c.inputTok, output: c.outputTok,
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
                      {c.model === "claude-sonnet-4-20250514" ? "Sonnet 4" : "Haiku 4.5"}
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
            {lbl:"Sonnet 4 calls",val:llmCalls.filter(c=>c.model==="claude-sonnet-4-20250514").length, color:"#00d4ff", sub:"Complex reasoning"},
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
  const [input, setInput]           = useState("Users cannot reset passwords without calling support. We get 200+ tickets/week. We need a self-service forgot-password flow via email for enterprise users.");
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
  const { elapsed, display, reset } = useTimer(appState === "running");

  const toRef    = useRef([]);
  const logRef   = useRef(null);
  const resumeFn = useRef(null);

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
    const llmSc   = LLM_CALL_SCRIPT[stageId] || [];
    const dur     = STAGE_DUR[stageId];
    setActive(stageId); setDetail(stageId);
    setProgress(p => ({...p,[stageId]:0})); setAppState("running");
    for(let i=1;i<=40;i++) T(()=>setProgress(p=>({...p,[stageId]:(i/40)*100})), (dur/40)*i);
    script.forEach(({t,msg,type}) => T(()=>addLog(msg,type), t));
    llmSc.forEach(({t,call}) => T(()=>setLlmCalls(p=>[...p,call]), t));
    T(()=>{
      setDone(p=>new Set([...p,stageId])); setActive(null);
      setAppState("gate"); setGateStage(stageId); setDetail("gate_"+stageId);
      resumeFn.current = onComplete;
    }, dur);
  };

  // ── Launch ─────────────────────────────────────────────────────────────
  const handleLaunch = () => {
    clearAll(); reset();
    setAppState("running"); setActive(null); setDone(new Set()); setReviews({});
    setProgress({}); setLogs([]); setDetail(null); setGateStage(null);
    setShowFB(false); setFb(""); setProdCfm(""); setEnvProg({}); setLlmCalls([]);
    addLog("⟡ DevForge AI pipeline started","info");
    addLog("⟡ Source: Slack #feature-requests","info");

    const s5 = () => {
      addLog("⟡ PRODUCTION DEPLOY INITIATED","handoff");
      runDeploy();
    };
    function s4done() {
      setDone(p=>new Set([...p,"qa"])); setActive(null);
      setAppState("prod_gate"); setDetail("prod_gate");
      addLog("⚠ PRODUCTION GATE — mandatory approval required","gate");
      resumeFn.current = s5;
    }
    const s4 = () => runStage("qa",        s4done);
    const s3 = () => runStage("pr_review", s4);
    const s2 = () => runStage("tasks",     s3);
    T(() => runStage("requirements", s2), 400);
  };

  const runDeploy = () => {
    const dur = STAGE_DUR.deploy;
    setActive("deploy"); setDetail("deploy");
    setProgress(p=>({...p,deploy:0})); setAppState("running");
    for(let i=1;i<=40;i++) T(()=>setProgress(p=>({...p,deploy:(i/40)*100})), (dur/40)*i);
    PIPELINE_SCRIPT.deploy.forEach(({t,msg,type})=>T(()=>addLog(msg,type),t));
    (LLM_CALL_SCRIPT.deploy||[]).forEach(({t,call})=>T(()=>setLlmCalls(p=>[...p,call]),t));
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
          <div className="df-prd-h">📋 Self-Service Password Reset</div>
          <div className="df-ps"><div className="df-pl">Problem</div><div className="df-pt">Enterprise users cannot reset passwords without support — 200+ tickets weekly.</div></div>
          <div className="df-ps"><div className="df-pl">Goals</div>{["Reduce tickets by 80%","Flow complete in <2 minutes","Cover email login users only"].map((g,i)=><div key={i} className="df-pi">{g}</div>)}</div>
          <div className="df-ps"><div className="df-pl">User Stories</div>{["As a user, I want to reset my password via email","As an admin, I want to audit all reset attempts","As a user, I want the link to expire after 15 minutes"].map((s,i)=><div key={i} className="df-pi">{s}</div>)}</div>
        </div>
      </div>
    );
    if(detail==="tasks") {
      const p=progress["tasks"]||0, vis=Math.max(1,Math.floor((p/100)*TASKS_DATA.length));
      return <div><div className="df-dtitle" style={{color:"#00ff88"}}>Task Orchestration</div><div className="df-dsub">Creating 5 tasks in Linear</div><div className="df-tasks">{TASKS_DATA.slice(0,vis).map(t=><div key={t.id} className="df-task"><span className="df-tid">{t.id}</span><span className="df-tname">{t.name}</span><span className="df-tpts">{t.pts}</span></div>)}</div></div>;
    }
    if(detail==="pr_review") {
      const p=progress["pr_review"]||0;
      return <div><div className="df-dtitle" style={{color:"#ff9500"}}>PR Review Panel</div><div className="df-dsub">4 Agents · Simultaneous</div><div className="df-agents">{AGENTS_DATA.map((ag,i)=>{const th=20+i*18,run=p>=th&&p<th+40,dn=p>=th+40;return(<div key={ag.id} className={`df-agent ${run?"running":""} ${dn?(ag.status==="WARN"?"warned":"passed"):""}`} style={{"--ac":ag.color}}><div className="df-agh"><div className="df-agd" style={{background:dn?ag.sc:(run?ag.color:"rgba(200,214,232,.15)"),animation:run?"pulse .8s infinite":"none"}}/><div><div className="df-agname">{ag.name}</div><div className="df-agst" style={{color:dn?ag.sc:"inherit"}}>{dn?ag.status:(run?"SCANNING...":"WAITING")}</div></div></div>{dn&&<div className="df-agf">{ag.finding}</div>}</div>);})}</div></div>;
    }
    if(detail==="qa") {
      const p=progress["qa"]||0, vis=Math.max(1,Math.floor((p/100)*QA_DATA.length));
      return <div><div className="df-dtitle" style={{color:"#bf5fff"}}>QA Agent</div><div className="df-dsub">Automated Test Execution</div><div className="df-qa-list">{QA_DATA.slice(0,vis).map((r,i)=><div key={i} className="df-qa-row"><span className="df-qa-type">{r.type}</span><span className="df-qa-count">{r.count}</span><span className="df-qa-badge">PASS</span></div>)}</div></div>;
    }
    if(detail==="deploy") {
      const allEnvs=[...ENV_DATA.map(e=>e.name),"PRODUCTION"];
      return <div><div className="df-dtitle" style={{color:"#ff2d6b"}}>Deploy Pipeline</div><div className="df-dsub">Progressive Promotion</div><div className="df-envs">{allEnvs.map(name=>{const p=envProg[name]||0,live=p>=100;return(<div key={name} className={`df-env ${live?"live":""}`}><span className="df-env-name">{name}</span><div className="df-env-bar"><div className="df-env-fill" style={{width:`${p}%`}}/></div><span className="df-env-st" style={{color:live?"#00ff88":"rgba(200,214,232,.35)"}}>{live?"✓ LIVE":p>0?"DEPLOYING...":"WAITING"}</span></div>);})}</div></div>;
    }
    if(detail&&detail.startsWith("gate_")) {
      const sid=detail.replace("gate_",""), s=REVIEW_SUMMARY[sid]; if(!s) return null;
      return (<div><div className="df-dtitle" style={{color:"#ffaa00"}}>Human Review Required</div><div className="df-dsub">Stage {STAGES.findIndex(x=>x.id===sid)+1} complete</div><div className="df-gate"><div className="df-gate-hdr"><span className="df-gate-icon">🔍</span><span className="df-gate-title">{s.title}</span></div><div className="df-gate-verdict">{s.verdict}</div><div className="df-gate-pts">{s.points.map((p,i)=><div key={i} className="df-gate-pt">{p}</div>)}</div><div className="df-gate-actions"><button className="df-gate-ok" onClick={handleApprove}>✓ {s.approve}</button><button className="df-gate-rej" onClick={()=>setShowFB(true)}>↺ Request Changes</button></div>{showFB&&<div className="df-fb-wrap"><div className="df-fb-lbl">Describe changes needed</div><textarea className="df-fb-inp" rows={3} value={fb} onChange={e=>setFb(e.target.value)} placeholder="e.g. Add token expiry edge case..."/><button className="df-fb-sub" onClick={handleFBSubmit}>Submit & Re-run Stage</button></div>}</div></div>);
    }
    if(detail==="prod_gate") return (
      <div>
        <div className="df-dtitle" style={{color:"#ff2d6b"}}>Production Deploy Gate</div>
        <div className="df-dsub">Mandatory Approval · Cannot be undone</div>
        <div className="df-prod-gate">
          <div className="df-pg-hdr"><span className="df-pg-icon">⚠️</span><span className="df-pg-title">MANDATORY APPROVAL</span></div>
          <div className="df-pg-sub">You are about to push to PRODUCTION</div>
          <div className="df-pg-checks">{["PRD reviewed & approved","5 Linear tasks completed","PR: 0 blockers, 1 warning acknowledged","QA: 27/27 tests passed","DEV, STAGING, UAT — all green"].map((c,i)=><div key={i} className="df-pg-check"><span className="df-pg-check-ic">✓</span><span>{c}</span></div>)}</div>
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
              <div className={`df-card ${isActive?"active":""} ${isDone&&!isGate?"done":""} ${isGate?"gate":""}`} style={{"--c":isGate?"#ffaa00":stage.color,"--glow":isGate?"rgba(255,170,0,.3)":stage.glow}}>
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
