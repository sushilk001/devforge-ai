import re
import time
import uuid
import logging
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
    title = (prd or {}).get("title", "") or "devforge-run"
    s = re.sub(r"[^a-zA-Z0-9]+", "-", title.strip()).strip("-").lower()
    return s[:60] or "devforge-run"


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
        raise ValueError(f"GitHub PR creation failed: {e.data}") from e


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

        if not output_dir or not output_dir.exists():
            raise ValueError(f"Generated code not found at {output_dir}")

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

        slug   = _slug(prd)
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

        sess["status"] = "complete"
        sess["step"]   = "done"
        logger.info(f"[Stage6] Done. PR={pr_url} files={files_pushed} linear_closed={closed}")

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
        "error":                None,
    }
    background_tasks.add_task(
        _run_deploy, deploy_thread_id,
        stage4_thread_id, stage2_thread_id,
        body.get("qa_thread_id"), body.get("stage3_thread_id"),
    )
    return {"status": "started", "deploy_thread_id": deploy_thread_id}


@router_stage6.get("/status/{deploy_thread_id}")
def get_deploy_status(deploy_thread_id: str):
    sess = _stage6_sessions.get(deploy_thread_id)
    if not sess:
        raise HTTPException(404, "Deploy session not found")
    return sess
