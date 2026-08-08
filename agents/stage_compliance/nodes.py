# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import json
import time
import logging
import contextvars
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import ComplianceState
from .prompts import ACCESSIBILITY_PROMPT, PRIVACY_PROMPT, SECURITY_PROMPT, LICENSING_PROMPT
from api.runtime_config import get_api_key, get_model

logger = logging.getLogger(__name__)

_SOURCE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".yaml", ".sql"}


def get_llm():
    return ChatAnthropic(
        model=get_model(),
        api_key=get_api_key(),
        temperature=0.1,
        max_tokens=4096,
        timeout=90.0,
    )


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


def _parse_json_findings(content: str) -> list:
    """Strip ```json fences and parse a JSON array.
    If the response was truncated (max_tokens hit), salvage complete objects
    already present before the cut-off rather than discarding everything.
    """
    content = content.strip()
    if content.startswith("```"):
        parts = content.split("```")
        inner = parts[1]
        if inner.startswith("json"):
            inner = inner[4:]
        content = inner.strip()

    # Fast path — well-formed response
    try:
        result = json.loads(content)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return result.get("findings", [])
        return []
    except Exception:
        pass

    # Truncated response — extract every complete {...} object from the array
    findings = []
    depth = 0
    start = None
    for i, ch in enumerate(content):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    obj = json.loads(content[start:i + 1])
                    if isinstance(obj, dict):
                        findings.append(obj)
                except Exception:
                    pass
                start = None

    if findings:
        logger.warning(f"[Compliance] Truncated response — salvaged {len(findings)} complete finding(s)")
    else:
        logger.warning(f"[Compliance] JSON parse failed — raw: {content[:200]}")
    return findings


def _read_files_summary(output_path: Path, max_chars: int = 14000) -> str:
    """Read source files from output_path, truncate each to 2000 chars, stop at max_chars total."""
    if not output_path or not output_path.exists():
        return "(no generated files found)"

    chunks = []
    total = 0
    for f in sorted(output_path.rglob("*")):
        if not f.is_file():
            continue
        if "__pycache__" in f.parts or f.suffix == ".pyc":
            continue
        if f.suffix not in _SOURCE_EXTENSIONS:
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        rel = str(f.relative_to(output_path))
        snippet = text[:2000]
        if len(text) > 2000:
            snippet += f"\n... (truncated {len(text) - 2000} chars)"
        chunk = f"### {rel}\n```\n{snippet}\n```\n"
        if total + len(chunk) > max_chars:
            break
        chunks.append(chunk)
        total += len(chunk)

    return "\n".join(chunks) if chunks else "(no source files found in output directory)"


def run_compliance_checks(state: ComplianceState) -> ComplianceState:
    """Run 4 compliance agents in parallel using ThreadPoolExecutor."""
    from api.stage4_routes import _stage4_output_paths

    output_path = _stage4_output_paths.get(state.s4_thread_id)
    files_summary = _read_files_summary(output_path)

    prd = state.prd or {}
    tasks = state.tasks or []

    task_titles = [
        t.get("title", t.get("name", f"Task {i+1}"))
        for i, t in enumerate(tasks[:20])
    ]
    tech_stack = prd.get("tech_stack") or prd.get("technology_stack") or ""
    context = (
        f"Project: {prd.get('title', 'Untitled')}\n"
        f"Description: {prd.get('problem_statement', prd.get('description', ''))}\n"
        + (f"Tech Stack: {tech_stack}\n" if tech_stack else "")
        + f"Number of tasks: {len(tasks)}\n"
        f"Task titles: {', '.join(task_titles) if task_titles else 'none'}"
    )

    agent_configs = [
        ("accessibility", ACCESSIBILITY_PROMPT),
        ("privacy",       PRIVACY_PROMPT),
        ("security",      SECURITY_PROMPT),
        ("licensing",     LICENSING_PROMPT),
    ]

    def run_one(agent_name, prompt_template):
        llm = get_llm()
        prompt = prompt_template.format(context=context, files=files_summary)
        try:
            response = _llm_invoke(llm, [HumanMessage(content=prompt)], "compliance", agent_name)
            findings = _parse_json_findings(response.content)
            # Ensure agent field is set correctly on each finding
            return agent_name, [{**f, "agent": agent_name} for f in findings]
        except Exception as e:
            logger.error(f"[Compliance/{agent_name}] Failed: {e}")
            return agent_name, []

    all_findings = []
    executor = ThreadPoolExecutor(max_workers=4)
    futures = {
        executor.submit(contextvars.copy_context().run, run_one, name, prompt): name
        for name, prompt in agent_configs
    }
    try:
        for future in as_completed(futures, timeout=120):
            agent_name, findings = future.result()
            all_findings.extend(findings)
            logger.info(f"[Compliance] {agent_name}: {len(findings)} findings")
    except Exception as _te:
        logger.error(f"[Compliance] Agents timed out or errored after 120s — using partial results: {_te}")
    finally:
        executor.shutdown(wait=False)

    state.findings = all_findings
    state.criticals = sum(1 for f in all_findings if f.get("severity") == "critical")
    state.warnings_count = sum(1 for f in all_findings if f.get("severity") == "warning")
    return state


def build_verdict(state: ComplianceState) -> ComplianceState:
    """Calculate compliance score and set verdict string."""
    criticals = state.criticals
    warnings  = state.warnings_count
    infos     = sum(1 for f in state.findings if f.get("severity") == "info")

    # Score: start at 100, deduct per finding
    deductions = criticals * 10 + warnings * 5 + infos * 1
    state.score = max(0, 100 - deductions)

    if criticals > 0:
        state.verdict = (
            f"BLOCKED — {criticals} critical{'s' if criticals != 1 else ''}, "
            f"{warnings} warning{'s' if warnings != 1 else ''}, {infos} info"
        )
    elif warnings > 0:
        state.verdict = (
            f"APPROVED WITH WARNINGS — {warnings} warning{'s' if warnings != 1 else ''}, "
            f"{infos} info, 0 criticals — score {state.score}/100"
        )
    else:
        state.verdict = (
            f"APPROVED — {infos} informational note{'s' if infos != 1 else ''}, "
            f"0 criticals, 0 warnings — score {state.score}/100"
        )

    logger.info(f"[Compliance] Verdict: {state.verdict}")
    return state
