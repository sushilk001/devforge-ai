import uuid
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks

from agents.stage1.schemas import (
    SubmitFeatureRequest, PRDResponse, ReviewAction,
    AgentState, FeatureRequest, RequestSource, PRDStatus
)
from agents.stage1.graph import stage1_graph
from integrations.slack import post_prd_for_review, notify_prd_approved, post_incomplete_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stage1", tags=["Stage 1 — Requirements Agent"])

# In-memory store: thread_id → AgentState
# Production: swap for Redis or a DB
_sessions: dict[str, AgentState] = {}


def _coerce_state(result, cls):
    """LangGraph 1.x returns dict from invoke(); coerce to Pydantic model."""
    if isinstance(result, dict):
        return cls(**result)
    return result


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

    initial_state = AgentState(
        feature_request=FeatureRequest(
            raw_text=body.raw_text,
            source=RequestSource.API,
            source_id=thread_id,
            requester=body.requester,
        )
    )

    config = {"configurable": {"thread_id": thread_id}}

    try:
        final_state = _coerce_state(stage1_graph.invoke(initial_state, config=config), AgentState)
        _sessions[thread_id] = final_state

        if final_state.error:
            return PRDResponse(status=PRDStatus.DRAFT, message=final_state.error)

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
        final_state = _coerce_state(stage1_graph.invoke(None, config=config), AgentState)
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
        final_state = _coerce_state(stage1_graph.invoke(None, config=config), AgentState)
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
        text    = event.get("text", "").strip()
        user    = event.get("user", "unknown")
        channel = event.get("channel")
        ts      = event.get("ts")

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
            final_state: AgentState = stage1_graph.invoke(initial_state, config=config)
            _sessions[thread_id] = final_state

            if final_state.error and final_state.parsed_intent:
                post_incomplete_request(channel, final_state.parsed_intent.missing_info, ts)

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
        pass  # Opens a modal or thread reply to collect feedback

    return {"ok": True}
