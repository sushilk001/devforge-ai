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
    if state.prd_status == PRDStatus.APPROVED:
        return "finalize"
    if state.prd_status == PRDStatus.REJECTED and state.human_feedback:
        return "revise"
    return "wait"


def build_stage1_graph() -> StateGraph:
    memory = MemorySaver()
    graph = StateGraph(AgentState)

    graph.add_node("parse_request",      parse_request)
    graph.add_node("request_incomplete", request_incomplete)
    graph.add_node("generate_prd",       generate_prd)
    graph.add_node("revise_prd",         revise_prd)
    graph.add_node("finalize_prd",       finalize_prd)

    graph.set_entry_point("parse_request")

    graph.add_conditional_edges(
        "parse_request",
        check_completeness,
        {
            "generate_prd":       "generate_prd",
            "request_incomplete": "request_incomplete",
        }
    )

    graph.add_edge("request_incomplete", END)

    graph.add_conditional_edges(
        "generate_prd",
        review_gate,
        {"finalize": "finalize_prd", "revise": "revise_prd", "wait": END}
    )

    graph.add_conditional_edges(
        "revise_prd",
        review_gate,
        {"finalize": "finalize_prd", "revise": "revise_prd", "wait": END}
    )

    graph.add_edge("finalize_prd", END)

    return graph.compile(
        checkpointer=memory,
        interrupt_after=["generate_prd", "revise_prd"],
    )


stage1_graph = build_stage1_graph()
