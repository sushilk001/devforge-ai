import logging
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from config import get_settings
from agents.stage1.schemas import PRDDocument, AgentState

logger = logging.getLogger(__name__)
settings = get_settings()

client = WebClient(token=settings.slack_bot_token)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _prd_blocks(prd: PRDDocument, thread_id: str) -> list:
    """Build Slack Block Kit layout for a PRD."""

    goals_text      = "\n".join(f"• {g}" for g in prd.goals)
    non_goals_text  = "\n".join(f"• {g}" for g in prd.non_goals)
    stories_text    = "\n".join(
        f"• As a *{s.as_a}*, I want {s.i_want}, so that {s.so_that}"
        for s in prd.user_stories
    )
    criteria_text   = "\n".join(
        f"• *Given* {c.given} *when* {c.when} *then* {c.then}"
        for c in prd.acceptance_criteria
    )
    tech_text       = "\n".join(f"• {t}" for t in prd.technical_notes)
    questions_text  = "\n".join(f"• {q}" for q in prd.open_questions)

    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"📋 PRD: {prd.title}  (v{prd.version})"}
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Problem Statement*\n{prd.problem_statement}"}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Goals*\n{goals_text}"},
                {"type": "mrkdwn", "text": f"*Non-Goals*\n{non_goals_text}"},
            ]
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*User Stories*\n{stories_text}"}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Acceptance Criteria*\n{criteria_text}"}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Technical Notes*\n{tech_text}"},
                {"type": "mrkdwn", "text": f"*Open Questions*\n{questions_text}"},
            ]
        },
        {"type": "divider"},
        {
            "type": "actions",
            "block_id": f"prd_review_{thread_id}",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve"},
                    "style": "primary",
                    "action_id": "approve_prd",
                    "value": thread_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Request Changes"},
                    "style": "danger",
                    "action_id": "reject_prd",
                    "value": thread_id,
                },
            ]
        }
    ]


# ── Public functions ─────────────────────────────────────────────────────────

def post_prd_for_review(state: AgentState) -> str | None:
    """
    Post the generated PRD to the review Slack channel.
    Returns the message timestamp (ts) for future updates.
    """
    if not state.prd:
        return None

    try:
        response = client.chat_postMessage(
            channel=settings.slack_prd_channel,
            text=f"New PRD ready for review: *{state.prd.title}*",
            blocks=_prd_blocks(state.prd, state.feature_request.source_id or "manual"),
        )
        ts = response["ts"]
        logger.info(f"[Slack] PRD posted for review. ts={ts}")
        return ts
    except SlackApiError as e:
        logger.error(f"[Slack] Failed to post PRD: {e.response['error']}")
        return None


def notify_prd_approved(state: AgentState) -> None:
    """Update the original Slack message to show approved status."""
    if not state.slack_message_ts or not state.prd:
        return

    try:
        client.chat_update(
            channel=settings.slack_prd_channel,
            ts=state.slack_message_ts,
            text=f"✅ PRD Approved: *{state.prd.title}* — moving to task creation.",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"✅ *PRD Approved:* {state.prd.title} v{state.prd.version}\n"
                                f"🔜 Stage 2: Task creation in Linear is starting..."
                    }
                }
            ]
        )
    except SlackApiError as e:
        logger.error(f"[Slack] Failed to update PRD message: {e.response['error']}")


def notify_error(channel: str, error_msg: str) -> None:
    """Post an error notification to Slack."""
    try:
        client.chat_postMessage(
            channel=channel,
            text=f"⚠️ *DevForge Error*: {error_msg}",
        )
    except SlackApiError as e:
        logger.error(f"[Slack] Failed to post error: {e.response['error']}")


def post_incomplete_request(channel: str, missing_info: list[str], ts: str = None) -> None:
    """Notify that the feature request needs more information."""
    missing_text = "\n".join(f"• {m}" for m in missing_info)
    text = (
        f"⚠️ *DevForge needs more information to generate a PRD.*\n\n"
        f"Please provide the following:\n{missing_text}"
    )
    try:
        kwargs = {"channel": channel, "text": text}
        if ts:
            kwargs["thread_ts"] = ts   # Reply in thread if from Slack
        client.chat_postMessage(**kwargs)
    except SlackApiError as e:
        logger.error(f"[Slack] Failed to post incomplete notice: {e.response['error']}")
