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

# In-memory store mapping thread_id → AgentState
# In production: swap for Redis or a DB
_sessions: dict[str, AgentState] = {}


# ── POST /submit ─────────────────────────────────────────────────────────────

@router.post("/submit", response_model=PRDResponse)
async def submit_feature_request(
    body: SubmitFeatureRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit a new feature request to kick off the Requirements Agent pipeline.

    The agent will:
    1. Parse the request
    2. Check completeness
    3. Generate a PRD
    4. Post it to Slack for human review
    5. Pause and wait (human calls /review to continue)
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
        # Run graph until it hits the interrupt (after generate_prd)
        final_state: AgentState = stage1_graph.invoke(initial_state, config=config)

        # Store state for later resume
        _sessions[thread_id] = final_state

        # Incomplete request — tell caller what's missing
        if final_state.error:
            return PRDResponse(
                status=PRDStatus.DRAFT,
                message=final_state.error,
            )

        # PRD generated and paused for review — post to Slack
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
                    f"Call POST /stage1/review/{{thread_id}} to approve or reject."
                ),
            )

        raise HTTPException(status_code=500, detail="Unexpected graph state — no PRD generated.")

    except Exception as e:
        logger.exception(f"[API] Error running Stage 1 graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /prd/{thread_id} ──────────────────────────────────────────────────────

@router.get("/prd/{thread_id}", response_model=PRDResponse)
async def get_prd(thread_id: str):
    """Fetch the current PRD and status for a given thread."""
    state = _sessions.get(thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Thread ID not found.")

    return PRDResponse(
        status=state.prd_status,
        prd=state.prd,
        message=f"PRD status: {state.prd_status}",
    )


# ── POST /review/{thread_id} ──────────────────────────────────────────────────

@router.post("/review/{thread_id}", response_model=PRDResponse)
async def review_prd(thread_id: str, body: ReviewAction):
    """
    Human review endpoint. Call this to approve or reject a PRD.

    - approve  → Finalizes the PRD (Stage 2 will pick it up)
    - reject   → Revises PRD using provided feedback and re-posts to Slack
    """
    state = _sessions.get(thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Thread ID not found.")

    if state.prd_status not in (PRDStatus.PENDING, PRDStatus.REVISED):
        raise HTTPException(
            status_code=400,
            detail=f"PRD is not pending review. Current status: {state.prd_status}"
        )

    config = {"configurable": {"thread_id": thread_id}}

    if body.action == "approve":
        state.prd_status = PRDStatus.APPROVED
        state.human_feedback = None
        final_state: AgentState = stage1_graph.invoke(state, config=config)
        _sessions[thread_id] = final_state
        notify_prd_approved(final_state)

        return PRDResponse(
            status=PRDStatus.APPROVED,
            prd=final_state.prd,
            message="PRD approved! Stage 2 (Task Orchestration) will now begin.",
        )

    elif body.action == "reject":
        if not body.feedback:
            raise HTTPException(status_code=400, detail="Feedback is required when rejecting a PRD.")

        state.prd_status = PRDStatus.REJECTED
        state.human_feedback = body.feedback
        final_state: AgentState = stage1_graph.invoke(state, config=config)
        _sessions[thread_id] = final_state

        # Re-post revised PRD to Slack
        slack_ts = post_prd_for_review(final_state)
        final_state.slack_message_ts = slack_ts
        _sessions[thread_id] = final_state

        return PRDResponse(
            status=PRDStatus.REVISED,
            prd=final_state.prd,
            message=f"PRD revised (v{final_state.prd.version}). Re-posted to Slack for review.",
        )

    raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'.")


# ── POST /slack/events ────────────────────────────────────────────────────────

@router.post("/slack/events")
async def slack_events(payload: dict):
    """
    Receive Slack events (feature requests posted in a channel).
    Also handles Slack URL verification challenge.
    """
    # Slack URL verification
    if payload.get("type") == "url_verification":
        return {"challenge": payload["challenge"]}

    event = payload.get("event", {})

    # Only handle direct messages or messages in watched channel
    if event.get("type") == "message" and not event.get("subtype"):
        text    = event.get("text", "").strip()
        user    = event.get("user", "unknown")
        channel = event.get("channel")
        ts      = event.get("ts")

        if text.lower().startswith("devforge:"):
            raw_text = text[len("devforge:"):].strip()
            thread_id = ts  # Use Slack message TS as thread ID

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
async def slack_actions(payload: dict):
    """
    Handle Slack interactive button clicks (Approve / Request Changes on PRD).
    """
    actions = payload.get("actions", [])
    if not actions:
        return {"ok": True}

    action    = actions[0]
    action_id = action.get("action_id")
    thread_id = action.get("value")

    if action_id == "approve_prd":
        await review_prd(thread_id, ReviewAction(action="approve"))

    elif action_id == "reject_prd":
        # For Slack button rejection, open a modal or ask in thread for feedback
        # Simplified: use a default feedback request message
        pass

    return {"ok": True}
