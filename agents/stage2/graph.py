from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .schemas import Stage2State, TaskStatus
from .nodes import (
    decompose_tasks,
    build_dependency_graph,
    revise_tasks,
    create_linear_issues,
    notify_tasks_created_node,
)


def task_review_gate(state: Stage2State) -> str:
    """
    Route after dependency graph is built or tasks are revised.

    APPROVED           → create Linear issues
    REJECTED + feedback → revise
    PENDING / REVISED  → interrupt (wait for human review)
    """
    if state.task_status == TaskStatus.APPROVED:
        return "create"
    if state.task_status == TaskStatus.REJECTED and state.human_feedback:
        return "revise"
    return "wait"


def build_stage2_graph() -> StateGraph:
    """
    Stage 2: Task Orchestration Agent

    Flow:
        decompose_tasks → build_dependency_graph
                                ↓
                        [task_review_gate] ← interrupt
                                ├─ approved → create_linear_issues → notify → END
                                └─ rejected → revise_tasks → build_dependency_graph → (loop)
    """
    memory = MemorySaver()
    graph = StateGraph(Stage2State)

    graph.add_node("decompose_tasks",        decompose_tasks)
    graph.add_node("build_dependency_graph", build_dependency_graph)
    graph.add_node("revise_tasks",           revise_tasks)
    graph.add_node("create_linear_issues",   create_linear_issues)
    graph.add_node("notify_tasks_created",   notify_tasks_created_node)

    graph.set_entry_point("decompose_tasks")

    graph.add_edge("decompose_tasks", "build_dependency_graph")

    graph.add_conditional_edges(
        "build_dependency_graph",
        task_review_gate,
        {
            "create": "create_linear_issues",
            "revise": "revise_tasks",
            "wait":   END,
        }
    )

    # After revision: rebuild the graph, then hit the interrupt again
    graph.add_edge("revise_tasks", "build_dependency_graph")

    graph.add_edge("create_linear_issues", "notify_tasks_created")
    graph.add_edge("notify_tasks_created", END)

    return graph.compile(
        checkpointer=memory,
        interrupt_after=["build_dependency_graph"],
    )


stage2_graph = build_stage2_graph()
