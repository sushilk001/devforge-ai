import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router_debug = APIRouter(prefix="/debug", tags=["Debug Assistant"])


class DebugRequest(BaseModel):
    stage:    str
    question: str
    logs:     list[str] = []
    error:    str = ""


class DebugResponse(BaseModel):
    answer: str


@router_debug.post("/help", response_model=DebugResponse)
async def debug_help(body: DebugRequest):
    """Ask Claude to diagnose a stuck or broken pipeline stage."""
    import anthropic
    from api.observability import record_llm_call

    stage_names = {
        "requirements": "Stage 1 — Requirements / PRD generation",
        "tasks":        "Stage 2 — Task Orchestration / Linear issues",
        "code_gen":     "Stage 3 — Code Generation",
        "pr_review":    "Stage 4 — PR Review (4-agent)",
        "qa":           "Stage 5 — QA / pytest runner",
        "deploy":       "Stage 6 — Deploy & GitHub PR",
    }
    stage_label = stage_names.get(body.stage, body.stage)
    recent_logs = "\n".join(body.logs[-20:]) if body.logs else "(no logs)"
    error_block = f"\nError message: {body.error}" if body.error else ""

    prompt = f"""You are a DevForge AI pipeline debugger. The user is stuck on a pipeline stage.

## Current Stage
{stage_label}
{error_block}

## Recent Pipeline Logs
{recent_logs}

## User Question
{body.question or "What is wrong and how do I fix it?"}

Diagnose the problem concisely. Structure your answer as:
1. **What likely went wrong** (1–2 sentences)
2. **How to fix it** (concrete steps, bullet list)
3. **What to check** (logs, endpoints, or config to verify)

Be specific to DevForge AI — mention actual stage names, endpoint paths (/stage1/submit etc.), and env vars (.env) where relevant. Under 250 words."""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    t0 = time.time()
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        latency_ms = int((time.time() - t0) * 1000)
        record_llm_call(
            stage="debug", label="debug/help",
            model="claude-haiku-4-5-20251001",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=latency_ms,
        )
        return DebugResponse(answer=response.content[0].text)
    except Exception as e:
        logger.error(f"[Debug] Help failed: {e}")
        return DebugResponse(answer=f"Debug service unavailable: {str(e)}")
