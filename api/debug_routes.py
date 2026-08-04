# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from config import get_settings
import api.runtime_config as rc

logger = logging.getLogger(__name__)
settings = get_settings()

router_debug = APIRouter(prefix="/debug", tags=["Debug Assistant"])

SYSTEM_PROMPT = """You are a live assistant embedded inside DevForge AI — a 6-stage autonomous SDLC pipeline.

DevForge AI stages:
  Stage 1 (requirements): PRD generation from feature request
  Stage 2 (tasks): Task breakdown → Linear issues
  Stage 4 (code_gen): Parallel per-ticket code generation + entrypoint synthesis
  Stage 3 (pr_review): 4-agent parallel code review (security/quality/coverage/architecture)
  Stage 5 (qa): pytest runner on generated code
  Stage 6 (deploy): GitHub push + PR creation + app launch

Real API endpoints only: /stage1/submit, /stage1/review/:tid, /stage2/run, /stage2/approve/:tid, /stage4/run, /stage4/review/:tid, /qa/run/:tid, /qa/results/:tid, /stage3/review/:tid, /stage6/deploy, /stage6/status/:tid

You answer questions about the user's specific running pipeline. Be a sharp, knowledgeable colleague — not a template-filling bot.

HARD RULES:
1. Respond in plain conversational prose. No "## What Went Wrong" headers. No numbered-section templates.
2. Only use bullet points if listing ≥3 specific items (e.g. actual test names).
3. Never invent endpoint paths, env vars, file paths, or config keys not shown in the state.
4. Refer to real values from the state — actual test names, real PR URLs, real counts.
5. Max 150 words. Get to the point."""


class DebugRequest(BaseModel):
    stage:          str
    question:       str
    logs:           list[str] = []
    error:          str = ""
    pipeline_state: dict = {}


class DebugResponse(BaseModel):
    answer: str


def _build_state_summary(ps: dict) -> str:
    lines = []
    lines.append(f"app_state={ps.get('app_state','unknown')}")
    if ps.get('active_stage'):    lines.append(f"active={ps['active_stage']}")
    if ps.get('gate_stage'):      lines.append(f"waiting_for_approval_at={ps['gate_stage']}")
    completed = ps.get('completed_stages') or []
    if completed: lines.append(f"completed=[{', '.join(completed)}]")

    if ps.get('requirements'):
        r = ps['requirements']
        lines.append(f"prd=\"{r.get('title','')}\" goals={r.get('goals',0)} stories={r.get('stories',0)}")
    if ps.get('tasks'):
        lines.append(f"tasks={ps['tasks'].get('count',0)}")
    if ps.get('code_gen'):
        cg = ps['code_gen']
        lines.append(f"code_gen={cg.get('tasks_generated',0)} tasks, {cg.get('total_files',0)} files")
    if ps.get('pr_review'):
        pr = ps['pr_review']
        lines.append(f"pr_review findings={pr.get('findings',0)} verdict={pr.get('verdict')}")
    if ps.get('qa'):
        qa = ps['qa']
        lines.append(f"qa={qa.get('passed',0)}/{qa.get('total',0)} passed, {qa.get('failed',0)} failed")
        if qa.get('failed_tests'):
            lines.append(f"  failing: {', '.join(qa['failed_tests'])}")
    if ps.get('deploy'):
        dep = ps['deploy']
        lines.append(f"deploy status={dep.get('status')} step={dep.get('step')} pr={dep.get('pr_url') or 'none'} app={dep.get('app_url') or 'none'}")
        if dep.get('error'): lines.append(f"  deploy_error={dep['error']}")
    return "\n".join(lines) or "(no state)"


@router_debug.post("/help", response_model=DebugResponse)
async def debug_help(body: DebugRequest):
    """Ask Claude to diagnose a stuck or broken pipeline stage."""
    import anthropic
    from api.observability import record_llm_call

    state_summary = _build_state_summary(body.pipeline_state)
    recent_logs   = "\n".join(body.logs[-30:]) if body.logs else "(none)"
    errors        = f"\nRecent warnings/errors: {body.error}" if body.error else ""

    user_message = f"""Pipeline state right now:
{state_summary}

Recent logs (newest last):
{recent_logs}{errors}

User question: {body.question or "What is currently happening?"}"""

    model = rc.get_model()
    client = anthropic.Anthropic(api_key=rc.get_api_key())
    t0 = time.time()
    try:
        response = client.messages.create(
            model=model,
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        latency_ms = int((time.time() - t0) * 1000)
        record_llm_call(
            stage="debug", label="debug/help",
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=latency_ms,
        )
        return DebugResponse(answer=response.content[0].text)
    except Exception as e:
        logger.error(f"[Debug] Help failed: {e}")
        return DebugResponse(answer=f"Debug service unavailable: {str(e)}")
