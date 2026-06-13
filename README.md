# DevForge AI — Autonomous SDLC Intelligence Engine

> Hackathon project · Built with Claude AI + LangGraph + FastAPI

---

## Problem Statement

Modern software teams waste enormous time on the manual handoffs between product, engineering, and QA:

- Feature requests arrive as vague Slack messages with no structure
- PMs spend hours writing PRDs that still get rejected and revised in endless loops
- Engineers manually break down requirements into tasks, guessing at dependencies
- No traceability from original request → final deployed feature

The result: **weeks of coordination overhead per feature**, inconsistent quality, and no audit trail.

---

## Solution

DevForge AI is a **fully autonomous SDLC pipeline** that takes a raw feature request from Slack and drives it to production — with AI agents at every stage and humans only reviewing, never doing.

### How AI powers each stage

| Stage | Agent | What it does |
|-------|-------|-------------|
| **1 — Requirements** | Claude Sonnet | Parses intent, fills gaps, generates a structured PRD (goals, user stories, acceptance criteria) |
| **2 — Tasks** | Claude Sonnet | Decomposes approved PRD into 8–14 engineering tasks with estimates, priorities, labels, and a **dependency graph** computed via Kahn's algorithm + DP critical path |
| **3 — PR Review** *(planned)* | 4× Claude Haiku | Security, Quality, Coverage, Architecture agents review in parallel |
| **4 — QA** *(planned)* | Claude Sonnet | Generates test cases from acceptance criteria and runs them |
| **5 — Deploy** *(planned)* | Claude Haiku | Progressive DEV → STAGING → UAT → PROD with rollback gate |

Human-in-the-loop **review gates** sit after every stage. Approvals resume the LangGraph pipeline; rejections trigger AI revision with the feedback incorporated.

---

## Architecture Diagram

```
Slack / API
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 1 — Requirements Agent                                   │
│                                                                 │
│  parse_request ──► check_completeness ──► generate_prd          │
│  (Claude Sonnet)                           (Claude Sonnet)      │
│                                                 │               │
│                                         ⏸ HUMAN REVIEW GATE     │
│                                         (Slack Approve/Reject)  │
│                                    ┌────┴─────┐                 │
│                                 approve     reject+feedback      │
│                                    │            │               │
│                              finalize_prd  revise_prd ──► loop  │
└────────────────────────────────────┼────────────────────────────┘
                                     │ approved PRD
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stage 2 — Task Orchestration Agent                             │
│                                                                 │
│  decompose_tasks ──► build_dependency_graph                     │
│  (Claude Sonnet)     (Kahn's topological sort                   │
│                       + DP critical path)                       │
│                                │                                │
│                        ⏸ HUMAN REVIEW GATE                      │
│                        (Slack Approve/Reject)                   │
│                   ┌────┴─────┐                                  │
│                approve    reject+feedback                        │
│                   │            │                                 │
│       create_linear_issues  revise_tasks ──► rebuild graph ──► loop │
│       (issues + blockers)                                       │
│                   │                                             │
│           notify_slack ──► END                                  │
└─────────────────────────────────────────────────────────────────┘
                                     │
                         Linear issues created
                         with dependency graph
                                     │
                                     ▼
                    Stage 3 (PR Review) — coming soon
```

**State persistence:** Each stage uses `LangGraph MemorySaver` — graphs pause at interrupt points and resume exactly where they left off when the human acts.

---

## Swagger / API Reference

Start the backend and open **[http://localhost:8000/docs](http://localhost:8000/docs)** for the interactive Swagger UI.

### Stage 1 — Requirements Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/stage1/submit` | Submit a feature request; returns PRD + thread ID |
| `GET` | `/stage1/prd/{thread_id}` | Fetch current PRD and status |
| `POST` | `/stage1/review/{thread_id}` | Approve or reject PRD with optional feedback |
| `POST` | `/stage1/slack/events` | Inbound Slack messages (`devforge: <request>`) |
| `POST` | `/stage1/slack/actions` | Slack button callbacks (Approve / Request Changes) |

### Stage 2 — Task Orchestration Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/stage2/start/{prd_thread_id}` | Start task decomposition for an approved PRD |
| `GET` | `/stage2/tasks/{stage2_thread_id}` | Fetch tasks + full dependency graph |
| `POST` | `/stage2/review/{stage2_thread_id}` | Approve (creates Linear issues) or reject with feedback |
| `GET` | `/stage2/sessions` | List all active Stage 2 sessions |
| `POST` | `/stage2/slack/actions` | Slack button callbacks for task approval |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health and active stages |

---

## Execution Steps

### Prerequisites

- Python 3.10+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone <repo>
cd DevForge-AI

# Backend
pip install -r requirements.txt

# Frontend
npm install
```

### 2. Configure environment

Create `.env` in the project root:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional — enables Slack notifications and review buttons
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_PRD_CHANNEL=#devforge-prd

# Optional — enables Linear issue creation in Stage 2
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

### 4. Try the pipeline

**Via dashboard:** Open [http://localhost:3000](http://localhost:3000) → enter a feature request → click **▶ LAUNCH**

**Via API:**

```bash
# Step 1 — submit a feature request
curl -X POST http://localhost:8000/stage1/submit \
  -H "Content-Type: application/json" \
  -d '{"raw_text": "Add forgot-password flow for enterprise users via email. Success = tickets drop 80%, reset in under 2 minutes.", "requester": "alice"}'

# Returns → { "status": "pending_review", "prd": {...}, "message": "...Thread ID: <id>..." }

# Step 2 — approve the PRD (Stage 2 auto-starts)
curl -X POST http://localhost:8000/stage1/review/<thread_id> \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'

# Returns → stage2_thread_id in the message

# Step 3 — check tasks + dependency graph
curl http://localhost:8000/stage2/tasks/<stage2_thread_id>

# Step 4 — approve tasks → Linear issues created
curl -X POST http://localhost:8000/stage2/review/<stage2_thread_id> \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'
```

**Via Slack** (with bot configured):

```
devforge: Add forgot-password flow for enterprise users via email
```

DevForge responds in-thread with the PRD, then posts approve/reject buttons.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / LLM | Claude Sonnet 4 (`claude-sonnet-4-20250514`) via Anthropic API |
| Orchestration | LangGraph 1.x with `MemorySaver` checkpointing |
| Backend | FastAPI + Uvicorn |
| Schemas | Pydantic v2 |
| Integrations | Slack SDK, Linear GraphQL API |
| Frontend | React 18 + Recharts + Vite |
| Algorithm | Kahn's topological sort + DP critical path for dependency graph |
