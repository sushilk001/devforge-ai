import json
import time
import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from .schemas import AgentState, ParsedIntent, PRDDocument, PRDStatus, RequestType
from .prompts import (
    PARSE_REQUEST_PROMPT, GENERATE_PRD_PROMPT, REVISE_PRD_PROMPT,
    NEW_SOFTWARE_PARSE_PROMPT, NEW_SOFTWARE_PRD_PROMPT,
)
from config import get_settings
from api.runtime_config import get_api_key, get_model

logger = logging.getLogger(__name__)
settings = get_settings()


def _llm_invoke(llm, messages, stage: str, label: str) -> any:
    from api.observability import record_llm_call
    t0 = time.time()
    response = llm.invoke(messages)
    latency_ms = int((time.time() - t0) * 1000)
    usage = getattr(response, "response_metadata", {}).get("usage", {})
    record_llm_call(
        stage=stage, label=label, model=llm.model,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        latency_ms=latency_ms,
    )
    return response


def get_llm():
    return ChatAnthropic(
        model=get_model(),
        api_key=get_api_key(),
        temperature=0.3,
        max_tokens=8192,
    )


def _parse_json_response(content: str) -> dict:
    content = content.strip()

    # Strip ```json ... ``` or ``` ... ``` fences
    import re
    fence_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
    if fence_match:
        content = fence_match.group(1).strip()

    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Extract outermost JSON object (first { to last })
    start = content.find('{')
    end = content.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except json.JSONDecodeError:
            pass

    # Re-raise with original content to surface the real error
    return json.loads(content)


def _context_suffix(state: AgentState) -> str:
    ctx = state.feature_request.additional_context
    if not ctx:
        return ""
    return f"\n\n## Additional Context (files / GitHub repo)\nUse this to inform your understanding — treat it as supplementary reference material.\n\n{ctx}"


def parse_request(state: AgentState) -> AgentState:
    logger.info("[Stage1/Node1] Parsing feature request...")
    llm = get_llm()
    is_new = state.feature_request.request_type == RequestType.NEW_SOFTWARE
    if is_new:
        prompt = NEW_SOFTWARE_PARSE_PROMPT.format(raw_text=state.feature_request.raw_text)
    else:
        prompt = PARSE_REQUEST_PROMPT.format(raw_text=state.feature_request.raw_text)
    prompt += _context_suffix(state)

    try:
        response = _llm_invoke(llm, [HumanMessage(content=prompt)], "requirements", "parse_request")
        data = _parse_json_response(response.content)
        state.parsed_intent = ParsedIntent(**{k: v for k, v in data.items() if k in ParsedIntent.model_fields})
        logger.info(f"[Stage1/Node1] Parsed. is_complete={state.parsed_intent.is_complete}")
    except Exception as e:
        logger.error(f"[Stage1/Node1] Failed: {e}")
        state.error = f"Failed to parse feature request: {str(e)}"

    return state


def check_completeness(state: AgentState) -> str:
    if state.error:
        return "request_incomplete"
    if state.parsed_intent and state.parsed_intent.is_complete:
        return "generate_prd"
    return "request_incomplete"


def request_incomplete(state: AgentState) -> AgentState:
    logger.warning("[Stage1/Node3] Feature request is incomplete.")
    if state.error:
        # Preserve the real error (e.g. missing API key, network failure)
        state.prd_status = PRDStatus.DRAFT
        return state
    missing = state.parsed_intent.missing_info if state.parsed_intent else ["Unknown — parsing failed"]
    state.error = (
        "Feature request is missing critical information. Please provide: "
        + "; ".join(missing)
    )
    state.prd_status = PRDStatus.DRAFT
    return state


def generate_prd(state: AgentState) -> AgentState:
    logger.info("[Stage1/Node4] Generating PRD...")
    llm = get_llm()
    intent = state.parsed_intent
    is_new = state.feature_request.request_type == RequestType.NEW_SOFTWARE

    if is_new:
        prompt = NEW_SOFTWARE_PRD_PROMPT.format(
            raw_text=state.feature_request.raw_text,
            problem_statement=intent.problem_statement,
            proposed_solution=intent.proposed_solution,
            target_users=", ".join(intent.target_users),
            business_value=intent.business_value,
            tech_stack_hints=intent.tech_stack_hints,
            project_type=intent.project_type or "other",
        )
    else:
        prompt = GENERATE_PRD_PROMPT.format(
            raw_text=state.feature_request.raw_text,
            problem_statement=intent.problem_statement,
            proposed_solution=intent.proposed_solution,
            target_users=", ".join(intent.target_users),
            business_value=intent.business_value,
        )
    prompt += _context_suffix(state)

    try:
        response = _llm_invoke(llm, [HumanMessage(content=prompt)], "requirements", "generate_prd")
        data = _parse_json_response(response.content)
        state.prd = PRDDocument(**data)
        state.prd_status = PRDStatus.PENDING
        logger.info(f"[Stage1/Node4] PRD generated: '{state.prd.title}'")
    except Exception as e:
        logger.error(f"[Stage1/Node4] Failed: {e}")
        state.error = f"Failed to generate PRD: {str(e)}"

    return state


def revise_prd(state: AgentState) -> AgentState:
    logger.info(f"[Stage1/Node5] Revising PRD (revision #{state.revision_count + 1})...")

    if not state.human_feedback:
        logger.warning("[Stage1/Node5] No feedback — skipping revision.")
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
        response = _llm_invoke(llm, [HumanMessage(content=prompt)], "requirements", "revise_prd")
        data = _parse_json_response(response.content)
        data["version"] = new_version  # force-bump before model construction
        state.prd = PRDDocument(**data)
        state.prd_status = PRDStatus.REVISED
        state.human_feedback = None
        logger.info(f"[Stage1/Node5] PRD revised to v{new_version}")
    except Exception as e:
        logger.error(f"[Stage1/Node5] Failed: {e}")
        state.error = f"Failed to revise PRD: {str(e)}"

    return state


def finalize_prd(state: AgentState) -> AgentState:
    logger.info(f"[Stage1/Node6] PRD finalized: '{state.prd.title}'")
    state.prd_status = PRDStatus.APPROVED
    return state
