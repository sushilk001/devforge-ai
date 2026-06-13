import uuid
import logging
from fastapi import APIRouter, HTTPException

from agents.stage2.schemas import (
    TasksResponse, TaskReviewAction, Stage2State, TaskStatus
)
from agents.stage2.graph import stage2_graph
from agents.stage1.schemas import PRDStatus
from integrations.slack import post_tasks_for_review

logger = logging.getLogger(__name__)
router_stage2 = APIRouter(prefix="/stage2", tags=["Stage 2 — Task Orchestration"])

# In-memory store: stage2_thread_id → Stage2State
_stage2_sessions: dict[str, Stage2State] = {}


def _coerce_s2(result) -> Stage2State:
    """LangGraph 1.x returns dict from invoke(); coerce to Stage2State."""
    if isinstance(result, dict):
        return Stage2State(**result)
    return result


# ── POST /start/{prd_thread_id} ───────────────────────────────────────────────

@router_stage2.post("/start/{prd_thread_id}", response_model=TasksResponse)
async def start_task_orchestration(prd_thread_id: str):
    """
    Start Stage 2: decompose the approved PRD into engineering tasks.
    Generates tasks, builds the dependency graph, posts to Slack for review.
    Requires the PRD thread to be APPROVED.
    """
    from api.routes import _sessions

    prd_state = _sessions.get(prd_thread_id)
    if not prd_state:
        raise HTTPException(status_code=404, detail=f"PRD thread '{prd_thread_id}' not found.")
    if prd_state.prd_status != PRDStatus.APPROVED:
        raise HTTPException(
            status_code=400,
            detail=f"PRD is not approved. Current status: {prd_state.prd_status}"
        )

    stage2_thread_id = str(uuid.uuid4())
    initial_state = Stage2State(
        prd_thread_id=prd_thread_id,
        stage2_thread_id=stage2_thread_id,
        prd=prd_state.prd.model_dump(),
    )

    config = {"configurable": {"thread_id": stage2_thread_id}}

    try:
        final_state = _coerce_s2(stage2_graph.invoke(initial_state, config=config))
        _stage2_sessions[stage2_thread_id] = final_state

        if final_state.error:
            return TasksResponse(
                status="error",
                message=final_state.error,
                thread_id=stage2_thread_id,
            )

        # Post to Slack for human task review
        slack_ts = post_tasks_for_review(final_state)
        final_state.slack_message_ts = slack_ts
        _stage2_sessions[stage2_thread_id] = final_state

        graph_summary = ""
        if final_state.dependency_graph:
            g = final_state.dependency_graph
            graph_summary = (
                f" Critical path: {len(g.critical_path)} tasks. "
                f"Total: {g.total_estimated_hours}h across {len(g.parallel_tracks)} parallel tracks."
            )

        return TasksResponse(
            status=final_state.task_status.value,
            tasks=final_state.tasks,
            dependency_graph=final_state.dependency_graph,
            message=(
                f"Generated {len(final_state.tasks)} tasks.{graph_summary} "
                f"Posted to Slack for review. Stage 2 thread: {stage2_thread_id}. "
                f"Call POST /stage2/review/{stage2_thread_id} to approve or reject."
            ),
            thread_id=stage2_thread_id,
        )

    except Exception as e:
        logger.exception(f"[API Stage2] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _start_stage2_internal(prd_thread_id: str) -> Stage2State | None:
    """Internal helper — called by Stage 1 auto-trigger background task."""
    try:
        from api.routes import _sessions
        prd_state = _sessions.get(prd_thread_id)
        if not prd_state or prd_state.prd_status != PRDStatus.APPROVED:
            return None

        stage2_thread_id = str(uuid.uuid4())
        initial_state = Stage2State(
            prd_thread_id=prd_thread_id,
            stage2_thread_id=stage2_thread_id,
            prd=prd_state.prd.model_dump(),
        )
        config = {"configurable": {"thread_id": stage2_thread_id}}
        final_state = _coerce_s2(stage2_graph.invoke(initial_state, config=config))
        _stage2_sessions[stage2_thread_id] = final_state

        slack_ts = post_tasks_for_review(final_state)
        final_state.slack_message_ts = slack_ts
        _stage2_sessions[stage2_thread_id] = final_state

        logger.info(f"[API Stage2] Auto-started. thread={stage2_thread_id}, tasks={len(final_state.tasks)}")
        return final_state

    except Exception as e:
        logger.error(f"[API Stage2] _start_stage2_internal failed: {e}")
        return None


# ── GET /tasks/{stage2_thread_id} ─────────────────────────────────────────────

@router_stage2.get("/tasks/{stage2_thread_id}", response_model=TasksResponse)
async def get_tasks(stage2_thread_id: str):
    """Fetch the current task list and dependency graph."""
    state = _stage2_sessions.get(stage2_thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Stage 2 thread not found.")
    return TasksResponse(
        status=state.task_status.value,
        tasks=state.tasks,
        dependency_graph=state.dependency_graph,
        message=f"Task status: {state.task_status.value}",
        thread_id=stage2_thread_id,
        linear_issue_ids=state.linear_issue_ids,
    )


# ── POST /review/{stage2_thread_id} ──────────────────────────────────────────

@router_stage2.post("/review/{stage2_thread_id}", response_model=TasksResponse)
async def review_tasks(stage2_thread_id: str, body: TaskReviewAction):
    """
    Human review: approve or reject the task list.

    approve → creates all tasks as Linear issues with dependency graph
    reject  → revises the task list using feedback and re-posts to Slack
    """
    state = _stage2_sessions.get(stage2_thread_id)
    if not state:
        raise HTTPException(status_code=404, detail="Stage 2 thread not found.")

    if state.task_status not in (TaskStatus.PENDING, TaskStatus.REVISED):
        raise HTTPException(
            status_code=400,
            detail=f"Tasks not pending review. Status: {state.task_status}"
        )

    config = {"configurable": {"thread_id": stage2_thread_id}}

    if body.action == "approve":
        stage2_graph.update_state(config, {"task_status": TaskStatus.APPROVED, "human_feedback": None})
        final_state = _coerce_s2(stage2_graph.invoke(None, config=config))
        _stage2_sessions[stage2_thread_id] = final_state

        return TasksResponse(
            status=final_state.task_status.value,
            tasks=final_state.tasks,
            dependency_graph=final_state.dependency_graph,
            message=(
                f"Tasks approved! Created {len(final_state.linear_issue_ids)} Linear issues. "
                f"Stage 3 (PR Review) will activate when PRs are opened."
            ),
            thread_id=stage2_thread_id,
            linear_issue_ids=final_state.linear_issue_ids,
        )

    elif body.action == "reject":
        if not body.feedback:
            raise HTTPException(status_code=400, detail="Feedback is required when rejecting tasks.")

        stage2_graph.update_state(config, {"task_status": TaskStatus.REJECTED, "human_feedback": body.feedback})
        final_state = _coerce_s2(stage2_graph.invoke(None, config=config))
        _stage2_sessions[stage2_thread_id] = final_state

        slack_ts = post_tasks_for_review(final_state)
        final_state.slack_message_ts = slack_ts
        _stage2_sessions[stage2_thread_id] = final_state

        return TasksResponse(
            status=final_state.task_status.value,
            tasks=final_state.tasks,
            dependency_graph=final_state.dependency_graph,
            message=f"Tasks revised (revision #{final_state.revision_count}). Re-posted to Slack for review.",
            thread_id=stage2_thread_id,
        )

    raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'.")


# ── GET /sessions ─────────────────────────────────────────────────────────────

@router_stage2.get("/sessions")
async def list_sessions():
    """List all active Stage 2 sessions (debug/dashboard use)."""
    return {
        thread_id: {
            "prd_thread_id":   state.prd_thread_id,
            "task_status":     state.task_status.value,
            "task_count":      len(state.tasks),
            "revision_count":  state.revision_count,
            "linear_issues":   len(state.linear_issue_ids),
        }
        for thread_id, state in _stage2_sessions.items()
    }


# ── POST /slack/actions ───────────────────────────────────────────────────────

@router_stage2.post("/slack/actions")
async def stage2_slack_actions(payload: dict):
    """Handle Slack interactive button clicks for task approval."""
    actions = payload.get("actions", [])
    if not actions:
        return {"ok": True}

    action            = actions[0]
    action_id         = action.get("action_id")
    stage2_thread_id  = action.get("value")

    if action_id == "approve_tasks":
        await review_tasks(stage2_thread_id, TaskReviewAction(action="approve"))
    elif action_id == "reject_tasks":
        pass  # Collect feedback via modal or thread reply

    return {"ok": True}
