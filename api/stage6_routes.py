# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import re
import time
import uuid
import socket
import logging
import subprocess
import sys
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException

from config import get_settings
from api.observability import record_llm_call
import api.runtime_config as rc

logger = logging.getLogger(__name__)
settings = get_settings()

router_stage6 = APIRouter(prefix="/stage6", tags=["Stage 6 — Deploy"])


def _slug(prd: dict) -> str:
    """Return a URL-safe slug from the PRD title, or empty string if no title."""
    title = (prd or {}).get("title", "")
    if not title:
        return ""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", title.strip()).strip("-").lower()
    return s[:60]


def _push_to_github(output_dir: Path, branch: str) -> int:
    """Push all generated files to a GitHub branch via Trees API. Returns file count."""
    from github import Github, GithubException, InputGitTreeElement

    if not rc.get_github_token():
        raise ValueError("GITHUB_TOKEN not configured in .env")
    if not rc.get_github_repo():
        raise ValueError("GITHUB_REPO not configured in .env (expected 'owner/repo')")

    g    = Github(rc.get_github_token())
    repo = g.get_repo(rc.get_github_repo())

    files_to_push: list[tuple[str, str]] = []
    for f in sorted(output_dir.rglob("*")):
        if not f.is_file():
            continue
        if "__pycache__" in f.parts or f.suffix == ".pyc":
            continue
        if f.name == "__init__.py" and f.stat().st_size == 0:
            continue
        rel = str(f.relative_to(output_dir))
        try:
            content = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        files_to_push.append((rel, content))

    if not files_to_push:
        raise ValueError("No files found to push in output directory")

    base = repo.get_branch(repo.default_branch)
    tree_elements = [
        InputGitTreeElement(path=p, mode="100644", type="blob", content=c)
        for p, c in files_to_push
    ]
    new_tree   = repo.create_git_tree(tree_elements, base_tree=base.commit.commit.tree)
    new_commit = repo.create_git_commit(
        f"feat: DevForge AI — {branch.replace('feature/', '')}",
        new_tree,
        [base.commit.commit],
    )

    ref_name = f"refs/heads/{branch}"
    try:
        repo.create_git_ref(ref_name, new_commit.sha)
    except GithubException as e:
        if e.status == 422:
            repo.get_git_ref(f"heads/{branch}").edit(new_commit.sha, force=True)
        else:
            raise

    return len(files_to_push)


def _llm_pr_description(prd: dict, branch: str, files_pushed: int,
                         generated: list, qa_result: dict | None,
                         review_findings: list) -> str:
    """Claude writes the PR description. Tracked in LLM observability."""
    import anthropic

    goals_text   = "\n".join(f"- {g}" for g in (prd.get("goals") or [])[:5])
    file_lines   = []
    for task in generated[:6]:
        for f in (task.get("files") or []):
            file_lines.append(f"- `{f.get('filename', '')}` — {f.get('description', '')}")
    files_text = "\n".join(file_lines[:12]) or "_(see branch)_"

    qa_text = "not available"
    if qa_result:
        qa_text = (f"{qa_result.get('passed', 0)} passed, "
                   f"{qa_result.get('failed', 0)} failed, "
                   f"{qa_result.get('errors', 0)} errors "
                   f"({qa_result.get('total', 0)} total)")

    findings_lines = ""
    for fi in review_findings[:5]:
        icon = "🔴" if fi.get("severity") == "blocker" else "⚠️" if fi.get("severity") == "warning" else "ℹ️"
        findings_lines += f"\n- {icon} [{fi.get('agent','').upper()}] {fi.get('title','')}"

    prompt = f"""Write a concise GitHub Pull Request description in Markdown for this AI-generated feature.

## Feature
Title: {prd.get('title', 'Feature')}
Problem: {prd.get('problem_statement', '')}

## Goals
{goals_text}

## Branch
`{branch}` → `main` | Files pushed: {files_pushed}

## Key Files
{files_text}

## QA Results
{qa_text}

## Code Review Findings
{findings_lines or "No findings recorded"}

Write sections: Summary (2–3 sentences), Changes (bullet list), Testing, Checklist.
Under 400 words. Return only Markdown, no wrapper."""

    model = rc.get_model()
    client = anthropic.Anthropic(api_key=rc.get_api_key())
    t0 = time.time()
    response = client.messages.create(
        model=model,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    latency_ms = int((time.time() - t0) * 1000)
    record_llm_call(
        stage="deploy",
        label="stage6/pr-description",
        model=model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        latency_ms=latency_ms,
    )
    return response.content[0].text


def _create_pr(branch: str, pr_title: str, pr_body: str) -> tuple[str, int]:
    from github import Github, GithubException
    g    = Github(rc.get_github_token())
    repo = g.get_repo(rc.get_github_repo())
    try:
        pr = repo.create_pull(
            title=pr_title, body=pr_body,
            head=branch, base=repo.default_branch,
        )
        return pr.html_url, pr.number
    except GithubException as e:
        # PR already exists — return the existing one instead of failing
        if e.status == 422 and "already exists" in str(e.data):
            open_prs = repo.get_pulls(state="open", head=f"{repo.owner.login}:{branch}")
            for pr in open_prs:
                logger.info(f"[Stage6] Returning existing PR #{pr.number}: {pr.html_url}")
                return pr.html_url, pr.number
        raise ValueError(f"GitHub PR creation failed: {e.data}") from e


_stage6_sessions: dict = {}                        # deploy_thread_id → session state
_app_processes: dict[str, subprocess.Popen] = {}  # deploy_thread_id → process

# Ports reserved by DevForge AI itself — never hand these to generated apps
_RESERVED_PORTS = {8000, 3000}


def _port_in_use(port: int) -> bool:
    """Return True if something is actively listening on the port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _find_free_port(start: int = 8001, end: int = 8030) -> int | None:
    """Return the first port in [start, end) that is free and not reserved."""
    # Prune dead processes so their ports become available again
    for tid, proc in list(_app_processes.items()):
        if proc.poll() is not None:
            _app_processes.pop(tid, None)

    # Ports still held by live managed processes
    used_by_us: set[int] = set()
    for sess in _stage6_sessions.values():
        app_url = sess.get("app_url")
        if app_url:
            try:
                used_by_us.add(int(app_url.rsplit(":", 1)[-1]))
            except (ValueError, IndexError):
                pass

    for port in range(start, end):
        if port in _RESERVED_PORTS:
            continue
        if port in used_by_us:
            continue
        if not _port_in_use(port):
            logger.info(f"[Stage6] Port {port} is free — will use for app launch")
            return port
        else:
            logger.debug(f"[Stage6] Port {port} is in use — skipping")

    logger.warning(f"[Stage6] No free port found in range {start}–{end}")
    return None


def _find_entrypoint(output_dir: Path) -> tuple[str, str] | None:
    """Return (module_path, app_var) for the best FastAPI entrypoint.

    Preference order:
    1. Root-level main.py with FastAPI app (the synthesised entrypoint)
    2. Any other .py file with FastAPI app, shallowest depth first
    """
    def _is_fastapi(text: str) -> bool:
        return "FastAPI(" in text and ("app = create_app" in text or "app = FastAPI" in text)

    candidates = []
    for p in output_dir.rglob("*.py"):
        if "__pycache__" in p.parts:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue
        if _is_fastapi(text):
            rel = p.relative_to(output_dir)
            depth = len(rel.parts)
            is_main = rel.name == "main.py"
            candidates.append((not is_main, depth, rel))  # sort: main.py first, then shallowest

    if not candidates:
        return None
    candidates.sort()
    rel = candidates[0][2]
    module = str(rel.with_suffix("")).replace("/", ".").replace("\\", ".")
    return module, "app"


def _launch_app(deploy_thread_id: str, output_dir: Path) -> tuple[str | None, str | None, str | None]:
    """Start the generated app on a free port.
    Returns (app_url, docs_url, error_reason) — app_url/docs_url are None on failure."""
    entry = _find_entrypoint(output_dir)
    if not entry:
        return None, None, "No runnable entrypoint found in generated code."

    module, app_var = entry
    port = _find_free_port()
    if not port:
        return None, None, "No free port available for app launch."

    # Install dependencies if requirements.txt is present
    req_file = output_dir / "requirements.txt"
    if req_file.exists():
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-q", "-r", str(req_file)],
                timeout=30, check=True, capture_output=True,
            )
            logger.info(f"[Stage6] Installed requirements from {req_file}")
        except Exception as e:
            logger.warning(f"[Stage6] pip install failed (continuing anyway): {e}")

    import tempfile, io
    stderr_file = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
    cmd = [sys.executable, "-m", "uvicorn", f"{module}:{app_var}",
           "--host", "0.0.0.0", "--port", str(port)]
    try:
        proc = subprocess.Popen(
            cmd, cwd=str(output_dir),
            stdout=subprocess.DEVNULL, stderr=stderr_file,
        )
        _app_processes[deploy_thread_id] = proc
        # Wait up to 8s for the port to accept connections
        for _ in range(8):
            time.sleep(1)
            if proc.poll() is not None:
                stderr_file.flush(); stderr_file.close()
                try:
                    raw = Path(stderr_file.name).read_text(errors="replace")
                    # Extract the most useful line: ValidationError, ImportError, etc.
                    reason = _extract_launch_error(raw)
                except Exception:
                    reason = f"Process exited (rc={proc.returncode})"
                logger.warning(f"[Stage6] App crashed on startup: {reason}")
                return None, None, reason
            if _port_in_use(port):
                break
        else:
            stderr_file.close()
            proc.kill()
            return None, None, "App did not bind to its port within 8 seconds."
        stderr_file.close()
        app_url  = f"http://localhost:{port}"
        docs_url = f"http://localhost:{port}/docs"
        logger.info(f"[Stage6] App launched: {app_url} (pid={proc.pid})")
        return app_url, docs_url, None
    except Exception as e:
        logger.warning(f"[Stage6] App launch failed: {e}")
        return None, None, str(e)


def _extract_launch_error(stderr: str) -> str:
    """Pull the most useful single line from a uvicorn startup traceback."""
    # Priority: ValidationError field lines, then ImportError, then last non-empty line
    for line in stderr.splitlines():
        line = line.strip()
        if "Field required" in line or "value is not a valid" in line:
            # Grab the setting name from the line above
            pass
        if "ValidationError" in line and "validation error" in line.lower():
            return line
        if line.startswith("pydantic_core") and "ValidationError" in line:
            return line
    for line in stderr.splitlines():
        line = line.strip()
        if line.startswith("ModuleNotFoundError") or line.startswith("ImportError"):
            return line
        if line.startswith("pydantic_core._pydantic_core.ValidationError"):
            return line
    # Fall back to last non-empty meaningful line
    for line in reversed(stderr.splitlines()):
        line = line.strip()
        if line and not line.startswith("File ") and not line.startswith("Traceback"):
            return line[:200]
    return "Startup error — check generated code"


def _run_deploy(deploy_thread_id: str, stage4_thread_id: str,
                stage2_thread_id: str, qa_thread_id: str | None,
                stage3_thread_id: str | None,
                output_dir_override: Path | None = None):
    sess = _stage6_sessions[deploy_thread_id]
    try:
        from api.stage4_routes import _stage4_sessions, _stage4_output_paths
        from api.stage2_routes import _stage2_sessions
        from api.qa_routes     import _qa_sessions
        from api.stage3_routes import _stage3_sessions

        stage4_state = _stage4_sessions.get(stage4_thread_id)
        stage2_state = _stage2_sessions.get(stage2_thread_id)
        qa_session   = _qa_sessions.get(qa_thread_id) if qa_thread_id else None
        stage3_state = _stage3_sessions.get(stage3_thread_id) if stage3_thread_id else None

        # Resolve output directory: explicit override → in-memory path → disk scan
        output_dir = output_dir_override or _stage4_output_paths.get(stage4_thread_id)
        if not output_dir or not output_dir.exists():
            base_output = Path(__file__).parent.parent / "output"
            matches = list(base_output.rglob(stage4_thread_id)) if base_output.exists() else []
            if matches:
                output_dir = matches[0]
                logger.info(f"[Stage6] Recovered output path from disk: {output_dir}")
            elif output_dir_override:
                raise ValueError(f"Output directory not found: {output_dir_override}")
            else:
                raise ValueError(f"Generated code not found — checked memory and {base_output}/{stage4_thread_id}")

        prd       = (stage4_state.prd if stage4_state else {}) or {}
        generated = [
            gt if isinstance(gt, dict) else gt.model_dump()
            for gt in (stage4_state.generated or [])
        ] if stage4_state else []

        linear_issue_ids = list(stage2_state.linear_issue_ids) if stage2_state else []
        qa_result        = qa_session.get("result") if qa_session else None
        review_findings  = [
            f if isinstance(f, dict) else f.model_dump()
            for f in (stage3_state.findings or [])
        ] if stage3_state else []

        slug   = _slug(prd) or output_dir.parent.name  # fall back to output folder name
        branch = f"feature/{slug}"

        # 1 — push to GitHub
        sess["step"] = "pushing"
        files_pushed = _push_to_github(output_dir, branch)
        sess["branch"]       = branch
        sess["files_pushed"] = files_pushed
        logger.info(f"[Stage6] Pushed {files_pushed} files → {branch}")

        # 2 — Claude writes PR description
        sess["step"] = "pr"
        pr_title = prd.get("title", "DevForge AI: Generated Feature")
        pr_body  = _llm_pr_description(
            prd, branch, files_pushed, generated, qa_result, review_findings
        )

        # 3 — create GitHub PR
        pr_url, pr_number = _create_pr(branch, pr_title, pr_body)
        sess["pr_url"]    = pr_url
        sess["pr_number"] = pr_number
        sess["pr_title"]  = pr_title
        logger.info(f"[Stage6] PR #{pr_number}: {pr_url}")

        # 4 — Slack
        sess["step"] = "slack"
        try:
            from integrations.slack import notify_deploy_complete
            sess["slack_ts"] = notify_deploy_complete(
                prd_title=pr_title, pr_url=pr_url, pr_number=pr_number,
                branch=branch, files_pushed=files_pushed,
                qa_summary=qa_result or {}, issues_closed=0,
            )
        except Exception as e:
            logger.warning(f"[Stage6] Slack failed: {e}")

        # 5 — comment PR reference + mark Linear issues Done
        sess["step"] = "linear"
        closed = 0
        if linear_issue_ids:
            try:
                from integrations.linear import mark_issues_done, comment_on_issue
                pr_comment = (
                    f"## 🚀 DevForge AI — Deployed\n\n"
                    f"**Pull Request:** [{pr_title} #{pr_number}]({pr_url})\n"
                    f"**Branch:** `{branch}`\n"
                    f"**Files pushed:** {files_pushed}\n\n"
                    f"Code generated by DevForge AI has been pushed to GitHub and a PR has been opened."
                )
                for issue_id in linear_issue_ids:
                    try:
                        comment_on_issue(issue_id, pr_comment)
                    except Exception as e:
                        logger.warning(f"[Stage6] Linear comment failed for {issue_id}: {e}")
                closed = mark_issues_done(linear_issue_ids)
            except Exception as e:
                logger.warning(f"[Stage6] Linear close failed: {e}")
        sess["linear_issues_closed"] = closed

        # 6 — auto-launch generated app
        sess["step"] = "launching"
        app_url, app_docs_url, app_launch_error = _launch_app(deploy_thread_id, output_dir)
        sess["app_url"]          = app_url
        sess["app_docs_url"]     = app_docs_url
        sess["app_launch_error"] = app_launch_error

        sess["status"] = "complete"
        sess["step"]   = "done"
        logger.info(f"[Stage6] Done. PR={pr_url} files={files_pushed} linear_closed={closed} app={sess.get('app_url')}")

    except Exception as e:
        logger.error(f"[Stage6] Failed: {e}")
        sess["status"] = "error"
        sess["error"]  = str(e)


@router_stage6.get("/output-dirs")
def list_output_dirs():
    """List generated output directories on disk, newest first."""
    base = Path(__file__).parent.parent / "output"
    if not base.exists():
        return []
    dirs = []
    for d in base.iterdir():
        if d.is_dir():
            dirs.append({"name": d.name, "mtime": d.stat().st_mtime})
    dirs.sort(key=lambda x: x["mtime"], reverse=True)
    return [d["name"] for d in dirs]


@router_stage6.post("/deploy")
async def start_deploy(body: dict, background_tasks: BackgroundTasks):
    """Push generated code to GitHub, create PR, notify Slack, close Linear issues.

    Accepts either stage4_thread_id (in-memory session) or output_dir_name
    (disk path under output/) so deploy survives a server restart.
    """
    stage4_thread_id = body.get("stage4_thread_id", "") or ""
    stage2_thread_id = body.get("stage2_thread_id", "") or ""
    output_dir_name  = body.get("output_dir_name")

    # Allow deploy-from-disk: no thread IDs needed if output_dir_name is given
    if not output_dir_name and (not stage4_thread_id or not stage2_thread_id):
        raise HTTPException(400, "Provide stage4_thread_id + stage2_thread_id, or output_dir_name")

    output_dir_override: Path | None = None
    if output_dir_name:
        output_dir_override = Path(__file__).parent.parent / "output" / output_dir_name
        if not output_dir_override.exists():
            raise HTTPException(404, f"Output directory not found: {output_dir_name}")

    deploy_thread_id = str(uuid.uuid4())
    _stage6_sessions[deploy_thread_id] = {
        "status": "running", "step": "starting",
        "stage4_thread_id":     stage4_thread_id,
        "stage2_thread_id":     stage2_thread_id,
        "output_dir_name":      output_dir_name,
        "qa_thread_id":         body.get("qa_thread_id"),
        "stage3_thread_id":     body.get("stage3_thread_id"),
        "branch":               None,
        "pr_url":               None,
        "pr_number":            None,
        "pr_title":             None,
        "files_pushed":         0,
        "linear_issues_closed": 0,
        "slack_ts":             None,
        "app_url":              None,
        "app_docs_url":         None,
        "app_launch_error":     None,
        "error":                None,
    }
    background_tasks.add_task(
        _run_deploy, deploy_thread_id,
        stage4_thread_id, stage2_thread_id,
        body.get("qa_thread_id"), body.get("stage3_thread_id"),
        output_dir_override,
    )
    return {"status": "started", "deploy_thread_id": deploy_thread_id}


@router_stage6.get("/sessions")
def list_sessions():
    return {tid: {k: v for k, v in s.items()} for tid, s in _stage6_sessions.items()}


@router_stage6.get("/status/{deploy_thread_id}")
def get_deploy_status(deploy_thread_id: str):
    sess = _stage6_sessions.get(deploy_thread_id)
    if not sess:
        raise HTTPException(404, "Deploy session not found")
    return sess
