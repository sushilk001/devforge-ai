from pydantic import BaseModel
from enum import Enum
from typing import Optional


class ReviewSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    BLOCKER = "blocker"


class ReviewFinding(BaseModel):
    agent: str          # "security" | "quality" | "coverage" | "architecture"
    severity: ReviewSeverity
    title: str
    description: str
    recommendation: str


class Stage3State(BaseModel):
    prd_thread_id: Optional[str] = None
    stage2_thread_id: Optional[str] = None
    prd: dict = {}
    tasks: list = []
    findings: list = []          # list of ReviewFinding dicts
    verdict: str = ""
    blockers: int = 0
    warnings: int = 0
    human_feedback: Optional[str] = None
    approved: bool = False
    error: Optional[str] = None
    slack_ts: Optional[str] = None


class ReviewResponse(BaseModel):
    status: str
    findings: list = []
    verdict: str = ""
    blockers: int = 0
    warnings: int = 0
    message: str = ""
