from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    FEATURE = "feature"
    CHORE   = "chore"
    SPIKE   = "spike"
    DOCS    = "docs"
    BUG     = "bug"
    TESTING = "testing"


class TaskPriority(str, Enum):
    URGENT = "urgent"
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


class TaskStatus(str, Enum):
    PENDING  = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVISED  = "revised"
    CREATED  = "created"


class EngineeringTask(BaseModel):
    id:                   str
    title:                str
    description:          str
    type:                 TaskType
    priority:             TaskPriority
    estimate_hours:       float
    acceptance_criteria:  list[str]         = Field(default_factory=list)
    dependencies:         list[str]         = Field(default_factory=list)
    labels:               list[str]         = Field(default_factory=list)
    linear_issue_id:      Optional[str]     = None
    linear_issue_url:     Optional[str]     = None


class DependencyEdge(BaseModel):
    from_task: str   # blocks this
    to_task:   str   # is blocked by from_task


class DependencyGraph(BaseModel):
    edges:                   list[DependencyEdge] = Field(default_factory=list)
    critical_path:           list[str]            = Field(default_factory=list)
    total_estimated_hours:   float                = 0.0
    parallel_tracks:         list[list[str]]      = Field(default_factory=list)


class Stage2State(BaseModel):
    prd_thread_id:      str
    stage2_thread_id:   str
    prd:                Optional[dict]        = None   # Serialized PRDDocument
    tasks:              list[EngineeringTask] = Field(default_factory=list)
    dependency_graph:   Optional[DependencyGraph] = None
    task_status:        TaskStatus            = TaskStatus.PENDING
    human_feedback:     Optional[str]         = None
    revision_count:     int                   = 0
    linear_issue_ids:   list[str]             = Field(default_factory=list)
    slack_message_ts:   Optional[str]         = None
    error:              Optional[str]         = None


# ── API schemas ───────────────────────────────────────────────────────────────

class StartStage2Request(BaseModel):
    prd_thread_id: str


class TaskReviewAction(BaseModel):
    action:   str              # "approve" | "reject"
    feedback: Optional[str] = None


class TasksResponse(BaseModel):
    status:             str
    tasks:              list[EngineeringTask]      = Field(default_factory=list)
    dependency_graph:   Optional[DependencyGraph]  = None
    message:            str
    thread_id:          str
    linear_issue_ids:   list[str]                  = Field(default_factory=list)
