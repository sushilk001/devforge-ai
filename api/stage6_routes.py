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

logger = logging.getLogger(__name__)
settings = get_settings()

router_stage6 = APIRouter(prefix="/stage6", tags=["Stage 6 — Deploy"])

_stage6_sessions: dict[str, dict] = {}

MODEL = "claude-sonnet-4-6"


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

    if not settings.github_token:
        raise ValueError("GITHUB_TOKEN not configured in .env")
    if not settings.github_repo:
        raise ValueError("GITHUB_REPO not configured in .env (expected 'owner/repo')")

    g    = Github(settings.github_token)
    repo = g.get_repo(settings.github_repo)

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

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    t0 = time.time()
    response = client.messages.create(
        model=MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    latency_ms = int((time.time() - t0) * 1000)
    record_llm_call(
        stage="deploy",
        label="stage6/pr-description",
        model=MODEL,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        latency_ms=latency_ms,
    )
    return response.content[0].text


def _create_pr(branch: str, pr_title: str, pr_body: str) -> tuple[str, int]:
    from github import Github, GithubException
    g    = Github(settings.github_token)
    repo = g.get_repo(settings.github_repo)
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


def _launch_app(deploy_thread_id: str, output_dir: Path) -> tuple[str, str] | None:
    """Start the generated app on a free port. Returns (app_url, docs_url) or None."""
    entry = _find_entrypoint(output_dir)
    if not entry:
        logger.info("[Stage6] No FastAPI entrypoint found — skipping auto-launch")
        return None

    module, app_var = entry
    port = _find_free_port()
    if not port:
        logger.warning("[Stage6] No free port found for app launch")
        return None

    # Install dependencies if requirements.txt is present
    req_file = output_dir / "requirements.txt"
    if req_file.exists():
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-q", "-r", str(req_file)],
                timeout=60, check=True, capture_output=True,
            )
            logger.info(f"[Stage6] Installed requirements from {req_file}")
        except Exception as e:
            logger.warning(f"[Stage6] pip install failed (continuing anyway): {e}")

    cmd = [sys.executable, "-m", "uvicorn", f"{module}:{app_var}",
           "--host", "0.0.0.0", "--port", str(port)]
    try:
        proc = subprocess.Popen(
            cmd, cwd=str(output_dir),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        _app_processes[deploy_thread_id] = proc
        # Give uvicorn a moment to bind
        time.sleep(2)
        if proc.poll() is not None:
            logger.warning(f"[Stage6] App process exited immediately (rc={proc.returncode})")
            return None
        app_url  = f"http://localhost:{port}"
        docs_url = f"http://localhost:{port}/docs"
        logger.info(f"[Stage6] App launched: {app_url} (pid={proc.pid})")
        return app_url, docs_url
    except Exception as e:
        logger.warning(f"[Stage6] App launch failed: {e}")
        return None


def _run_deploy(deploy_thread_id: str, stage4_thread_id: str,
                stage2_thread_id: str, qa_thread_id: str | None,
                stage3_thread_id: str | None):
    sess = _stage6_sessions[deploy_thread_id]
    try:
        from api.stage4_routes import _stage4_sessions, _stage4_output_paths
        from api.stage2_routes import _stage2_sessions
        from api.qa_routes     import _qa_sessions
        from api.stage3_routes import _stage3_sessions

        stage4_state = _stage4_sessions.get(stage4_thread_id)
        stage2_state = _stage2_sessions.get(stage2_thread_id)
        output_dir   = _stage4_output_paths.get(stage4_thread_id)
        qa_session   = _qa_sessions.get(qa_thread_id) if qa_thread_id else None
        stage3_state = _stage3_sessions.get(stage3_thread_id) if stage3_thread_id else None

        # Fallback: scan output/ for a directory matching the thread_id (survives server reload)
        if not output_dir or not output_dir.exists():
            base_output = Path(__file__).parent.parent / "output"
            matches = list(base_output.rglob(stage4_thread_id)) if base_output.exists() else []
            if matches:
                output_dir = matches[0]
                logger.info(f"[Stage6] Recovered output path from disk: {output_dir}")
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
        app_result = _launch_app(deploy_thread_id, output_dir)
        if app_result:
            sess["app_url"], sess["app_docs_url"] = app_result
        else:
            sess["app_url"] = None
            sess["app_docs_url"] = None

        sess["status"] = "complete"
        sess["step"]   = "done"
        logger.info(f"[Stage6] Done. PR={pr_url} files={files_pushed} linear_closed={closed} app={sess.get('app_url')}")

    except Exception as e:
        logger.error(f"[Stage6] Failed: {e}")
        sess["status"] = "error"
        sess["error"]  = str(e)


@router_stage6.post("/deploy")
async def start_deploy(body: dict, background_tasks: BackgroundTasks):
    """Push generated code to GitHub, create PR, notify Slack, close Linear issues."""
    stage4_thread_id = body.get("stage4_thread_id", "")
    stage2_thread_id = body.get("stage2_thread_id", "")
    if not stage4_thread_id or not stage2_thread_id:
        raise HTTPException(400, "stage4_thread_id and stage2_thread_id are required")

    deploy_thread_id = str(uuid.uuid4())
    _stage6_sessions[deploy_thread_id] = {
        "status": "running", "step": "starting",
        "stage4_thread_id":     stage4_thread_id,
        "stage2_thread_id":     stage2_thread_id,
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
        "error":                None,
    }
    background_tasks.add_task(
        _run_deploy, deploy_thread_id,
        stage4_thread_id, stage2_thread_id,
        body.get("qa_thread_id"), body.get("stage3_thread_id"),
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
