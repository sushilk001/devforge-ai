# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
from pydantic import BaseModel
from enum import Enum
from typing import Optional


class ComplianceSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING  = "warning"
    INFO     = "info"


class ComplianceFinding(BaseModel):
    agent:          str   # "accessibility"|"privacy"|"security"|"licensing"
    severity:       ComplianceSeverity
    standard:       str   # e.g. "WCAG 2.2 SC 1.4.3"
    title:          str
    description:    str
    file:           Optional[str] = None
    recommendation: str


class ComplianceState(BaseModel):
    s4_thread_id:   str
    project_slug:   str = ""
    prd:            dict = {}
    tasks:          list = []
    findings:       list = []   # list of ComplianceFinding dicts
    score:          int  = 0
    verdict:        str  = ""
    criticals:      int  = 0
    warnings_count: int  = 0
    approved:       bool = False
    decision:       str  = ""   # "approved"|"deployed_anyway"|"blocked"
    error:          Optional[str] = None


class ComplianceReport(BaseModel):
    status:        str
    findings:      list = []
    score:         int  = 0
    verdict:       str  = ""
    criticals:     int  = 0
    warnings_count: int = 0
    message:       str  = ""
    debt_history:  list = []   # [{date, score, criticals, warnings}]
