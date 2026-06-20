import json
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import Stage4State, GeneratedTask, GeneratedFile
from .prompts import CODE_GEN_PROMPT
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
        max_tokens=4096,
        timeout=60.0,
    )


def _parse_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content.strip())


def _generate_for_task(task: dict, prd: dict) -> dict:
    """Generate code files for a single task. Returns a GeneratedTask dict."""
    task_id    = task.get("id", "unknown")
    task_title = task.get("title", "")
    task_desc  = task.get("description", task_title)
    task_type  = task.get("type", "feature")
    prd_context = json.dumps({
        "title":             prd.get("title", ""),
        "problem_statement": prd.get("problem_statement", ""),
        "technical_notes":   prd.get("technical_notes", [])[:5],
    }, indent=2)

    llm = get_llm()
    prompt = CODE_GEN_PROMPT.format(
        task_title=task_title,
        task_description=task_desc,
        task_type=task_type,
        prd_context=prd_context,
    )
    try:
        response = _llm_invoke(
            llm,
            [HumanMessage(content=prompt)],
            stage="code_gen",
            label=task_id,
        )
        data = _parse_json(response.content)
        files = [
            GeneratedFile(
                filename=f.get("filename", "unknown"),
                language=f.get("language", "python"),
                content=f.get("content", ""),
                description=f.get("description", ""),
            )
            for f in data.get("files", [])
        ]
        return GeneratedTask(
            task_id=task_id,
            task_title=task_title,
            files=files,
            summary=data.get("summary", ""),
        ).model_dump()
    except Exception as e:
        logger.error(f"[Stage4/{task_id}] Code gen failed: {e}")
        return GeneratedTask(
            task_id=task_id,
            task_title=task_title,
            files=[],
            summary="",
            error=str(e),
        ).model_dump()


def generate_code_for_tasks(state: Stage4State) -> Stage4State:
    """Run code generation for each task in parallel (up to 5 tasks)."""
    tasks = [
        t.model_dump() if hasattr(t, "model_dump") else t
        for t in state.tasks[:5]
    ]
    prd = state.prd or {}

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(_generate_for_task, task, prd): task.get("id", idx)
            for idx, task in enumerate(tasks)
        }
        for future in as_completed(futures):
            task_label = futures[future]
            gen_task = future.result()
            results.append(gen_task)
            file_count = len(gen_task.get("files", []))
            logger.info(f"[Stage4] {task_label}: {file_count} files generated")

            # Find the matching original task to get its Linear issue ID
            original_task = next(
                (t for t in tasks if t.get("id") == gen_task.get("task_id")), None
            )
            linear_id = (original_task or {}).get("linear_issue_id")
            if linear_id and not gen_task.get("error") and file_count > 0:
                try:
                    from integrations.linear import mark_code_generated
                    mark_code_generated(
                        issue_id=linear_id,
                        files=gen_task.get("files", []),
                        summary=gen_task.get("summary", ""),
                    )
                except Exception as e:
                    logger.warning(f"[Stage4] Linear update failed for {task_label}: {e}")

    state.generated = results
    state.total_files = sum(len(r.get("files", [])) for r in results)
    logger.info(f"[Stage4] Total files generated: {state.total_files}")
    return state


def notify_slack_node(state: Stage4State) -> Stage4State:
    try:
        from integrations.slack import notify_code_generated
        ts = notify_code_generated(state)
        state.slack_ts = ts
    except Exception as e:
        logger.error(f"[Stage4] Slack notification failed: {e}")
    return state


def finalize(state: Stage4State) -> Stage4State:
    state.approved = True
    logger.info("[Stage4] Code generation approved.")
    return state
