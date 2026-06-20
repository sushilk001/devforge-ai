from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .schemas import Stage4State
from .nodes import generate_code_for_tasks, notify_slack_node, finalize


def build_stage4_graph():
    builder = StateGraph(Stage4State)
    builder.add_node("generate_code", generate_code_for_tasks)
    builder.add_node("notify_slack",  notify_slack_node)
    builder.add_node("finalize",      finalize)

    builder.set_entry_point("generate_code")
    builder.add_edge("generate_code", "notify_slack")
    builder.add_edge("notify_slack",  END)   # interrupt here for human review

    memory = MemorySaver()
    return builder.compile(checkpointer=memory, interrupt_after=["notify_slack"])


stage4_graph = build_stage4_graph()
