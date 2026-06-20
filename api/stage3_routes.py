import uuid
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException

from agents.stage3.schemas import Stage3State, ReviewResponse
from agents.stage3.graph import stage3_graph

logger = logging.getLogger(__name__)
router_stage3 = APIRouter(prefix="/stage3", tags=["Stage 3 — PR Review Agent"])

_stage3_sessions: dict[str, Stage3State] = {}


def _coerce(result, cls):
    return cls(**result) if isinstance(result, dict) else result


@router_stage3.post("/start/{stage2_thread_id}")
async def start_review(stage2_thread_id: str, background_tasks: BackgroundTasks):
    """Start Stage 3 PR review from an approved Stage 2 session."""
    from api.stage2_routes import _stage2_sessions

    stage2_state = _stage2_sessions.get(stage2_thread_id)
    if not stage2_state:
        raise HTTPException(404, f"Stage 2 session {stage2_thread_id} not found")

    thread_id = str(uuid.uuid4())

    async def _run():
        initial = Stage3State(
            prd_thread_id=stage2_state.prd_thread_id if hasattr(stage2_state, "prd_thread_id") else None,
            stage2_thread_id=stage2_thread_id,
            prd=stage2_state.prd or {},
            tasks=[t.model_dump() if hasattr(t, "model_dump") else t for t in (stage2_state.tasks or [])],
        )
        config = {"configurable": {"thread_id": thread_id}}
        try:
            result = stage3_graph.invoke(initial, config=config)
            final = _coerce(result, Stage3State)
            _stage3_sessions[thread_id] = final
            logger.info(f"[Stage3] Complete. thread={thread_id} findings={len(final.findings)}")
        except Exception as e:
            logger.error(f"[Stage3] Failed: {e}")

    background_tasks.add_task(_run)
    return {"status": "started", "thread_id": thread_id, "stage2_thread_id": stage2_thread_id}


@router_stage3.get("/sessions")
def list_sessions():
    """List all active Stage 3 PR review sessions."""
    return {
        tid: {
            "verdict": s.verdict,
            "blockers": s.blockers,
            "warnings": s.warnings,
            "finding_count": len(s.findings),
            "stage2_thread_id": s.stage2_thread_id,
        }
        for tid, s in _stage3_sessions.items()
    }


@router_stage3.get("/review/{thread_id}", response_model=ReviewResponse)
def get_review(thread_id: str):
    """Fetch the current PR review findings and verdict."""
    state = _stage3_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Session not found")
    return ReviewResponse(
        status="pending_approval",
        findings=state.findings,
        verdict=state.verdict,
        blockers=state.blockers,
        warnings=state.warnings,
        message=state.verdict,
    )


@router_stage3.post("/review/{thread_id}", response_model=ReviewResponse)
async def approve_review(thread_id: str, body: dict):
    """
    Human review action: approve or request changes.

    approve           → resumes the graph and runs the finalize node
    changes_requested → stores feedback without re-running the graph
    """
    state = _stage3_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Session not found")

    action = body.get("action", "approve")
    config = {"configurable": {"thread_id": thread_id}}

    if action == "approve":
        stage3_graph.update_state(config, {"approved": True, "human_feedback": None})
        result = stage3_graph.invoke(None, config)
        final = _coerce(result, Stage3State)
        _stage3_sessions[thread_id] = final
        return ReviewResponse(
            status="approved",
            findings=final.findings,
            verdict=final.verdict,
            blockers=final.blockers,
            warnings=final.warnings,
            message="PR Review approved.",
        )
    else:
        feedback = body.get("feedback", "")
        _stage3_sessions[thread_id].human_feedback = feedback
        return ReviewResponse(
            status="changes_requested",
            findings=state.findings,
            verdict=state.verdict,
            blockers=state.blockers,
            warnings=state.warnings,
            message=f"Changes requested: {feedback}",
        )
