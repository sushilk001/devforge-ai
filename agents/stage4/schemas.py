from pydantic import BaseModel
from typing import Optional


class GeneratedFile(BaseModel):
    filename: str        # e.g. "src/auth/reset_password.py"
    language: str        # e.g. "python", "typescript", "javascript"
    content: str         # actual code content
    description: str     # one-line what this file does


class GeneratedTask(BaseModel):
    task_id: str
    task_title: str
    files: list[GeneratedFile] = []
    summary: str = ""    # what was generated
    error: Optional[str] = None


class Stage4State(BaseModel):
    plan_review_thread_id: Optional[str] = None
    stage2_thread_id: Optional[str] = None
    prd: dict = {}
    tasks: list = []
    generated: list = []   # list of GeneratedTask dicts
    total_files: int = 0
    human_feedback: Optional[str] = None
    approved: bool = False
    error: Optional[str] = None
    slack_ts: Optional[str] = None


class CodeGenResponse(BaseModel):
    status: str
    generated: list = []
    total_files: int = 0
    message: str = ""
