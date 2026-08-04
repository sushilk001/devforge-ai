# DevForge AI — Autonomous SDLC Intelligence Engine

> Raw idea → PRD → tasks → code → PR review → QA → deploy. Fully autonomous, human-in-the-loop.

**Author:** Sushil Kumar · [LinkedIn](https://www.linkedin.com/in/sushilk001) · [GitHub](https://github.com/sushilk001)

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.x-orange?style=flat-square)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%205-blueviolet?style=flat-square)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-BSL%201.1-orange?style=flat-square)

---

## Live Demo

**🌐 Live App:** [https://www.devforgeai.in](https://www.devforgeai.in)

**Demo video:** [https://tinyurl.com/DevForgeAI-demoVideo](https://tinyurl.com/DevForgeAI-demoVideo)

![DevForge AI demo](docs/demo.gif)

---

## What It Does

Drop a feature request in Slack or the dashboard — autonomous AI agents handle the rest:

```
"Add forgot-password flow for enterprise users"
        │
        ▼
  📋 Requirements PRD      ← Stage 1 · Claude Sonnet
        │ ⏸ review gate
        ▼
  🗂  Tasks + Linear        ← Stage 2 · dependency graph (Kahn's algorithm)
        │ ⏸ review gate
        ▼
  🔍 PR Review              ← Stage 3 · 4 parallel agents (security, quality, coverage, arch)
        │
        ▼
  💻 Code Generation        ← Stage 4 · full codebase written to disk
        │
        ▼
  🧪 QA                     ← Stage 5 · test runner + pass/fail report
        │
        ▼
  🚀 Deploy                 ← Stage 6 · push to GitHub, open PR, notify Slack
```

Human **review gates** after Stages 1 and 2 — approve to continue, reject with feedback to revise.

---

## Pipeline Status

| Stage | Status | What it does |
|-------|--------|-------------|
| **1 — Requirements** | ✅ | Parses intent → structured PRD (goals, user stories, acceptance criteria) |
| **2 — Task Orchestration** | ✅ | PRD → task graph with estimates + critical path; creates Linear issues |
| **3 — PR Review** | ✅ | 4 parallel reviewer agents produce findings + merged verdict |
| **4 — Code Generation** | ✅ | Full working codebase generated to `output/<slug>/` |
| **5 — QA** | ✅ | Runs generated tests, reports pass/fail per case |
| **6 — Deploy** | ✅ | Push to GitHub branch, open PR, Slack notify, close Linear issues |

---

## Architecture

```
Slack / Dashboard
        │
        ▼
┌─────────────────────────────────────────┐
│  Stage 1 — Requirements Agent           │
│  parse → completeness_check → PRD       │
│                    ⏸ HUMAN GATE         │
│              approve │ reject+feedback  │
└──────────────────────┼──────────────────┘
                       │ approved PRD
                       ▼
┌─────────────────────────────────────────┐
│  Stage 2 — Task Orchestration Agent     │
│  decompose → dependency graph (Kahn's)  │
│                    ⏸ HUMAN GATE         │
│  approve → Linear issues + Slack notify │
└──────────────────────┼──────────────────┘
                       │ tasks
                       ▼
┌─────────────────────────────────────────┐
│  Stage 3 — PR Review (4× parallel)      │
│  security · quality · coverage · arch   │
│  → merge findings → verdict             │
└──────────────────────┼──────────────────┘
                       │ verdict
                       ▼
┌─────────────────────────────────────────┐
│  Stage 4 — Code Generation              │
│  plan → generate files → write to disk  │
└──────────────────────┼──────────────────┘
                       │ codebase
                       ▼
┌─────────────────────────────────────────┐
│  Stage 5 — QA Runner                    │
│  run pytest → pass/fail report          │
└──────────────────────┼──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────┐
│  Stage 6 — Deploy                       │
│  GitHub push → PR → Slack → Linear done │
└─────────────────────────────────────────┘
```

State persisted via **LangGraph `MemorySaver`** — graphs pause at gates and resume exactly where they left off.

---

## Live Dashboard

- **Pipeline view** — submit, approve/reject at each gate, re-run from any stage
- **LLM Observability** — per-call token counts, latency, model, cost estimate
- **Fullscreen code viewer** — browse generated files with syntax highlighting
- **Debug Assistant** — ask Claude why a stage is stuck, powered by live pipeline context
- **Settings** — swap API keys, choose Claude model, add custom model IDs
- **Light / Dark theme** — persisted in `localStorage`

---

## Quick Start

**Prerequisites:** Python 3.10+, Node.js 18+, Anthropic API key

```bash
git clone https://github.com/sushilk001/devforge-ai.git
cd devforge-ai

pip install -r requirements.txt
npm install

cp .env.example .env
# Set ANTHROPIC_API_KEY — everything else is optional
```

```bash
# Terminal 1 — backend (port 8000)
python main.py

# Terminal 2 — dashboard (port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → type a feature request → **▶ LAUNCH**

### Optional integrations

```env
SLACK_BOT_TOKEN=xoxb-...          # Slack notifications + approval buttons
LINEAR_API_KEY=lin_api_...        # Auto-create Linear issues (Stage 2)
GITHUB_TOKEN=ghp_...              # Push code + open PR (Stage 6)
GITHUB_REPO=owner/repo            # Target repo for generated code
```

---

## API Reference

Full interactive docs at **[http://localhost:8000/docs](http://localhost:8000/docs)**

| Stage | Key Endpoints |
|-------|--------------|
| **Stage 1** | `POST /stage1/submit` · `GET /stage1/prd/{id}` · `POST /stage1/review/{id}` |
| **Stage 2** | `POST /stage2/start/{prd_id}` · `GET /stage2/tasks/{id}` · `POST /stage2/review/{id}` |
| **Stage 3** | `POST /stage3/start/{s2_id}` · `GET /stage3/review/{id}` |
| **Stage 4** | `POST /stage4/start/{s2_id}` · `GET /stage4/status/{id}` |
| **Stage 5** | `POST /qa/run/{s4_id}` · `GET /qa/results/{id}` |
| **Stage 6** | `POST /stage6/deploy` · `GET /stage6/status/{id}` |
| **Settings** | `GET /settings` · `POST /settings` |
| **Health** | `GET /health` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / LLM | Claude Sonnet 5 via Anthropic API |
| Orchestration | LangGraph 1.x with `MemorySaver` checkpointing |
| Backend | FastAPI + Uvicorn |
| Schemas | Pydantic v2 |
| Integrations | Slack SDK · Linear GraphQL API · PyGithub |
| Frontend | React 18 + Recharts + Vite |
| Algorithm | Kahn's topological sort + DP critical path |

---

## Project Structure

```
DevForge-AI/
├── agents/
│   ├── stage1/           # Requirements agent
│   ├── stage2/           # Task orchestration agent
│   ├── stage3/           # PR review agent (4 parallel reviewers)
│   └── stage4/           # Code generation agent
├── api/
│   ├── routes.py         # Stage 1 endpoints
│   ├── stage2_routes.py
│   ├── stage3_routes.py
│   ├── stage4_routes.py
│   ├── qa_routes.py
│   ├── stage6_routes.py
│   ├── observability.py  # LLM call tracking
│   └── runtime_config.py # Model + credentials management
├── integrations/
│   ├── slack.py
│   └── linear.py
├── DevForgeDashboard.jsx # React dashboard (single file)
├── main.py               # FastAPI entry point
└── .env.example          # Credential template
```

---

## License

This project is licensed under the **[Business Source License 1.1](LICENSE)**.

- **Free to use** for personal, academic, and internal business purposes
- **Not permitted** to run as a hosted commercial service or compete with devforgeai.in without a separate agreement
- **Converts to Apache 2.0** automatically on 2030-08-05

For commercial licensing: sushil@hackerrank.com

---

*PRs and issues welcome.*
