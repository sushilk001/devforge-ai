import re
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException

from agents.stage4.schemas import Stage4State, CodeGenResponse
from agents.stage4.graph import stage4_graph

logger = logging.getLogger(__name__)
router_stage4 = APIRouter(prefix="/stage4", tags=["Stage 4 — Code Generation Agent"])

OUTPUT_DIR = Path(__file__).parent.parent / "output"

_stage4_sessions: dict[str, Stage4State] = {}
# Maps thread_id → absolute output path (set as soon as files are written)
_stage4_output_paths: dict[str, Path] = {}


def _coerce(result, cls):
    return cls(**result) if isinstance(result, dict) else result


def _project_slug(prd: dict) -> str:
    """Turn PRD title into a safe directory name that matches the Linear project name."""
    title = (prd or {}).get("title", "") or "devforge-run"
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", title.strip()).strip("-").lower()
    return slug[:60] or "devforge-run"


@router_stage4.post("/start/{stage2_thread_id}")
async def start_code_gen(stage2_thread_id: str, background_tasks: BackgroundTasks):
    """Start Stage 4 code generation from an approved Stage 2 session."""
    from api.stage2_routes import _stage2_sessions

    stage2_state = _stage2_sessions.get(stage2_thread_id)
    if not stage2_state:
        raise HTTPException(404, f"Stage 2 session {stage2_thread_id} not found")

    thread_id = str(uuid.uuid4())

    async def _run():
        initial = Stage4State(
            stage2_thread_id=stage2_thread_id,
            prd=stage2_state.prd or {},
            tasks=[
                t.model_dump() if hasattr(t, "model_dump") else t
                for t in (stage2_state.tasks or [])
            ],
        )
        config = {"configurable": {"thread_id": thread_id}}
        try:
            result = stage4_graph.invoke(initial, config=config)
            final = _coerce(result, Stage4State)
            _stage4_sessions[thread_id] = final

            # output/  {linear-project-slug}  /  {thread_id}  /
            slug = _project_slug(final.prd)
            output_dir = OUTPUT_DIR / slug / thread_id
            _stage4_output_paths[thread_id] = output_dir

            written = 0
            for gen_task in final.generated:
                task_data = gen_task if isinstance(gen_task, dict) else gen_task.model_dump()
                for file_data in task_data.get("files", []):
                    fname = file_data.get("filename", "")
                    if not fname:
                        continue
                    file_path = output_dir / fname
                    file_path.parent.mkdir(parents=True, exist_ok=True)
                    file_path.write_text(file_data.get("content", ""), encoding="utf-8")
                    written += 1
            logger.info(
                f"[Stage4] Complete. thread={thread_id} project={slug} "
                f"tasks={len(final.generated)} files={final.total_files} written={written}"
            )
        except Exception as e:
            logger.error(f"[Stage4] Failed: {e}")

    background_tasks.add_task(_run)
    return {"status": "started", "thread_id": thread_id, "stage2_thread_id": stage2_thread_id}


@router_stage4.get("/sessions")
def list_sessions():
    """List all active Stage 4 code generation sessions."""
    return {
        tid: {
            "task_count":        len(s.generated),
            "file_count":        s.total_files,
            "stage2_thread_id":  s.stage2_thread_id,
            "output_path":       str(_stage4_output_paths[tid]) if tid in _stage4_output_paths else None,
        }
        for tid, s in _stage4_sessions.items()
    }


@router_stage4.get("/code/{thread_id}", response_model=CodeGenResponse)
def get_code(thread_id: str):
    """Fetch the generated code files for a session."""
    state = _stage4_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Session not found")
    out = _stage4_output_paths.get(thread_id)
    return CodeGenResponse(
        status="pending_approval",
        generated=state.generated,
        total_files=state.total_files,
        message=f"{len(state.generated)} tasks generated, {state.total_files} files total"
                + (f" — output/{out.parent.name}/{out.name}/" if out else ""),
    )


@router_stage4.post("/code/{thread_id}", response_model=CodeGenResponse)
async def approve_code(thread_id: str, body: dict):
    """
    Human review action: approve or request changes.

    approve           → resumes the graph and runs the finalize node
    changes_requested → stores feedback without re-running the graph
    """
    state = _stage4_sessions.get(thread_id)
    if not state:
        raise HTTPException(404, "Session not found")

    action = body.get("action", "approve")
    config = {"configurable": {"thread_id": thread_id}}

    if action == "approve":
        stage4_graph.update_state(config, {"approved": True, "human_feedback": None})
        result = stage4_graph.invoke(None, config)
        final = _coerce(result, Stage4State)
        _stage4_sessions[thread_id] = final
        out = _stage4_output_paths.get(thread_id)
        rel = f"output/{out.parent.name}/{out.name}/" if out else f"output/{thread_id}/"
        logger.info(f"[Stage4] Approved. Files at {out or thread_id}")
        return CodeGenResponse(
            status="approved",
            generated=final.generated,
            total_files=final.total_files,
            message=f"Code approved. {final.total_files} files at {rel}",
        )
    else:
        feedback = body.get("feedback", "")
        _stage4_sessions[thread_id].human_feedback = feedback
        return CodeGenResponse(
            status="changes_requested",
            generated=state.generated,
            total_files=state.total_files,
            message=f"Changes requested: {feedback}",
        )
