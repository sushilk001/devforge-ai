import json
import time
import logging
from pathlib import Path
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stats", tags=["Observability"])

# Persist to /tmp so data survives uvicorn --reload restarts (cleared on machine reboot)
_CALLS_FILE = Path("/tmp/devforge-llm-calls.json")

# Pricing per 1M tokens (claude-sonnet-4-6)
PRICE_INPUT  = 3.00 / 1_000_000
PRICE_OUTPUT = 15.00 / 1_000_000

_llm_calls: list[dict] = []
_call_counter = 0


def _load():
    global _llm_calls, _call_counter
    try:
        data = json.loads(_CALLS_FILE.read_text())
        _llm_calls    = data.get("calls", [])
        _call_counter = data.get("counter", 0)
        logger.info(f"[Obs] Loaded {len(_llm_calls)} LLM calls from disk")
    except Exception:
        pass  # first run or corrupted — start fresh


def _save():
    try:
        _CALLS_FILE.write_text(
            json.dumps({"calls": _llm_calls, "counter": _call_counter})
        )
    except Exception as e:
        logger.warning(f"[Obs] Could not persist calls: {e}")


# Load on module import so restarts don't lose history
_load()


def record_llm_call(
    stage: str,
    label: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
):
    global _call_counter
    _call_counter += 1
    cost = (input_tokens * PRICE_INPUT) + (output_tokens * PRICE_OUTPUT)
    entry = {
        "id":         _call_counter,
        "stage":      stage,
        "label":      label,
        "model":      model,
        "inputTok":   input_tokens,
        "outputTok":  output_tokens,
        "latencyMs":  latency_ms,
        "cost":       round(cost, 6),
    }
    _llm_calls.append(entry)
    _save()
    logger.info(f"[Obs] {label} — {input_tokens}in/{output_tokens}out {latency_ms}ms ${cost:.4f}")
    return entry


def reset_calls():
    global _llm_calls, _call_counter
    _llm_calls    = []
    _call_counter = 0
    _save()


@router.get("/llm-calls")
def get_llm_calls():
    return {"calls": _llm_calls, "total": len(_llm_calls)}


@router.delete("/llm-calls")
def clear_llm_calls():
    reset_calls()
    return {"status": "cleared"}
