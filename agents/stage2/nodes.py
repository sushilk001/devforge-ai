import json
import logging
from collections import deque
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import (
    Stage2State, EngineeringTask, DependencyGraph, DependencyEdge, TaskStatus
)
from .prompts import DECOMPOSE_TASKS_PROMPT, REVISE_TASKS_PROMPT
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def get_llm():
    return ChatAnthropic(
        model="claude-sonnet-4-20250514",
        api_key=settings.anthropic_api_key,
        temperature=0.2,
        max_tokens=8000,
    )


def _parse_json_response(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content.strip())


# ── Node 1: Decompose Tasks ───────────────────────────────────────────────────

def decompose_tasks(state: Stage2State) -> Stage2State:
    """Break approved PRD into engineering tasks with declared dependencies."""
    logger.info("[Stage2/Node1] Decomposing PRD into tasks...")

    llm = get_llm()
    prd_json = json.dumps(state.prd, indent=2) if state.prd else "{}"
    prompt = DECOMPOSE_TASKS_PROMPT.format(prd_json=prd_json)

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        data = _parse_json_response(response.content)
        tasks = [EngineeringTask(**t) for t in data["tasks"]]
        state.tasks = tasks
        state.task_status = TaskStatus.PENDING
        logger.info(f"[Stage2/Node1] Generated {len(tasks)} tasks")
    except Exception as e:
        logger.error(f"[Stage2/Node1] Failed: {e}")
        state.error = f"Failed to decompose tasks: {str(e)}"

    return state


# ── Node 2: Build Dependency Graph ────────────────────────────────────────────

def build_dependency_graph(state: Stage2State) -> Stage2State:
    """Compute edges, critical path, and parallel execution tracks via Kahn's algorithm."""
    logger.info("[Stage2/Node2] Building dependency graph...")

    tasks = state.tasks
    task_map = {t.id: t for t in tasks}

    edges: list[DependencyEdge] = []
    adj_fwd: dict[str, list[str]] = {t.id: [] for t in tasks}
    in_degree: dict[str, int] = {t.id: 0 for t in tasks}

    for task in tasks:
        for dep_id in task.dependencies:
            if dep_id in task_map:
                edges.append(DependencyEdge(from_task=dep_id, to_task=task.id))
                adj_fwd[dep_id].append(task.id)
                in_degree[task.id] += 1

    # Kahn's algorithm — also groups into parallel levels
    level_deg = dict(in_degree)
    remaining = set(task_map.keys())
    current_level = [tid for tid in remaining if level_deg[tid] == 0]
    topo_order: list[str] = []
    parallel_tracks: list[list[str]] = []

    while current_level:
        parallel_tracks.append(sorted(current_level))
        next_level: list[str] = []
        for tid in current_level:
            remaining.discard(tid)
            topo_order.append(tid)
            for neighbor in adj_fwd[tid]:
                level_deg[neighbor] -= 1
                if level_deg[neighbor] == 0 and neighbor in remaining:
                    next_level.append(neighbor)
        current_level = next_level

    if remaining:
        logger.warning(f"[Stage2/Node2] Cycle detected — forcing remaining: {remaining}")
        orphans = sorted(remaining)
        topo_order.extend(orphans)
        parallel_tracks.append(orphans)

    # Critical path via DP (earliest-finish time)
    ef: dict[str, float] = {}
    for tid in topo_order:
        task = task_map[tid]
        max_dep_finish = max(
            (ef.get(dep, 0.0) for dep in task.dependencies if dep in task_map),
            default=0.0
        )
        ef[tid] = max_dep_finish + task.estimate_hours

    total_hours = max(ef.values(), default=0.0)

    critical_path: list[str] = []
    if ef:
        current = max(ef, key=lambda t: ef[t])
        while True:
            critical_path.append(current)
            task = task_map[current]
            best_dep = max(
                (dep for dep in task.dependencies if dep in task_map),
                key=lambda d: ef.get(d, 0.0),
                default=None
            )
            if best_dep is None:
                break
            current = best_dep
        critical_path.reverse()

    state.dependency_graph = DependencyGraph(
        edges=edges,
        critical_path=critical_path,
        total_estimated_hours=round(total_hours, 1),
        parallel_tracks=parallel_tracks,
    )
    logger.info(
        f"[Stage2/Node2] {len(edges)} edges | critical path {len(critical_path)} tasks | {total_hours:.1f}h total"
    )
    return state


# ── Node 3: Revise Tasks ──────────────────────────────────────────────────────

def revise_tasks(state: Stage2State) -> Stage2State:
    """Revise task list based on human feedback, then rebuild dependency graph next."""
    logger.info(f"[Stage2/Node3] Revising tasks (#{state.revision_count + 1})...")

    if not state.human_feedback:
        logger.warning("[Stage2/Node3] No feedback — skipping.")
        return state

    llm = get_llm()
    tasks_json = json.dumps([t.model_dump() for t in state.tasks], indent=2)
    prompt = REVISE_TASKS_PROMPT.format(
        tasks_json=tasks_json,
        feedback=state.human_feedback,
        revision_count=state.revision_count + 1,
    )

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        data = _parse_json_response(response.content)
        tasks = [EngineeringTask(**t) for t in data["tasks"]]
        state.tasks = tasks
        state.revision_count += 1
        state.task_status = TaskStatus.PENDING
        state.human_feedback = None
        logger.info(f"[Stage2/Node3] Revised to {len(tasks)} tasks")
    except Exception as e:
        logger.error(f"[Stage2/Node3] Failed: {e}")
        state.error = f"Failed to revise tasks: {str(e)}"

    return state


# ── Node 4: Create Linear Issues ──────────────────────────────────────────────

def create_linear_issues(state: Stage2State) -> Stage2State:
    """Create all approved tasks as Linear issues in topological order."""
    logger.info("[Stage2/Node4] Creating Linear issues...")

    from integrations.linear import create_task_issue

    tasks = state.tasks
    task_map = {t.id: t for t in tasks}
    local_to_linear: dict[str, dict] = {}
    issue_ids: list[str] = []

    topo: list[str] = []
    if state.dependency_graph and state.dependency_graph.parallel_tracks:
        for level in state.dependency_graph.parallel_tracks:
            topo.extend(level)
    topo.extend(tid for tid in task_map if tid not in topo)

    priority_map = {"urgent": 1, "high": 2, "medium": 3, "low": 4}
    updated: dict[str, EngineeringTask] = {t.id: t for t in tasks}

    for tid in topo:
        if tid not in task_map:
            continue
        task = task_map[tid]

        desc_parts = [task.description, ""]
        if task.acceptance_criteria:
            desc_parts += ["**Acceptance Criteria:**"] + [f"- {c}" for c in task.acceptance_criteria]
        dep_refs = [local_to_linear[d]["identifier"] for d in task.dependencies if d in local_to_linear]
        if dep_refs:
            desc_parts += ["", f"**Blocked by:** {', '.join(dep_refs)}"]

        blocked_by_linear_ids = [local_to_linear[d]["id"] for d in task.dependencies if d in local_to_linear]

        result = create_task_issue(
            title=task.title,
            description="\n".join(desc_parts),
            task_type=task.type.value,
            priority=priority_map.get(task.priority.value, 3),
            estimate_hours=task.estimate_hours,
            labels=task.labels,
            blocked_by_ids=blocked_by_linear_ids,
        )

        if result:
            local_to_linear[tid] = result
            issue_ids.append(result["id"])
            updated[tid] = task.model_copy(update={
                "linear_issue_id":  result["id"],
                "linear_issue_url": result.get("url"),
            })

    state.tasks = list(updated.values())
    state.task_status = TaskStatus.CREATED
    state.linear_issue_ids = issue_ids
    logger.info(f"[Stage2/Node4] Created {len(issue_ids)} Linear issues")
    return state


# ── Node 5: Notify Slack ──────────────────────────────────────────────────────

def notify_tasks_created_node(state: Stage2State) -> Stage2State:
    """Notify Slack that all Linear issues have been created."""
    try:
        from integrations.slack import notify_tasks_approved
        notify_tasks_approved(state)
    except Exception as e:
        logger.error(f"[Stage2/Node5] Slack notification failed: {e}")
    return state
