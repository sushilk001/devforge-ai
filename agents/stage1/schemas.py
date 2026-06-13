from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


# ── Enums ────────────────────────────────────────────────────────────────────

class RequestSource(str, Enum):
    SLACK   = "slack"
    LINEAR  = "linear"
    API     = "api"


class PRDStatus(str, Enum):
    DRAFT    = "draft"
    PENDING  = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVISED  = "revised"


# ── Input ────────────────────────────────────────────────────────────────────

class FeatureRequest(BaseModel):
    raw_text: str            = Field(..., description="The raw feature request text")
    source:   RequestSource  = Field(default=RequestSource.API)
    source_id: Optional[str] = Field(None, description="Slack message TS or Linear issue ID")
    requester: Optional[str] = Field(None, description="Name or user ID of the requester")


# ── Intermediate ─────────────────────────────────────────────────────────────

class ParsedIntent(BaseModel):
    problem_statement:  str
    proposed_solution:  str
    target_users:       list[str]
    business_value:     str
    is_complete:        bool       = Field(description="True if enough info to write PRD")
    missing_info:       list[str]  = Field(default_factory=list)


class UserStory(BaseModel):
    as_a:    str
    i_want:  str
    so_that: str


class AcceptanceCriteria(BaseModel):
    given: str
    when:  str
    then:  str


class PRDDocument(BaseModel):
    title:               str
    version:             str = "1.0"
    problem_statement:   str
    goals:               list[str]
    non_goals:           list[str]
    user_stories:        list[UserStory]
    acceptance_criteria: list[AcceptanceCriteria]
    technical_notes:     list[str]
    open_questions:      list[str]


# ── LangGraph State ──────────────────────────────────────────────────────────

class AgentState(BaseModel):
    feature_request:  FeatureRequest

    parsed_intent:    Optional[ParsedIntent]  = None
    prd:              Optional[PRDDocument]   = None

    prd_status:       PRDStatus               = PRDStatus.DRAFT
    human_feedback:   Optional[str]           = None
    revision_count:   int                     = 0

    slack_message_ts: Optional[str]           = None
    error:            Optional[str]           = None


# ── API Request/Response ─────────────────────────────────────────────────────

class SubmitFeatureRequest(BaseModel):
    raw_text:  str
    requester: Optional[str] = None


class PRDResponse(BaseModel):
    status:  PRDStatus
    prd:     Optional[PRDDocument] = None
    message: str


class ReviewAction(BaseModel):
    action:   Literal["approve", "reject"]
    feedback: Optional[str] = None
