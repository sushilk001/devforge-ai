import json
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import Stage3State
from .prompts import SECURITY_PROMPT, QUALITY_PROMPT, COVERAGE_PROMPT, ARCHITECTURE_PROMPT
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _llm_invoke(llm, messages, stage: str, label: str):
    from api.observability import record_llm_call
    t0 = time.time()
    response = llm.invoke(messages)
    latency_ms = int((time.time() - t0) * 1000)
    usage = getattr(response, "response_metadata", {}).get("usage", {})
    record_llm_call(
        stage=stage, label=label, model=llm.model,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        latency_ms=latency_ms,
    )
    return response


def get_llm():
    return ChatAnthropic(
        model="claude-sonnet-4-6",
        api_key=settings.anthropic_api_key,
        temperature=0.2,
        max_tokens=2048,
        timeout=45.0,
    )


def _parse_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content.strip())


def run_reviews(state: Stage3State) -> Stage3State:
    """Run 4 review agents in parallel using ThreadPoolExecutor."""
    prd_json = json.dumps(state.prd, indent=2)
    tasks_json = json.dumps(state.tasks, indent=2)

    agent_configs = [
        ("security",     SECURITY_PROMPT),
        ("quality",      QUALITY_PROMPT),
        ("coverage",     COVERAGE_PROMPT),
        ("architecture", ARCHITECTURE_PROMPT),
    ]

    def run_one(agent_name, prompt_template):
        llm = get_llm()
        prompt = prompt_template.format(prd_json=prd_json, tasks_json=tasks_json)
        try:
            response = _llm_invoke(llm, [HumanMessage(content=prompt)], "pr_review", agent_name)
            data = _parse_json(response.content)
            findings = data.get("findings", [])
            return agent_name, [{**f, "agent": agent_name} for f in findings]
        except Exception as e:
            logger.error(f"[Stage3/{agent_name}] Failed: {e}")
            return agent_name, []

    all_findings = []
    executor = ThreadPoolExecutor(max_workers=4)
    futures = {executor.submit(run_one, name, prompt): name for name, prompt in agent_configs}
    try:
        for future in as_completed(futures, timeout=90):
            agent_name, findings = future.result()
            all_findings.extend(findings)
            logger.info(f"[Stage3] {agent_name}: {len(findings)} findings")
    except TimeoutError:
        logger.error("[Stage3] Review agents timed out after 90s — using partial results")
    finally:
        executor.shutdown(wait=False)

    state.findings = all_findings
    state.blockers = sum(1 for f in all_findings if f.get("severity") == "blocker")
    state.warnings = sum(1 for f in all_findings if f.get("severity") == "warning")
    return state


def build_verdict(state: Stage3State) -> Stage3State:
    b, w = state.blockers, state.warnings
    info = sum(1 for f in state.findings if f.get("severity") == "info")
    if b > 0:
        state.verdict = f"BLOCKED — {b} blocker{'s' if b > 1 else ''}, {w} warning{'s' if w != 1 else ''}, {info} info"
    elif w > 0:
        state.verdict = f"APPROVED WITH WARNINGS — {w} warning{'s' if w != 1 else ''}, {info} info, 0 blockers"
    else:
        state.verdict = f"APPROVED — {info} informational note{'s' if info != 1 else ''}, 0 blockers, 0 warnings"
    logger.info(f"[Stage3] Verdict: {state.verdict}")
    return state


def notify_slack_node(state: Stage3State) -> Stage3State:
    try:
        from integrations.slack import notify_review_complete
        ts = notify_review_complete(state)
        state.slack_ts = ts
    except Exception as e:
        logger.error(f"[Stage3] Slack notification failed: {e}")
    return state


def finalize(state: Stage3State) -> Stage3State:
    state.approved = True
    logger.info("[Stage3] PR Review approved.")
    return state
