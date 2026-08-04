# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import asyncio
import uuid
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException

from agents.stage_compliance.schemas import ComplianceState, ComplianceReport
from agents.stage_compliance.graph import compliance_graph

logger = logging.getLogger(__name__)
router_compliance = APIRouter(prefix="/compliance", tags=["Stage 6 — Compliance & Governance"])

_compliance_sessions: dict[str, ComplianceState] = {}
_compliance_running:  dict[str, str]              = {}   # thread_id → s4_thread_id
_compliance_saved:    set[str]                    = set()


def _coerce(result, cls):
    return cls(**result) if isinstance(result, dict) else result


@router_compliance.post("/start/{s4_thread_id}")
async def start_compliance(s4_thread_id: str, background_tasks: BackgroundTasks):
    """Start Stage Compliance checks from a completed Stage 4 session."""
    from api.stage4_routes import _stage4_sessions
    from api.stage4_routes import _project_slug

    s4_state = _stage4_sessions.get(s4_thread_id)
    if not s4_state:
        raise HTTPException(404, f"Stage 4 session {s4_thread_id} not found")

    prd   = s4_state.prd or {}
    tasks = [
        t.model_dump() if hasattr(t, "model_dump") else t
        for t in (s4_state.tasks or [])
    ]
    project_slug = _project_slug(prd)
    thread_id    = str(uuid.uuid4())

    _compliance_running[thread_id] = s4_thread_id

    async def _run():
        initial = ComplianceState(
            s4_thread_id=s4_thread_id,
            project_slug=project_slug,
            prd=prd,
            tasks=tasks,
        )
        config = {"configurable": {"thread_id": thread_id}}
        try:
            result = await asyncio.to_thread(compliance_graph.invoke, initial, config=config)
            final = _coerce(result, ComplianceState)
            _compliance_sessions[thread_id] = final
            _compliance_running.pop(thread_id, None)
            logger.info(
                f"[Compliance] Complete. thread={thread_id} "
                f"findings={len(final.findings)} score={final.score}"
            )
        except Exception as e:
            _compliance_running.pop(thread_id, None)
            logger.error(f"[Compliance] Failed: {e}")
            # Store an error state so status endpoint can surface it
            _compliance_sessions[thread_id] = ComplianceState(
                s4_thread_id=s4_thread_id,
                project_slug=project_slug,
                prd=prd,
                tasks=tasks,
                error=str(e),
                verdict="ERROR",
            )

    background_tasks.add_task(_run)
    return {"status": "started", "thread_id": thread_id, "s4_thread_id": s4_thread_id}


@router_compliance.get("/sessions")
def list_sessions():
    """List all compliance sessions (completed + in-flight)."""
    result = {
        tid: {
            "project_slug":   s.project_slug,
            "score":          s.score,
            "verdict":        s.verdict,
            "criticals":      s.criticals,
            "warnings_count": s.warnings_count,
            "finding_count":  len(s.findings),
            "s4_thread_id":   s.s4_thread_id,
            "status":         "complete",
            "error":          s.error,
        }
        for tid, s in _compliance_sessions.items()
    }
    for tid, s4tid in _compliance_running.items():
        if tid not in result:
            result[tid] = {
                "project_slug":   "",
                "score":          0,
                "verdict":        "",
                "criticals":      0,
                "warnings_count": 0,
                "finding_count":  0,
                "s4_thread_id":   s4tid,
                "status":         "running",
                "error":          None,
            }
    return result


@router_compliance.get("/status/{thread_id}")
def get_status(thread_id: str):
    """Poll compliance status — returns running/complete/error."""
    if thread_id in _compliance_running:
        return {"status": "running", "criticals": 0, "warnings_count": 0, "score": 0}
    state = _compliance_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Compliance session not found")
    if state.error:
        return {
            "status":         "error",
            "error":          state.error,
            "criticals":      0,
            "warnings_count": 0,
            "score":          0,
        }
    return {
        "status":         "complete",
        "criticals":      state.criticals,
        "warnings_count": state.warnings_count,
        "score":          state.score,
    }


@router_compliance.get("/report/{thread_id}", response_model=ComplianceReport)
def get_report(thread_id: str):
    """Fetch the full compliance report; saves run to DB on first call."""
    state = _compliance_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Compliance session not found")

    from api.compliance_db import save_run, get_debt_history

    if thread_id not in _compliance_saved and not state.error:
        save_run(
            thread_id=thread_id,
            project_slug=state.project_slug,
            s4_thread_id=state.s4_thread_id,
            findings=state.findings,
            score=state.score,
            criticals=state.criticals,
            warnings_count=state.warnings_count,
            verdict=state.verdict,
        )
        _compliance_saved.add(thread_id)

    debt_history = get_debt_history(state.project_slug) if state.project_slug else []

    return ComplianceReport(
        status="complete" if not state.error else "error",
        findings=state.findings,
        score=state.score,
        verdict=state.verdict,
        criticals=state.criticals,
        warnings_count=state.warnings_count,
        message=state.verdict or state.error or "",
        debt_history=debt_history,
    )


@router_compliance.post("/decision/{thread_id}", response_model=ComplianceReport)
def record_decision(thread_id: str, body: dict):
    """Record a governance decision: approved, deployed_anyway, or blocked.

    Body:
      action      — "approved" | "deployed_anyway" | "blocked"
      waive_ids   — list of finding DB ids to waive (optional)
      waive_reason — reason string for waivers (optional)
    """
    state = _compliance_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Compliance session not found")

    from api.compliance_db import waive_finding, save_run, get_debt_history

    action       = body.get("action", "")
    waive_ids    = body.get("waive_ids", []) or []
    waive_reason = body.get("waive_reason", "") or ""

    if action not in ("approved", "deployed_anyway", "blocked"):
        raise HTTPException(400, "action must be one of: approved, deployed_anyway, blocked")

    state.decision = action
    state.approved = action in ("approved", "deployed_anyway")
    _compliance_sessions[thread_id] = state

    for fid in waive_ids:
        try:
            waive_finding(int(fid), waive_reason)
        except Exception as e:
            logger.warning(f"[Compliance] waive_finding({fid}) failed: {e}")

    # Ensure the run is saved (idempotent — DB uses INSERT OR IGNORE)
    if thread_id not in _compliance_saved and not state.error:
        save_run(
            thread_id=thread_id,
            project_slug=state.project_slug,
            s4_thread_id=state.s4_thread_id,
            findings=state.findings,
            score=state.score,
            criticals=state.criticals,
            warnings_count=state.warnings_count,
            verdict=state.verdict,
        )
        _compliance_saved.add(thread_id)

    debt_history = get_debt_history(state.project_slug) if state.project_slug else []

    logger.info(f"[Compliance] Decision recorded. thread={thread_id} action={action} waivers={len(waive_ids)}")

    return ComplianceReport(
        status=action,
        findings=state.findings,
        score=state.score,
        verdict=state.verdict,
        criticals=state.criticals,
        warnings_count=state.warnings_count,
        message=f"Decision recorded: {action}. {len(waive_ids)} finding(s) waived.",
        debt_history=debt_history,
    )
