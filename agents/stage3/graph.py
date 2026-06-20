from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .schemas import Stage3State
from .nodes import run_reviews, build_verdict, notify_slack_node, finalize


def build_stage3_graph():
    builder = StateGraph(Stage3State)
    builder.add_node("run_reviews",   run_reviews)
    builder.add_node("build_verdict", build_verdict)
    builder.add_node("notify_slack",  notify_slack_node)
    builder.add_node("finalize",      finalize)

    builder.set_entry_point("run_reviews")
    builder.add_edge("run_reviews",   "build_verdict")
    builder.add_edge("build_verdict", "notify_slack")
    builder.add_edge("notify_slack",  END)   # interrupt here for human review

    memory = MemorySaver()
    return builder.compile(checkpointer=memory, interrupt_after=["notify_slack"])


stage3_graph = build_stage3_graph()
