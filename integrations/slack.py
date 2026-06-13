from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from config import get_settings
from agents.stage1.schemas import PRDDocument, AgentState

if TYPE_CHECKING:
    from agents.stage2.schemas import Stage2State

logger = logging.getLogger(__name__)
settings = get_settings()

client = WebClient(token=settings.slack_bot_token)


# ── Stage 1: PRD notifications ────────────────────────────────────────────────

def _prd_blocks(prd: PRDDocument, thread_id: str) -> list:
    goals_text     = "\n".join(f"• {g}" for g in prd.goals)
    non_goals_text = "\n".join(f"• {g}" for g in prd.non_goals)
    stories_text   = "\n".join(
        f"• As a *{s.as_a}*, I want {s.i_want}, so that {s.so_that}"
        for s in prd.user_stories
    )
    criteria_text  = "\n".join(
        f"• *Given* {c.given} *when* {c.when} *then* {c.then}"
        for c in prd.acceptance_criteria
    )
    tech_text      = "\n".join(f"• {t}" for t in prd.technical_notes)
    questions_text = "\n".join(f"• {q}" for q in prd.open_questions)

    return [
        {"type": "header", "text": {"type": "plain_text", "text": f"📋 PRD: {prd.title}  (v{prd.version})"}},
        {"type": "divider"},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Problem Statement*\n{prd.problem_statement}"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Goals*\n{goals_text}"},
            {"type": "mrkdwn", "text": f"*Non-Goals*\n{non_goals_text}"},
        ]},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*User Stories*\n{stories_text}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Acceptance Criteria*\n{criteria_text}"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Technical Notes*\n{tech_text}"},
            {"type": "mrkdwn", "text": f"*Open Questions*\n{questions_text}"},
        ]},
        {"type": "divider"},
        {
            "type": "actions",
            "block_id": f"prd_review_{thread_id}",
            "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "✅ Approve"},
                 "style": "primary", "action_id": "approve_prd", "value": thread_id},
                {"type": "button", "text": {"type": "plain_text", "text": "❌ Request Changes"},
                 "style": "danger", "action_id": "reject_prd", "value": thread_id},
            ],
        },
    ]


def post_prd_for_review(state: AgentState) -> str | None:
    if not state.prd:
        return None
    try:
        response = client.chat_postMessage(
            channel=settings.slack_prd_channel,
            text=f"New PRD ready for review: *{state.prd.title}*",
            blocks=_prd_blocks(state.prd, state.feature_request.source_id or "manual"),
        )
        ts = response["ts"]
        logger.info(f"[Slack] PRD posted. ts={ts}")
        return ts
    except SlackApiError as e:
        logger.error(f"[Slack] post_prd_for_review failed: {e.response['error']}")
        return None


def notify_prd_approved(state: AgentState) -> None:
    if not state.slack_message_ts or not state.prd:
        return
    try:
        client.chat_update(
            channel=settings.slack_prd_channel,
            ts=state.slack_message_ts,
            text=f"✅ PRD Approved: *{state.prd.title}* — moving to task creation.",
            blocks=[{"type": "section", "text": {"type": "mrkdwn",
                "text": (f"✅ *PRD Approved:* {state.prd.title} v{state.prd.version}\n"
                         f"🔜 Stage 2: Task Orchestration Agent is starting...")}}],
        )
    except SlackApiError as e:
        logger.error(f"[Slack] notify_prd_approved failed: {e.response['error']}")


def notify_error(channel: str, error_msg: str) -> None:
    try:
        client.chat_postMessage(channel=channel, text=f"⚠️ *DevForge Error*: {error_msg}")
    except SlackApiError as e:
        logger.error(f"[Slack] notify_error failed: {e.response['error']}")


def post_incomplete_request(channel: str, missing_info: list[str], ts: str = None) -> None:
    missing_text = "\n".join(f"• {m}" for m in missing_info)
    text = (f"⚠️ *DevForge needs more information to generate a PRD.*\n\n"
            f"Please provide the following:\n{missing_text}")
    try:
        kwargs: dict = {"channel": channel, "text": text}
        if ts:
            kwargs["thread_ts"] = ts
        client.chat_postMessage(**kwargs)
    except SlackApiError as e:
        logger.error(f"[Slack] post_incomplete_request failed: {e.response['error']}")


# ── Stage 2: Task notifications ───────────────────────────────────────────────

_PRIORITY_EMOJI = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}
_TYPE_EMOJI     = {"feature": "✨", "chore": "🔧", "spike": "🔬", "docs": "📝", "bug": "🐛"}


def post_tasks_for_review(state: Stage2State) -> str | None:
    """Post task breakdown to Slack with Approve / Request Changes buttons."""
    if not state.tasks:
        return None

    graph = state.dependency_graph
    prd_title     = (state.prd or {}).get("title", "PRD")
    total_hours   = graph.total_estimated_hours if graph else sum(t.estimate_hours for t in state.tasks)
    cp_len        = len(graph.critical_path) if graph else 0
    track_count   = len(graph.parallel_tracks) if graph else 1

    task_lines = []
    for task in state.tasks[:12]:
        p_em = _PRIORITY_EMOJI.get(task.priority.value, "⚪")
        t_em = _TYPE_EMOJI.get(task.type.value, "•")
        dep_str = f" ← {', '.join(task.dependencies)}" if task.dependencies else ""
        task_lines.append(f"{t_em} *{task.id}* {p_em} {task.title} _{task.estimate_hours}h_{dep_str}")
    if len(state.tasks) > 12:
        task_lines.append(f"_...and {len(state.tasks) - 12} more_")

    critical_ids = (graph.critical_path if graph else [])
    cp_display   = " → ".join(critical_ids[:5]) + (" → ..." if len(critical_ids) > 5 else "")

    blocks = [
        {"type": "header",  "text": {"type": "plain_text", "text": f"🗂️ Task Breakdown: {prd_title}"}},
        {"type": "divider"},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Tasks:* {len(state.tasks)}"},
            {"type": "mrkdwn", "text": f"*Total est.:* {total_hours:.1f}h"},
            {"type": "mrkdwn", "text": f"*Critical path:* {cp_len} tasks"},
            {"type": "mrkdwn", "text": f"*Parallel tracks:* {track_count}"},
        ]},
        {"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(task_lines)}},
    ]

    if cp_display:
        blocks.append({"type": "section", "text": {"type": "mrkdwn",
            "text": f"*Critical Path:* {cp_display}"}})

    if state.revision_count > 0:
        blocks.append({"type": "context", "elements": [
            {"type": "mrkdwn", "text": f"Revision #{state.revision_count}"}]})

    blocks += [
        {"type": "divider"},
        {
            "type": "actions",
            "block_id": f"task_review_{state.stage2_thread_id}",
            "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "✅ Approve & Create in Linear"},
                 "style": "primary", "action_id": "approve_tasks", "value": state.stage2_thread_id},
                {"type": "button", "text": {"type": "plain_text", "text": "✏️ Request Changes"},
                 "style": "danger",  "action_id": "reject_tasks",  "value": state.stage2_thread_id},
            ],
        },
    ]

    try:
        response = client.chat_postMessage(
            channel=settings.slack_prd_channel,
            text=f"Task breakdown ready for review: *{prd_title}* ({len(state.tasks)} tasks, {total_hours:.1f}h)",
            blocks=blocks,
        )
        ts = response["ts"]
        logger.info(f"[Slack] Tasks posted for review. ts={ts}")
        return ts
    except SlackApiError as e:
        logger.error(f"[Slack] post_tasks_for_review failed: {e.response['error']}")
        return None


def notify_tasks_approved(state: Stage2State) -> None:
    """Update the Slack task message to confirmed-created state."""
    if not state.slack_message_ts:
        return

    prd_title  = (state.prd or {}).get("title", "PRD")
    issue_count = len(state.linear_issue_ids)

    try:
        client.chat_update(
            channel=settings.slack_prd_channel,
            ts=state.slack_message_ts,
            text=f"✅ {issue_count} Linear issues created for *{prd_title}*",
            blocks=[{"type": "section", "text": {"type": "mrkdwn",
                "text": (f"✅ *Tasks Approved & Created in Linear*\n"
                         f"*{prd_title}* — {issue_count} issues created\n"
                         f"🔜 Stage 3: PR Review Agent activates when PRs are opened.")}}],
        )
    except SlackApiError as e:
        logger.error(f"[Slack] notify_tasks_approved failed: {e.response['error']}")
