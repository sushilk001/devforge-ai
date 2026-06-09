from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .schemas import AgentState, PRDStatus
from .nodes import (
    parse_request,
    check_completeness,
    request_incomplete,
    generate_prd,
    revise_prd,
    finalize_prd,
)


def review_gate(state: AgentState) -> str:
    """
    Conditional edge after PRD is generated / revised.
    Waits for human input; routes based on prd_status.

    - PENDING / REVISED  → interrupt (wait for human)
    - APPROVED           → finalize
    - REJECTED           → revise (if feedback exists)
    """
    if state.prd_status == PRDStatus.APPROVED:
        return "finalize"
    if state.prd_status == PRDStatus.REJECTED and state.human_feedback:
        return "revise"
    # Default: stay pending (interrupt will hold here)
    return "wait"


def build_stage1_graph() -> StateGraph:
    """
    Builds and compiles the Stage 1 LangGraph.

    Graph flow:
        parse_request
            ↓
        [check_completeness]
            ├── incomplete  → request_incomplete → END
            └── complete    → generate_prd
                                ↓
                            [review_gate]  ← human interrupt here
                                ├── approved → finalize_prd → END
                                └── rejected → revise_prd → [review_gate] (loop)
    """

    # Use MemorySaver so graph state persists between resume calls
    memory = MemorySaver()

    graph = StateGraph(AgentState)

    # ── Add nodes ────────────────────────────────────────────────────────────
    graph.add_node("parse_request",      parse_request)
    graph.add_node("request_incomplete", request_incomplete)
    graph.add_node("generate_prd",       generate_prd)
    graph.add_node("revise_prd",         revise_prd)
    graph.add_node("finalize_prd",       finalize_prd)

    # ── Entry point ──────────────────────────────────────────────────────────
    graph.set_entry_point("parse_request")

    # ── Edges ────────────────────────────────────────────────────────────────

    # After parsing: branch on completeness
    graph.add_conditional_edges(
        "parse_request",
        check_completeness,
        {
            "generate_prd":       "generate_prd",
            "request_incomplete": "request_incomplete",
        }
    )

    # Incomplete → END
    graph.add_edge("request_incomplete", END)

    # After PRD generated or revised: human review gate (interrupt)
    graph.add_conditional_edges(
        "generate_prd",
        review_gate,
        {
            "finalize": "finalize_prd",
            "revise":   "revise_prd",
            "wait":     END,            # Graph pauses; resumed via /review endpoint
        }
    )

    graph.add_conditional_edges(
        "revise_prd",
        review_gate,
        {
            "finalize": "finalize_prd",
            "revise":   "revise_prd",
            "wait":     END,
        }
    )

    # Finalized → END
    graph.add_edge("finalize_prd", END)

    return graph.compile(
        checkpointer=memory,
        interrupt_after=["generate_prd", "revise_prd"],  # Pause for human review
    )


# Singleton graph instance
stage1_graph = build_stage1_graph()
