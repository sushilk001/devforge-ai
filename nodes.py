import json
import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import AgentState, ParsedIntent, PRDDocument, PRDStatus
from .prompts import PARSE_REQUEST_PROMPT, GENERATE_PRD_PROMPT, REVISE_PRD_PROMPT
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── LLM ─────────────────────────────────────────────────────────────────────

def get_llm():
    return ChatAnthropic(
        model="claude-sonnet-4-20250514",
        api_key=settings.anthropic_api_key,
        temperature=0.3,
        max_tokens=4096,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_json_response(content: str) -> dict:
    """Safely parse JSON from LLM response, stripping markdown fences if present."""
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    return json.loads(content.strip())


# ── Node 1: Parse Request ────────────────────────────────────────────────────

def parse_request(state: AgentState) -> AgentState:
    """
    Node 1: Parse the raw feature request into structured intent.
    Determines if we have enough information to generate a PRD.
    """
    logger.info("[Node 1] Parsing feature request...")

    llm = get_llm()
    prompt = PARSE_REQUEST_PROMPT.format(raw_text=state.feature_request.raw_text)

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        data = _parse_json_response(response.content)
        state.parsed_intent = ParsedIntent(**data)
        logger.info(f"[Node 1] Parsed. is_complete={state.parsed_intent.is_complete}")
    except Exception as e:
        logger.error(f"[Node 1] Failed to parse request: {e}")
        state.error = f"Failed to parse feature request: {str(e)}"

    return state


# ── Node 2: Check Completeness ────────────────────────────────────────────────

def check_completeness(state: AgentState) -> str:
    """
    Conditional edge: decides next node based on whether we have enough info.
    Returns 'generate_prd' or 'request_incomplete'.
    """
    if state.error:
        return "request_incomplete"

    if state.parsed_intent and state.parsed_intent.is_complete:
        return "generate_prd"

    return "request_incomplete"


# ── Node 3: Handle Incomplete Request ────────────────────────────────────────

def request_incomplete(state: AgentState) -> AgentState:
    """
    Node 3: Feature request is missing critical information.
    Sets an error/message so the API can return what's missing to the caller.
    """
    logger.warning("[Node 3] Feature request is incomplete.")

    missing = state.parsed_intent.missing_info if state.parsed_intent else ["Unknown — parsing failed"]
    state.error = (
        "Feature request is missing critical information. Please provide: "
        + "; ".join(missing)
    )
    state.prd_status = PRDStatus.DRAFT
    return state


# ── Node 4: Generate PRD ──────────────────────────────────────────────────────

def generate_prd(state: AgentState) -> AgentState:
    """
    Node 4: Generate the full PRD from the parsed intent.
    """
    logger.info("[Node 4] Generating PRD...")

    llm = get_llm()
    intent = state.parsed_intent

    prompt = GENERATE_PRD_PROMPT.format(
        raw_text=state.feature_request.raw_text,
        problem_statement=intent.problem_statement,
        proposed_solution=intent.proposed_solution,
        target_users=", ".join(intent.target_users),
        business_value=intent.business_value,
    )

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        data = _parse_json_response(response.content)
        state.prd = PRDDocument(**data)
        state.prd_status = PRDStatus.PENDING
        logger.info(f"[Node 4] PRD generated: '{state.prd.title}'")
    except Exception as e:
        logger.error(f"[Node 4] Failed to generate PRD: {e}")
        state.error = f"Failed to generate PRD: {str(e)}"

    return state


# ── Node 5: Revise PRD ────────────────────────────────────────────────────────

def revise_prd(state: AgentState) -> AgentState:
    """
    Node 5: Revise the PRD based on human feedback.
    Triggered when reviewer rejects with feedback.
    """
    logger.info(f"[Node 5] Revising PRD (revision #{state.revision_count + 1})...")

    if not state.human_feedback:
        logger.warning("[Node 5] No feedback provided — skipping revision.")
        return state

    llm = get_llm()
    state.revision_count += 1
    new_version = f"1.{state.revision_count}"

    prompt = REVISE_PRD_PROMPT.format(
        original_prd=state.prd.model_dump_json(indent=2),
        feedback=state.human_feedback,
        new_version=new_version,
    )

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        data = _parse_json_response(response.content)
        state.prd = PRDDocument(**data)
        state.prd_status = PRDStatus.REVISED
        state.human_feedback = None   # Clear feedback after applying
        logger.info(f"[Node 5] PRD revised to v{new_version}")
    except Exception as e:
        logger.error(f"[Node 5] Failed to revise PRD: {e}")
        state.error = f"Failed to revise PRD: {str(e)}"

    return state


# ── Node 6: Finalize ──────────────────────────────────────────────────────────

def finalize_prd(state: AgentState) -> AgentState:
    """
    Node 6: PRD is approved. Mark as finalized.
    (Stage 2 will pick this up to create Linear tasks.)
    """
    logger.info(f"[Node 6] PRD finalized: '{state.prd.title}'")
    state.prd_status = PRDStatus.APPROVED
    return state
