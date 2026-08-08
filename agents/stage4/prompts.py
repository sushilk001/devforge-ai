# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
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
- SQLAlchemy type safety: NEVER use `TIMESTAMPTZ` — it does not exist in SQLAlchemy. Use `sa.DateTime(timezone=True)` or `sa.TIMESTAMP(timezone=True)` for timestamptz columns. Only import `UUID`, `JSONB`, `ARRAY`, `INET`, `CIDR`, `TSVECTOR` from `sqlalchemy.dialects.postgresql`; all other column types come from `sqlalchemy` directly.
- FastAPI route parameters: Route function parameters MUST be Pydantic BaseModel subclasses (body), Python primitives (str/int/float/bool and Optional thereof) for path/query params, or Header()/Depends() helpers. NEVER use Protocol, TypedDict, dataclasses, or any custom class as a route parameter — FastAPI cannot resolve them and raises FastAPIError. If a route calls business logic that needs a DB stub, pass it as a local variable inside the route body (e.g. `db = None`), not as a function parameter.

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
Your job is to produce exactly 2 files that make the project launchable.

First, determine the project type from the imports and content in the files below:
- CLI project: any file imports `click` or `typer`
- FastAPI/web project: any file imports `fastapi` and has a `router = APIRouter()` pattern
- Script/other: neither of the above

Then generate the appropriate `main.py`:

**If CLI project (click/typer detected):**
- Generate `main.py` as a Click/Typer CLI assembler.
- Import each command group or command from the implementation files.
- Add all commands to a top-level `cli` group.
- End with `if __name__ == "__main__": cli()`.
- Do NOT add FastAPI or uvicorn unless the project explicitly has HTTP routes.

**If FastAPI/web project:**
- Generate `main.py` as a FastAPI app that imports every `router = APIRouter()` from the files.
- Mount all routers with appropriate prefixes.
- Include a `/health` GET endpoint returning {{"status": "ok"}}.
- CRITICAL lifespan rule: Scan the full file content below for any `async def lifespan` or `@asynccontextmanager` that manages DB/Redis startup. If found, import that exact name and pass it to FastAPI: `app = FastAPI(lifespan=<exact_name>)`. NEVER invent function names like `init_db`, `close_db`, `setup_db`, `startup`, `shutdown` — import ONLY names that actually appear as `def` or `async def` in the files below. If no lifespan is found, do not add one.

**If script/other:**
- Generate `main.py` as a simple script that imports and calls the main entry function.

For `requirements.txt`:
- List every third-party package actually imported across all files.
- For CLI projects: include click or typer (whichever is used), plus any other real imports.
- For FastAPI projects: include fastapi, uvicorn[standard], pydantic, plus others.
- Always include `pytest`, `pytest-asyncio`, `anyio[asyncio]` for the test suite.
- Do NOT add fastapi/uvicorn to a CLI-only project.

Also generate a `conftest.py` at the project root with:
```python
import pytest

pytest_plugins = ("anyio",)
```
This enables async test support for all `@pytest.mark.asyncio` tests.

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
      "description": "Entry point appropriate for this project type"
    }},
    {{
      "filename": "requirements.txt",
      "language": "text",
      "content": "package1\\npackage2\\n...",
      "description": "Third-party dependencies for this project"
    }},
    {{
      "filename": "conftest.py",
      "language": "python",
      "content": "import pytest\\n\\npytest_plugins = (\\"anyio\\",)\\n",
      "description": "Pytest configuration enabling async test support"
    }}
  ],
  "summary": "Entry point, requirements, and pytest config generated"
}}

Return valid JSON only — no markdown fences."""
