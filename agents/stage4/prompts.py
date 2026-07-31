CODE_GEN_PROMPT = """You are an expert software engineer generating production-quality code for a specific engineering task.

Task Title: {task_title}
Task Description: {task_description}
Task Type: {task_type}

PRD Context:
{prd_context}

Generate 1 implementation file and 1 test file for this task. Rules:
- Write clean, production-quality code — NO stubs, NO TODO comments, NO placeholder logic
- Match the language and framework implied by the task:
  - Backend tasks → Python (FastAPI, Pydantic, SQLAlchemy as appropriate)
  - Frontend tasks → TypeScript + React (functional components, hooks)
  - API integration tasks → Python with httpx or requests
  - Database tasks → Python with SQLAlchemy or raw SQL migrations
- Use realistic variable names, function names, and module paths derived from the PRD context
- Implementation file: real business logic, proper error handling, type annotations
- Test file: pytest (Python) or vitest/jest (TypeScript) with at least 3 meaningful test cases
- Keep each file under 80 lines for demo clarity
- Use the PRD context to infer correct domain models, field names, and logic
- CRITICAL: Both files must be fully self-contained — ZERO cross-module imports to other generated files.
  * Implementation: ALWAYS import real third-party packages (httpx, whois, requests, ssl, certifi, etc.) — do NOT stub them. Only stub OTHER generated src.* modules: if your logic needs a DB session, config object, or another src.* class, define it as an inline Protocol/TypedDict stub. Never import from src.db, src.config, src.main, or any other src.* module.
  * Tests: only import from the implementation file generated alongside them. Use unittest.mock.patch or monkeypatch for external HTTP calls. Never import from src.main or app fixtures.

Return ONLY a JSON object with this exact structure:
{{
  "files": [
    {{
      "filename": "src/path/to/implementation.ext",
      "language": "python|typescript|javascript",
      "content": "actual full code here",
      "description": "one sentence describing what this file does"
    }},
    {{
      "filename": "tests/path/to/test_implementation.ext",
      "language": "python|typescript|javascript",
      "content": "actual full test code here",
      "description": "one sentence describing what this test file covers"
    }}
  ],
  "summary": "one sentence describing what was generated for this task"
}}

Return valid JSON only — no markdown fences, no explanation outside the JSON."""

ENTRYPOINT_PROMPT = """You are an expert software engineer. The following files have been generated for a project.
Your job is to produce exactly 2 files that make the project launchable:

1. `main.py` — a FastAPI entry point that imports every route module below as an APIRouter and registers it.
   - Create a FastAPI app instance.
   - For EACH Python implementation file listed, import its router (assume each exposes `router = APIRouter()`).
     If the file does not export a router (e.g. it is a utility or model file), skip it.
   - Mount all routers with appropriate prefixes derived from their paths.
   - Include a `/health` GET endpoint returning {{"status": "ok"}}.
   - No stubs, no TODO comments.

2. `requirements.txt` — list every third-party package actually used across all files below.
   Always include: fastapi, uvicorn[standard], pydantic. Add others only if actually imported.

PRD title: {prd_title}

Generated implementation files (filename → first 30 lines of content):
{file_summaries}

Return ONLY a JSON object:
{{
  "files": [
    {{
      "filename": "main.py",
      "language": "python",
      "content": "full main.py content here",
      "description": "FastAPI entry point wiring all generated routers"
    }},
    {{
      "filename": "requirements.txt",
      "language": "text",
      "content": "fastapi\\nuvicorn[standard]\\npydantic\\n...",
      "description": "Third-party dependencies for this project"
    }}
  ],
  "summary": "Entry point and requirements generated"
}}

Return valid JSON only — no markdown fences."""
