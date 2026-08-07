# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import asyncio
import re
import uuid
import logging
import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks

from agents.stage1.schemas import (
    SubmitFeatureRequest, PRDResponse, ReviewAction,
    AgentState, FeatureRequest, RequestSource, PRDStatus, RequestType
)
from agents.stage1.graph import stage1_graph
from integrations.slack import post_prd_for_review, notify_prd_approved, post_incomplete_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stage1", tags=["Stage 1 — Requirements Agent"])

# In-memory store: thread_id → AgentState
# Production: swap for Redis or a DB
_sessions: dict[str, AgentState] = {}

# Tracks Slack threads awaiting rejection feedback: channel_ts → stage1 thread_id
_awaiting_slack_feedback: dict[str, str] = {}


def _coerce_state(result, cls):
    """LangGraph 1.x returns dict from invoke(); coerce to Pydantic model."""
    if isinstance(result, dict):
        return cls(**result)
    return result


async def _fetch_github_context(github_url: str) -> str:
    """Fetch README and file tree from a GitHub repo URL. Returns a formatted context string."""
    # Normalise: https://github.com/owner/repo[/...] → owner/repo
    match = re.search(r"github\.com/([^/]+/[^/]+)", github_url)
    if not match:
        return ""
    repo_slug = match.group(1).rstrip("/").split("/")[0] + "/" + match.group(1).rstrip("/").split("/")[1]
    parts: list[str] = [f"## GitHub Repository: {repo_slug}"]

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        # Try README variants
        for branch in ("main", "master"):
            for readme in ("README.md", "readme.md", "README.rst", "README"):
                url = f"https://raw.githubusercontent.com/{repo_slug}/{branch}/{readme}"
                try:
                    r = await client.get(url)
                    if r.status_code == 200:
                        text = r.text[:4000]  # cap at 4k chars
                        parts.append(f"### README\n{text}")
                        break
                except Exception as e:
                    logger.debug("[GitHub ctx] README fetch failed for %s: %s", repo_slug, e)
            else:
                continue
            break

        # Try GitHub API for top-level file tree
        try:
            r = await client.get(
                f"https://api.github.com/repos/{repo_slug}/git/trees/HEAD?recursive=0",
                headers={"Accept": "application/vnd.github+json"},
            )
            if r.status_code == 200:
                tree = r.json().get("tree", [])
                files = [t["path"] for t in tree if t.get("type") == "blob"][:30]
                parts.append("### Top-level files\n" + "\n".join(files))
        except Exception as e:
            logger.warning("[GitHub ctx] File tree fetch failed for %s: %s", repo_slug, e)

    return "\n\n".join(parts) if len(parts) > 1 else ""


def _build_additional_context(body: SubmitFeatureRequest) -> str | None:
    """Combine GitHub fetch result (sync wrapper) + attached files into one context string."""
    parts: list[str] = []
    for f in body.attachments:
        # Truncate very large files to avoid blowing the prompt
        snippet = f.content[:3000] + ("\n...(truncated)" if len(f.content) > 3000 else "")
        parts.append(f"### Attached file: {f.name}\n```\n{snippet}\n```")
    return "\n\n".join(parts) if parts else None


# ── POST /submit ──────────────────────────────────────────────────────────────

@router.post("/submit", response_model=PRDResponse)
async def submit_feature_request(
    body: SubmitFeatureRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit a new feature request to kick off the Requirements Agent.

    1. Parses the request
    2. Checks completeness
    3. Generates a PRD
    4. Posts to Slack for human review
    5. Pauses — resume via POST /stage1/review/{thread_id}
    """
    thread_id = str(uuid.uuid4())

    # Gather additional context from GitHub and attached files
    ctx_parts: list[str] = []
    if body.github_url:
        gh = await _fetch_github_context(body.github_url)
        if gh:
            ctx_parts.append(gh)
    file_ctx = _build_additional_context(body)
    if file_ctx:
        ctx_parts.append(file_ctx)
    additional_context = "\n\n".join(ctx_parts) or None

    initial_state = AgentState(
        feature_request=FeatureRequest(
            raw_text=body.raw_text,
            source=RequestSource.API,
            source_id=thread_id,
            requester=body.requester,
            request_type=body.request_type,
            additional_context=additional_context,
        )
    )

    config = {"configurable": {"thread_id": thread_id}}

    try:
        final_state = _coerce_state(
            await asyncio.to_thread(stage1_graph.invoke, initial_state, config=config),
            AgentState,
        )
        _sessions[thread_id] = final_state

        if final_state.error:
            raise HTTPException(status_code=422, detail=final_state.error)

        if final_state.prd:
            slack_ts = post_prd_for_review(final_state)
            final_state.slack_message_ts = slack_ts
            _sessions[thread_id] = final_state

            return PRDResponse(
                status=PRDStatus.PENDING,
                prd=final_state.prd,
                message=(
                    f"PRD generated and posted to Slack for review. "
                    f"Thread ID: {thread_id}. "
                    f"Call POST /stage1/review/{thread_id} to approve or reject."
                ),
            )

        raise HTTPException(status_code=500, detail="Unexpected graph state — no PRD generated.")

    except Exception as e:
        logger.exception(f"[API Stage1] Error running graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /prd/{thread_id} ──────────────────────────────────────────────────────

@router.get("/prd/{thread_id}", response_model=PRDResponse)
async def get_prd(thread_id: str):
    """Fetch the current PRD and status for a given thread."""
    state = _sessions.get(thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Thread ID not found.")
    return PRDResponse(status=state.prd_status, prd=state.prd, message=f"PRD status: {state.prd_status}")


# ── POST /review/{thread_id} ──────────────────────────────────────────────────

@router.post("/review/{thread_id}", response_model=PRDResponse)
async def review_prd(thread_id: str, body: ReviewAction, background_tasks: BackgroundTasks):
    """
    Human review: approve or reject the PRD.

    approve → finalizes PRD; Stage 2 auto-starts in the background
    reject  → revises PRD using feedback and re-posts to Slack
    """
    state = _sessions.get(thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Thread ID not found.")

    if state.prd_status not in (PRDStatus.PENDING, PRDStatus.REVISED):
        raise HTTPException(
            status_code=400,
            detail=f"PRD not pending review. Current status: {state.prd_status}"
        )

    config = {"configurable": {"thread_id": thread_id}}

    if body.action == "approve":
        stage1_graph.update_state(config, {"prd_status": PRDStatus.APPROVED, "human_feedback": None})
        final_state = _coerce_state(
            await asyncio.to_thread(stage1_graph.invoke, None, config=config),
            AgentState,
        )
        _sessions[thread_id] = final_state
        notify_prd_approved(final_state)

        # Auto-start Stage 2 in background
        background_tasks.add_task(_auto_start_stage2, thread_id)

        return PRDResponse(
            status=PRDStatus.APPROVED,
            prd=final_state.prd,
            message=(
                f"PRD approved! Stage 2 (Task Orchestration) is starting. "
                f"Call POST /stage2/start/{thread_id} or wait for Slack notification."
            ),
        )

    elif body.action == "reject":
        if not body.feedback:
            raise HTTPException(status_code=400, detail="Feedback is required when rejecting a PRD.")

        stage1_graph.update_state(config, {"prd_status": PRDStatus.REJECTED, "human_feedback": body.feedback})
        final_state = _coerce_state(
            await asyncio.to_thread(stage1_graph.invoke, None, config=config),
            AgentState,
        )
        # LangGraph invoke() returns the pre-node checkpoint state (REJECTED), not the node's
        # output state (REVISED). Force-set both the status and version bump manually.
        if final_state.prd and final_state.revision_count > 0:
            final_state.prd.version = f"1.{final_state.revision_count}"
            final_state.prd_status = PRDStatus.REVISED
        _sessions[thread_id] = final_state

        slack_ts = post_prd_for_review(final_state)
        final_state.slack_message_ts = slack_ts
        _sessions[thread_id] = final_state

        return PRDResponse(
            status=PRDStatus.REVISED,
            prd=final_state.prd,
            message=f"PRD revised (v{final_state.prd.version}). Re-posted to Slack.",
        )

    raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'.")


async def _auto_start_stage2(prd_thread_id: str) -> None:
    """Background task: auto-start Stage 2 after PRD approval."""
    try:
        from api.stage2_routes import _start_stage2_internal
        await _start_stage2_internal(prd_thread_id)
    except Exception as e:
        logger.error(f"[API Stage1] Auto-start Stage 2 failed: {e}")


# ── POST /slack/events ────────────────────────────────────────────────────────

@router.post("/slack/events")
async def slack_events(payload: dict):
    """Receive Slack events (feature requests). Handles URL verification challenge."""
    if payload.get("type") == "url_verification":
        return {"challenge": payload["challenge"]}

    event = payload.get("event", {})
    if event.get("type") == "message" and not event.get("subtype"):
        text       = event.get("text", "").strip()
        user       = event.get("user", "unknown")
        channel    = event.get("channel")
        ts         = event.get("ts")
        thread_ts  = event.get("thread_ts")

        # Thread reply = feedback on a rejected PRD
        if thread_ts and not text.lower().startswith("devforge:"):
            key = f"{channel}:{thread_ts}"
            s1_tid = _awaiting_slack_feedback.pop(key, None)
            if s1_tid:
                from fastapi import BackgroundTasks as BT
                try:
                    await review_prd(s1_tid, ReviewAction(action="reject", feedback=text), BT())
                    logger.info(f"[Slack] PRD {s1_tid} rejected with feedback via thread reply")
                except Exception as e:
                    logger.warning(f"[Slack] thread feedback failed: {e}")
                return {"ok": True}

        if text.lower().startswith("devforge:"):
            raw_text  = text[len("devforge:"):].strip()
            thread_id = ts

            initial_state = AgentState(
                feature_request=FeatureRequest(
                    raw_text=raw_text,
                    source=RequestSource.SLACK,
                    source_id=thread_id,
                    requester=user,
                )
            )
            config = {"configurable": {"thread_id": thread_id}}
            try:
                final_state = _coerce_state(
                    stage1_graph.invoke(initial_state, config=config), AgentState
                )
                _sessions[thread_id] = final_state
                if final_state.error and final_state.parsed_intent:
                    post_incomplete_request(channel, final_state.parsed_intent.missing_info, ts)
            except Exception as exc:
                logger.exception("[Slack] Stage1 graph error for ts=%s: %s", ts, exc)

    return {"ok": True}


# ── POST /slack/actions ───────────────────────────────────────────────────────

@router.post("/slack/actions")
async def slack_actions(payload: dict, background_tasks: BackgroundTasks):
    """Handle Slack interactive button clicks (Approve / Request Changes on PRD)."""
    actions = payload.get("actions", [])
    if not actions:
        return {"ok": True}

    action    = actions[0]
    action_id = action.get("action_id")
    thread_id = action.get("value")

    if action_id == "approve_prd":
        await review_prd(thread_id, ReviewAction(action="approve"), background_tasks)
    elif action_id == "reject_prd":
        from integrations.slack import client as slack_client
        from config import get_settings
        state = _sessions.get(thread_id)
        if state and state.slack_message_ts:
            channel = get_settings().slack_prd_channel
            try:
                slack_client.chat_postMessage(
                    channel=channel,
                    thread_ts=state.slack_message_ts,
                    text="↺ *Changes requested.* Reply in this thread with your feedback to regenerate the PRD.",
                )
                _awaiting_slack_feedback[f"{channel}:{state.slack_message_ts}"] = thread_id
            except Exception as e:
                logger.warning(f"[Slack] reject reply failed: {e}")

    return {"ok": True}
