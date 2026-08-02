# DevForge AI — Autonomous SDLC Intelligence Engine

> Raw feature request → structured PRD → task graph → code → PR review → QA, all driven by Claude AI

**Author:** Sushil Kumar · [LinkedIn](https://www.linkedin.com/in/sushilk001) · [GitHub](https://github.com/sushilk001)

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.x-orange?style=flat-square)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%205-blueviolet?style=flat-square)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)

---

## What It Does

DevForge AI eliminates the manual coordination overhead in software delivery. Drop a raw feature request in Slack — or type it in the dashboard — and autonomous AI agents handle every stage:

```
"Add forgot-password flow for enterprise users"
        │
        ▼
  📋 Structured PRD          ← Stage 1 (Claude Sonnet)
        │ ← human approve/reject
        ▼
  🗂  Task graph + Linear      ← Stage 2 (Claude Sonnet + Kahn's algorithm)
        │ ← human approve/reject
        ▼
  🔍 Parallel PR review       ← Stage 3 (4× agents: security, quality, coverage, architecture)
        │
        ▼
  💻 Full codebase generation  ← Stage 4 (Claude Sonnet → real files on disk)
        │
        ▼
  🧪 Automated QA              ← Stage 5 (test runner + pass/fail report)
        │
        ▼
  🚀 Deploy pipeline           ← Stage 6 (DEV → STAGING → UAT → PROD)
```

Human-in-the-loop **review gates** sit after every stage. Approvals resume the LangGraph pipeline; rejections feed the feedback directly back to the AI for revision.

---

## What's Live Today

| Stage | Status | What it does |
|-------|--------|-------------|
| **1 — Requirements** | ✅ Complete | Parses intent, clarifies ambiguity, generates structured PRD (goals, user stories, acceptance criteria) |
| **2 — Task Orchestration** | ✅ Complete | Decomposes PRD → 8–14 tasks with estimates, priorities, dependency graph via Kahn's topological sort + DP critical path; creates Linear issues |
| **3 — PR Review** | ✅ Complete | 4 parallel reviewer agents (Security, Quality, Coverage, Architecture) each produce findings + a merged verdict |
| **4 — Code Generation** | ✅ Complete | Generates a full working codebase to `output/<project-slug>/`; files streamed to disk |
| **5 — QA** | ✅ Complete | Runs generated tests, reports pass/fail per test case |
| **6 — Deploy** | 🔧 In progress | Progressive rollout DEV → STAGING → UAT → PROD with rollback gate |

---

## Architecture

```
Slack / Dashboard
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  Stage 1 — Requirements Agent                                    │
│                                                                  │
│  parse_request ──► check_completeness ──► generate_prd           │
│                                                │                 │
│                                        ⏸ HUMAN REVIEW GATE       │
│                                   ┌────┴─────┐                  │
│                                approve     reject+feedback        │
│                                   │            │                 │
│                             finalize_prd  revise_prd ──► loop    │
└───────────────────────────────────┼─────────────────────────────┘
                                    │ approved PRD
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  Stage 2 — Task Orchestration Agent                              │
│                                                                  │
│  decompose_tasks ──► build_dependency_graph                      │
│  (Claude Sonnet)     (Kahn's topological sort + DP critical path)│
│                               │                                  │
│                       ⏸ HUMAN REVIEW GATE                        │
│                  ┌────┴─────┐                                    │
│               approve    reject+feedback                          │
│                  │            │                                   │
│      create_linear_issues  revise_tasks ──► rebuild graph ──► loop│
│                  │                                               │
│          notify_slack ──► END                                    │
└───────────────────────────────┼──────────────────────────────────┘
                                │ tasks + Linear issues
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Stage 3 — PR Review Agent                                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  security_reviewer  ┐                                    │   │
│  │  quality_reviewer   ├──► merge_findings ──► final_verdict│   │
│  │  coverage_reviewer  │                                    │   │
│  │  arch_reviewer      ┘                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ review verdict
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Stage 4 — Code Generation Agent                                 │
│                                                                  │
│  plan_architecture ──► generate_files ──► write_to_disk          │
│                         (Claude Sonnet)    output/<project>/     │
└──────────────────────────────────────────────────────────────────┘
```

**State persistence:** Each stage uses `LangGraph MemorySaver` — graphs pause at interrupt points and resume exactly where they left off when the human acts.

---

## Live Dashboard

The React dashboard gives you a real-time view of every pipeline run:

- **Pipeline control** — submit requests, approve/reject at each stage
- **LLM Observability** — per-call token counts, latency, model used, cost estimate
- **Stage cards** — live status for all 6 stages with log streaming
- **Settings panel** — swap API keys, choose Claude model, add custom model IDs
- **Light / Dark theme** — persisted in `localStorage`

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone <repo>
cd DevForge-AI

# Backend
pip install -r requirements.txt

# Frontend
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (minimum required)
```

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional — Slack notifications and human review buttons
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_PRD_CHANNEL=#devforge-prd

# Optional — Linear issue creation (Stage 2)
LINEAR_API_KEY=...
LINEAR_TEAM_ID=...
```

### 3. Run

```bash
# Terminal 1 — backend API (port 8000)
python main.py

# Terminal 2 — dashboard UI (port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → type a feature request → click **▶ LAUNCH**

---

## Try the Full Pipeline via API

```bash
# Step 1 — submit a feature request
curl -X POST http://localhost:8000/stage1/submit \
  -H "Content-Type: application/json" \
  -d '{"raw_text": "Add forgot-password flow for enterprise users via email. Success = tickets drop 80%, reset in under 2 minutes.", "requester": "alice"}'
# Returns → { "status": "pending_review", "prd": {...}, "thread_id": "..." }

# Step 2 — approve PRD → Stage 2 starts automatically
curl -X POST http://localhost:8000/stage1/review/<thread_id> \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'
# Returns → stage2_thread_id

# Step 3 — check tasks + dependency graph
curl http://localhost:8000/stage2/tasks/<stage2_thread_id>

# Step 4 — approve tasks → Linear issues created, Stage 3 queued
curl -X POST http://localhost:8000/stage2/review/<stage2_thread_id> \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'
```

**Via Slack** (with bot configured):
```
devforge: Add forgot-password flow for enterprise users via email
```
DevForge responds in-thread with the PRD, then posts Approve / Request Changes buttons.

---

## API Reference

Start the backend and open **[http://localhost:8000/docs](http://localhost:8000/docs)** for the full interactive Swagger UI.

| Stage | Key Endpoints |
|-------|--------------|
| **Stage 1** | `POST /stage1/submit` · `GET /stage1/prd/{id}` · `POST /stage1/review/{id}` |
| **Stage 2** | `POST /stage2/start/{prd_id}` · `GET /stage2/tasks/{id}` · `POST /stage2/review/{id}` |
| **Stage 3** | `POST /stage3/start/{s2_id}` · `GET /stage3/review/{id}` |
| **Stage 4** | `POST /stage4/start/{s2_id}` · `GET /stage4/status/{id}` |
| **QA** | `POST /qa/run/{s4_id}` · `GET /qa/results/{id}` |
| **Settings** | `GET /settings` · `POST /settings` · `POST /settings/custom-models` |
| **Health** | `GET /health` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / LLM | Claude Sonnet 5 (`claude-sonnet-5`) via Anthropic API |
| Orchestration | LangGraph 1.x with `MemorySaver` checkpointing |
| Backend | FastAPI + Uvicorn |
| Schemas | Pydantic v2 |
| Integrations | Slack SDK, Linear GraphQL API |
| Frontend | React 18 + Recharts + Vite |
| Algorithm | Kahn's topological sort + DP critical path for task dependency graph |

---

## Project Structure

```
DevForge-AI/
├── agents/
│   ├── stage1/          # Requirements agent (LangGraph graph + nodes + prompts)
│   ├── stage2/          # Task orchestration agent
│   ├── stage3/          # PR review agent (4 parallel reviewers)
│   └── stage4/          # Code generation agent
├── api/
│   ├── routes.py        # Stage 1 endpoints
│   ├── stage2_routes.py
│   ├── stage3_routes.py
│   ├── stage4_routes.py
│   ├── qa_routes.py
│   ├── stage6_routes.py
│   ├── observability.py # LLM call tracking
│   └── runtime_config.py# Model + credentials management
├── DevForgeDashboard.jsx# React dashboard (single-file)
├── main.py              # FastAPI app entry point
├── .env.example         # Credential template
└── output/              # Generated codebases land here (gitignored)
```

---

*PRs and issues welcome.*
