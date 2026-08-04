# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .schemas import ComplianceState
from .nodes import run_compliance_checks, build_verdict


def build_compliance_graph():
    builder = StateGraph(ComplianceState)
    builder.add_node("run_compliance_checks", run_compliance_checks)
    builder.add_node("build_verdict",         build_verdict)

    builder.set_entry_point("run_compliance_checks")
    builder.add_edge("run_compliance_checks", "build_verdict")
    builder.add_edge("build_verdict",         END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory, interrupt_after=["build_verdict"])


compliance_graph = build_compliance_graph()
