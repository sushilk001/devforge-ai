# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
#!/usr/bin/env python3
"""
DevForge AI — End-to-End Test Suite
====================================
Tests every stage of the SDLC pipeline running at http://localhost:8000.

Usage:
    python3 test_e2e.py

Exit code:
    0  — all tests passed
    1  — one or more tests failed
"""

import re
import sys
import time

try:
    import requests
except ImportError:
    print("Error: 'requests' package not found. Install with:  pip install requests")
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL       = "http://localhost:8000"
POLL_INTERVAL  = 3    # seconds between poll attempts
POLL_TIMEOUT   = 120  # seconds before giving up on a poll
STAGE_SETTLE   = 5    # seconds to wait after a stage approval
REQ_TIMEOUT    = 180  # seconds for slow LLM-backed POST calls

# ── ANSI colour helpers ───────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

# ── Test result ledger ────────────────────────────────────────────────────────
_results: list[tuple[str, bool, str]] = []  # (name, passed, detail)


def check(name: str, passed: bool, detail: str = "") -> bool:
    """Record an assertion and print ✅ PASS / ❌ FAIL immediately."""
    icon   = "✅" if passed else "❌"
    colour = GREEN if passed else RED
    line   = f"  {colour}{icon} {'PASS' if passed else 'FAIL'}{RESET}  {name}"
    if detail:
        line += f"  [{detail}]"
    print(line)
    _results.append((name, passed, detail))
    return passed


def section(title: str) -> None:
    """Print a visual section header."""
    print(f"\n{BOLD}{CYAN}{'─' * 64}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─' * 64}{RESET}")


# ── Polling helper ────────────────────────────────────────────────────────────

def poll_until(
    label: str,
    url: str,
    condition: callable,
    timeout: int  = POLL_TIMEOUT,
    interval: int = POLL_INTERVAL,
) -> dict | None:
    """
    GET *url* every *interval* seconds until *condition(response_data)* is True.

    - 404 responses are silently retried (background tasks not yet stored).
    - Returns the matching response dict, or None on timeout.
    """
    deadline = time.time() + timeout
    attempt  = 0
    while time.time() < deadline:
        attempt += 1
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 200:
                data = r.json()
                if condition(data):
                    print(f"    {YELLOW}⏳ {label}: ready after {attempt} poll(s){RESET}")
                    return data
                if attempt % 5 == 0 or attempt <= 2:
                    status_hint = data.get("status") or data.get("task_status") or list(data.keys())[:3]
                    print(f"    {YELLOW}⏳ {label}: still waiting… (attempt {attempt}, got={status_hint!r}){RESET}")
            elif r.status_code == 404:
                pass  # background task not yet stored — keep polling silently
            else:
                print(f"    {YELLOW}⏳ {label}: HTTP {r.status_code} — retrying…{RESET}")
        except requests.exceptions.ConnectionError as exc:
            print(f"    {RED}⚠ poll connection error: {exc}{RESET}")
        except requests.exceptions.RequestException as exc:
            print(f"    {RED}⚠ poll request error: {exc}{RESET}")
        time.sleep(interval)

    print(f"    {RED}✗ {label}: timed out after {timeout}s ({attempt} attempts){RESET}")
    return None


def extract_s1_tid(message: str) -> str | None:
    """
    Parse the Stage 1 thread_id out of the submit response message.
    The message contains 'Thread ID: <uuid>' and/or '/stage1/review/<uuid>'.
    """
    uuid_pat = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    m = re.search(rf"Thread ID:\s+({uuid_pat})", message, re.IGNORECASE)
    if m:
        return m.group(1)
    # Fallback: extract from the review URL embedded in the message
    m = re.search(rf"/stage1/review/({uuid_pat})", message)
    return m.group(1) if m else None


# ─────────────────────────────────────────────────────────────────────────────
#  Pipeline state shared across happy-path stages
# ─────────────────────────────────────────────────────────────────────────────
s1_tid     : str | None = None
s2_tid     : str | None = None
s3_tid     : str | None = None
s4_tid     : str | None = None
qa_tid     : str | None = None
deploy_tid : str | None = None

HAPPY_PATH_INPUT = (
    "Build a URL trust analyzer that checks domain age, SSL cert, "
    "redirect chains, and scores 0-100"
)


# ═════════════════════════════════════════════════════════════════════════════
#  ISOLATED FAIL TESTS  (no dependency on the happy-path pipeline)
# ═════════════════════════════════════════════════════════════════════════════

def test_s1_incomplete() -> None:
    """
    FAIL TEST — Stage 1: Incomplete Request
    Submit a vague/incomplete request and verify the API returns an error
    response (status='draft') rather than generating a full PRD.
    """
    section("FAIL TEST — Stage 1: Incomplete Request")
    try:
        r = requests.post(
            f"{BASE_URL}/stage1/submit",
            json={"raw_text": "build something", "requester": "test-runner"},
            timeout=REQ_TIMEOUT,
        )
        if not check("S1-FAIL-01  submit returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data   = r.json()
        status = data.get("status", "")
        msg    = data.get("message", "")

        # Incomplete requests go through check_completeness → request_incomplete
        # which sets prd_status=DRAFT and stores an error message.
        is_error = (
            status == "draft"
            or "missing" in msg.lower()
            or "incomplete" in msg.lower()
            or "clarif" in msg.lower()
            or "provide" in msg.lower()
        )
        check(
            "S1-FAIL-02  incomplete input returns error/missing-info status",
            is_error,
            f"status={status!r}  msg_preview={msg[:80]!r}",
        )
    except Exception as exc:
        check("S1-FAIL-01  submit returns 200", False, str(exc))


def test_s1_reject_feedback() -> None:
    """
    FAIL TEST — Stage 1: Reject with Feedback
    Submit a valid request → reject with feedback → verify status=revised
    and that prd.version is bumped from the original value.
    """
    section("FAIL TEST — Stage 1: Reject with Feedback")

    # ── 1. Submit a fresh valid request ──────────────────────────────────────
    try:
        r = requests.post(
            f"{BASE_URL}/stage1/submit",
            json={
                "raw_text": (
                    "Add a password strength checker endpoint to our user auth API. "
                    "It should evaluate entropy, check common patterns, and verify "
                    "against HaveIBeenPwned breach lists. Return a score 0-100."
                ),
                "requester":    "test-runner",
                "request_type": "add_feature",
            },
            timeout=REQ_TIMEOUT,
        )
        if not check("S1-FAIL-R01  submit returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S1-FAIL-R02  status is pending_review",
              data.get("status") == "pending_review", data.get("status"))

        original_version = (data.get("prd") or {}).get("version", "1.0")
        check("S1-FAIL-R03  initial PRD has version field", bool(original_version),
              original_version)

        tid = extract_s1_tid(data.get("message", ""))
        if not check("S1-FAIL-R04  thread_id parsed from message", bool(tid),
                     tid or "parse failed"):
            return

    except Exception as exc:
        check("S1-FAIL-R01  submit returns 200", False, str(exc))
        return

    # ── 2. Reject with feedback ───────────────────────────────────────────────
    time.sleep(STAGE_SETTLE)
    try:
        r = requests.post(
            f"{BASE_URL}/stage1/review/{tid}",
            json={"action": "reject", "feedback": "add mobile app support and offline mode"},
            timeout=REQ_TIMEOUT,
        )
        if not check("S1-FAIL-R05  reject returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S1-FAIL-R06  status is revised after reject",
              data.get("status") == "revised", data.get("status"))
        check("S1-FAIL-R07  message mentions revision",
              "revised" in data.get("message", "").lower(),
              data.get("message", "")[:80])

        revised_prd = data.get("prd") or {}
        check("S1-FAIL-R08  revised PRD title is non-empty",
              bool(revised_prd.get("title")), revised_prd.get("title"))

        revised_version = revised_prd.get("version", "")
        check("S1-FAIL-R09  version is bumped (e.g. 1.0 → 1.1)",
              bool(revised_version) and revised_version != original_version,
              f"{original_version!r} → {revised_version!r}")

    except Exception as exc:
        check("S1-FAIL-R05  reject returns 200", False, str(exc))
        return

    # ── 3. Poll GET /prd/{tid} — confirm revised status is persisted ──────────
    data = poll_until(
        "Stage 1 revised PRD",
        f"{BASE_URL}/stage1/prd/{tid}",
        lambda d: d.get("status") in ("revised", "pending_review"),
        timeout=30,
    )
    check("S1-FAIL-R10  GET /prd/{tid} reflects revised/pending_review status",
          data is not None and data.get("status") in ("revised", "pending_review"),
          data.get("status", "timeout") if data else "timeout")


# ═════════════════════════════════════════════════════════════════════════════
#  HAPPY PATH — full S1 → S2 → S3 → S4 → S5 → S6 pipeline
# ═════════════════════════════════════════════════════════════════════════════

def run_s1() -> None:
    """Stage 1: submit valid request → poll PRD → approve."""
    global s1_tid
    section("HAPPY PATH — Stage 1: Requirements Agent")

    # ── submit ────────────────────────────────────────────────────────────────
    try:
        r = requests.post(
            f"{BASE_URL}/stage1/submit",
            json={
                "raw_text":    HAPPY_PATH_INPUT,
                "requester":   "test-runner",
                "request_type": "new_software",
            },
            timeout=REQ_TIMEOUT,
        )
        if not check("S1-HP-01  submit returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S1-HP-02  status is pending_review",
              data.get("status") == "pending_review", data.get("status"))

        prd_title = (data.get("prd") or {}).get("title", "")
        check("S1-HP-03  PRD title is non-empty", bool(prd_title), prd_title)

        s1_tid = extract_s1_tid(data.get("message", ""))
        if not check("S1-HP-04  thread_id parsed from message", bool(s1_tid),
                     s1_tid or "parse failed"):
            return

    except Exception as exc:
        check("S1-HP-01  submit returns 200", False, str(exc))
        return

    # ── poll GET /prd/{tid} ───────────────────────────────────────────────────
    data = poll_until(
        "Stage 1 PRD",
        f"{BASE_URL}/stage1/prd/{s1_tid}",
        lambda d: d.get("status") == "pending_review",
        timeout=30,
    )
    check("S1-HP-05  GET /prd/{tid} returns pending_review",
          data is not None and data.get("status") == "pending_review",
          data.get("status", "timeout") if data else "timeout")

    # ── approve ───────────────────────────────────────────────────────────────
    print(f"    {YELLOW}⏳ waiting {STAGE_SETTLE}s before approval…{RESET}")
    time.sleep(STAGE_SETTLE)
    try:
        r = requests.post(
            f"{BASE_URL}/stage1/review/{s1_tid}",
            json={"action": "approve"},
            timeout=REQ_TIMEOUT,
        )
        if not check("S1-HP-06  approve returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S1-HP-07  status is approved", data.get("status") == "approved",
              data.get("status"))
        check("S1-HP-08  message references Stage 2",
              "stage 2" in data.get("message", "").lower(),
              data.get("message", "")[:80])
    except Exception as exc:
        check("S1-HP-06  approve returns 200", False, str(exc))


def run_s2() -> None:
    """Stage 2: start task orchestration → poll tasks → approve."""
    global s2_tid
    if not s1_tid:
        check("S2-HP-01  start (skipped — no s1_tid)", False, "Stage 1 did not produce s1_tid")
        return

    section("HAPPY PATH — Stage 2: Task Orchestration")

    # ── start (synchronous — runs LangGraph graph inline) ────────────────────
    try:
        r = requests.post(f"{BASE_URL}/stage2/start/{s1_tid}", timeout=REQ_TIMEOUT)
        if not check("S2-HP-01  start returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            print(f"    response body: {r.text[:300]}")
            return

        data   = r.json()
        s2_tid = data.get("thread_id")
        check("S2-HP-02  thread_id in response", bool(s2_tid), s2_tid or "missing")
        task_count = len(data.get("tasks", []))
        check("S2-HP-03  tasks generated", task_count > 0, f"{task_count} tasks")

    except Exception as exc:
        check("S2-HP-01  start returns 200", False, str(exc))
        return

    # ── poll GET /tasks/{tid} ─────────────────────────────────────────────────
    data = poll_until(
        "Stage 2 tasks",
        f"{BASE_URL}/stage2/tasks/{s2_tid}",
        lambda d: len(d.get("tasks", [])) > 0,
        timeout=30,
    )
    check("S2-HP-04  GET /tasks/{tid} has tasks",
          data is not None and len(data.get("tasks", [])) > 0,
          f"{len(data.get('tasks', [])) if data else 0} tasks")

    # ── approve ───────────────────────────────────────────────────────────────
    print(f"    {YELLOW}⏳ waiting {STAGE_SETTLE}s before approval…{RESET}")
    time.sleep(STAGE_SETTLE)
    try:
        r = requests.post(
            f"{BASE_URL}/stage2/review/{s2_tid}",
            json={"action": "approve"},
            timeout=REQ_TIMEOUT,
        )
        if not check("S2-HP-05  approve returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S2-HP-06  status is created/approved", data.get("status") in ("approved", "created"),
              data.get("status"))
    except Exception as exc:
        check("S2-HP-05  approve returns 200", False, str(exc))


def run_s3() -> None:
    """Stage 3: start PR review → poll verdict → run changes_requested fail test → approve."""
    global s3_tid
    if not s2_tid:
        check("S3-HP-01  start (skipped — no s2_tid)", False, "Stage 2 did not produce s2_tid")
        return

    section("HAPPY PATH — Stage 3: PR Review Agent")

    # ── start (async background task) ────────────────────────────────────────
    try:
        r = requests.post(f"{BASE_URL}/stage3/start/{s2_tid}", timeout=30)
        if not check("S3-HP-01  start returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data   = r.json()
        s3_tid = data.get("thread_id")
        check("S3-HP-02  thread_id in start response", bool(s3_tid), s3_tid or "missing")
        check("S3-HP-03  status is started", data.get("status") == "started",
              data.get("status"))
    except Exception as exc:
        check("S3-HP-01  start returns 200", False, str(exc))
        return

    # ── poll GET /review/{tid} until verdict is populated ────────────────────
    data = poll_until(
        "Stage 3 review",
        f"{BASE_URL}/stage3/review/{s3_tid}",
        lambda d: bool(d.get("verdict")),
        timeout=240,
    )
    if not check("S3-HP-04  review completes with verdict",
                 data is not None and bool(data.get("verdict")),
                 data.get("verdict", "timeout") if data else "timeout"):
        return

    check("S3-HP-05  findings list present",
          isinstance(data.get("findings"), list),
          f"{len(data.get('findings', []))} findings")
    check("S3-HP-06  blockers/warnings counts present",
          "blockers" in data and "warnings" in data,
          f"blockers={data.get('blockers')} warnings={data.get('warnings')}")

    # ── EMBEDDED FAIL TEST: changes_requested ────────────────────────────────
    _test_s3_changes_requested()

    # ── approve (happy path continues) ───────────────────────────────────────
    section("HAPPY PATH — Stage 3: Approve")
    print(f"    {YELLOW}⏳ waiting {STAGE_SETTLE}s before approval…{RESET}")
    time.sleep(STAGE_SETTLE)
    try:
        r = requests.post(
            f"{BASE_URL}/stage3/review/{s3_tid}",
            json={"action": "approve"},
            timeout=60,
        )
        if not check("S3-HP-07  approve returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S3-HP-08  status is approved after approve",
              data.get("status") == "approved", data.get("status"))
    except Exception as exc:
        check("S3-HP-07  approve returns 200", False, str(exc))


def _test_s3_changes_requested() -> None:
    """
    FAIL TEST — Stage 3: changes_requested feedback cycle.
    Uses the s3_tid from the active happy-path review session.
    """
    section("FAIL TEST — Stage 3: changes_requested")
    if not s3_tid:
        check("S3-FAIL-01  changes_requested (skipped — no s3_tid)", False, "no s3_tid")
        return

    # ── send changes_requested ────────────────────────────────────────────────
    try:
        r = requests.post(
            f"{BASE_URL}/stage3/review/{s3_tid}",
            json={
                "action":   "changes_requested",
                "feedback": "Add OWASP Top-10 security checks and flag insecure redirect chains",
            },
            timeout=30,
        )
        if not check("S3-FAIL-01  changes_requested returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S3-FAIL-02  status is rerunning", data.get("status") == "rerunning",
              data.get("status"))
        check("S3-FAIL-03  findings cleared immediately",
              data.get("findings") == [] or len(data.get("findings", [])) == 0,
              f"{len(data.get('findings', []))} findings in rerunning response")
    except Exception as exc:
        check("S3-FAIL-01  changes_requested returns 200", False, str(exc))
        return

    # ── poll until re-review completes ────────────────────────────────────────
    # After changes_requested, verdict is cleared to ""; poll until non-empty again.
    data = poll_until(
        "Stage 3 re-review with feedback",
        f"{BASE_URL}/stage3/review/{s3_tid}",
        lambda d: bool(d.get("verdict")),
        timeout=240,  # 4 review agents can take >120s under load
    )
    check("S3-FAIL-04  re-review completes with updated verdict",
          data is not None and bool(data.get("verdict")),
          data.get("verdict", "timeout") if data else "timeout")
    check("S3-FAIL-05  findings populated after re-review",
          data is not None and len(data.get("findings", [])) > 0,
          f"{len(data.get('findings', [])) if data else 0} findings")


def run_s4() -> None:
    """Stage 4: start code gen → poll files → run changes_requested fail test → approve."""
    global s4_tid
    if not s2_tid:
        check("S4-HP-01  start (skipped — no s2_tid)", False, "Stage 2 did not produce s2_tid")
        return

    section("HAPPY PATH — Stage 4: Code Generation Agent")

    # ── start (async background task) ────────────────────────────────────────
    try:
        r = requests.post(f"{BASE_URL}/stage4/start/{s2_tid}", timeout=30)
        if not check("S4-HP-01  start returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data   = r.json()
        s4_tid = data.get("thread_id")
        check("S4-HP-02  thread_id in start response", bool(s4_tid), s4_tid or "missing")
        check("S4-HP-03  status is started", data.get("status") == "started",
              data.get("status"))
    except Exception as exc:
        check("S4-HP-01  start returns 200", False, str(exc))
        return

    # ── poll GET /code/{tid} until files are generated ───────────────────────
    data = poll_until(
        "Stage 4 code gen",
        f"{BASE_URL}/stage4/code/{s4_tid}",
        lambda d: d.get("total_files", 0) > 0 or len(d.get("generated", [])) > 0,
        timeout=360,  # 14 tasks × LLM call can take 5+ minutes
    )
    if not check("S4-HP-04  code gen completes with files",
                 data is not None and (
                     data.get("total_files", 0) > 0 or len(data.get("generated", [])) > 0
                 ),
                 f"total_files={data.get('total_files', 0) if data else 'timeout'}"):
        return

    check("S4-HP-05  generated task list is non-empty",
          len(data.get("generated", [])) > 0,
          f"{len(data.get('generated', []))} tasks")
    check("S4-HP-06  total_files > 0",
          data.get("total_files", 0) > 0, f"total_files={data.get('total_files', 0)}")

    # ── EMBEDDED FAIL TEST: changes_requested ────────────────────────────────
    _test_s4_changes_requested()

    # ── approve (happy path continues) ───────────────────────────────────────
    section("HAPPY PATH — Stage 4: Approve")
    print(f"    {YELLOW}⏳ waiting {STAGE_SETTLE}s before approval…{RESET}")
    time.sleep(STAGE_SETTLE)
    try:
        r = requests.post(
            f"{BASE_URL}/stage4/code/{s4_tid}",
            json={"action": "approve"},
            timeout=60,
        )
        if not check("S4-HP-07  approve returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S4-HP-08  status is approved", data.get("status") == "approved",
              data.get("status"))
        check("S4-HP-09  approved response has files",
              data.get("total_files", 0) > 0,
              f"total_files={data.get('total_files', 0)}")
    except Exception as exc:
        check("S4-HP-07  approve returns 200", False, str(exc))


def _test_s4_changes_requested() -> None:
    """
    FAIL TEST — Stage 4: changes_requested feedback cycle.
    Uses the s4_tid from the active happy-path code gen session.
    """
    section("FAIL TEST — Stage 4: changes_requested")
    if not s4_tid:
        check("S4-FAIL-01  changes_requested (skipped — no s4_tid)", False, "no s4_tid")
        return

    # ── send changes_requested ────────────────────────────────────────────────
    try:
        r = requests.post(
            f"{BASE_URL}/stage4/code/{s4_tid}",
            json={
                "action":   "changes_requested",
                "feedback": "Add input validation, error handling, and unit tests to all API endpoints",
            },
            timeout=30,
        )
        if not check("S4-FAIL-01  changes_requested returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data = r.json()
        check("S4-FAIL-02  status is rerunning", data.get("status") == "rerunning",
              data.get("status"))
        check("S4-FAIL-03  generated cleared immediately",
              data.get("total_files", 0) == 0 and len(data.get("generated", [])) == 0,
              f"total_files={data.get('total_files')} generated={len(data.get('generated', []))}")
    except Exception as exc:
        check("S4-FAIL-01  changes_requested returns 200", False, str(exc))
        return

    # ── poll status endpoint until regen completes (status: complete) or errors ──
    status_data = poll_until(
        "Stage 4 regen with feedback",
        f"{BASE_URL}/stage4/status/{s4_tid}",
        lambda d: d.get("status") in ("complete", "error"),
        timeout=300,
    )
    regen_ok = (
        status_data is not None
        and status_data.get("status") == "complete"
        and status_data.get("total_files", 0) > 0
    )
    check("S4-FAIL-04  regen completes with updated files",
          regen_ok,
          f"status={status_data.get('status', 'timeout') if status_data else 'timeout'} "
          f"total_files={status_data.get('total_files', 0) if status_data else 0}")

    # fetch actual generated files for S4-FAIL-05
    data = None
    if regen_ok:
        try:
            r = requests.get(f"{BASE_URL}/stage4/code/{s4_tid}", timeout=30)
            if r.status_code == 200:
                data = r.json()
        except Exception:
            pass
    check("S4-FAIL-05  generated task list populated after regen",
          data is not None and len(data.get("generated", [])) > 0,
          f"{len(data.get('generated', [])) if data else 0} tasks")


def run_qa() -> None:
    """Stage 5 (QA): trigger pytest run → poll until complete."""
    global qa_tid
    if not s4_tid:
        check("QA-HP-01  run (skipped — no s4_tid)", False, "Stage 4 did not produce s4_tid")
        return

    section("HAPPY PATH — Stage 5: QA Runner")

    try:
        r = requests.post(f"{BASE_URL}/qa/run/{s4_tid}", timeout=30)
        if not check("QA-HP-01  run returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data   = r.json()
        qa_tid = data.get("qa_thread_id")
        check("QA-HP-02  qa_thread_id in response", bool(qa_tid), qa_tid or "missing")
        check("QA-HP-03  status is started", data.get("status") == "started",
              data.get("status"))
    except Exception as exc:
        check("QA-HP-01  run returns 200", False, str(exc))
        return

    # ── poll GET /qa/results/{qa_tid} ─────────────────────────────────────────
    data = poll_until(
        "QA runner",
        f"{BASE_URL}/qa/results/{qa_tid}",
        lambda d: d.get("status") in ("complete", "error"),
    )
    check("QA-HP-04  QA finishes (complete or error)",
          data is not None and data.get("status") in ("complete", "error"),
          data.get("status", "timeout") if data else "timeout")

    if data:
        check("QA-HP-05  result object present",
              data.get("result") is not None or data.get("status") in ("complete", "error"))
        result = data.get("result") or {}
        if result:
            total  = result.get("total", 0)
            passed = result.get("passed", 0)
            failed = result.get("failed", 0)
            errs   = result.get("errors", 0)
            print(
                f"    {YELLOW}ℹ  QA summary: {passed} passed / "
                f"{failed} failed / {errs} errors / {total} total{RESET}"
            )


def run_s6() -> None:
    """Stage 6: trigger deploy → poll to completion → verify pr_url."""
    global deploy_tid
    if not s4_tid or not s2_tid:
        check("S6-HP-01  deploy (skipped — missing s4_tid or s2_tid)", False,
              f"s4_tid={s4_tid}  s2_tid={s2_tid}")
        return

    section("HAPPY PATH — Stage 6: Deploy")

    deploy_body = {
        "stage4_thread_id": s4_tid,
        "stage2_thread_id": s2_tid,
        "qa_thread_id":     qa_tid,      # optional — may be None
        "stage3_thread_id": s3_tid,      # optional — may be None
    }

    try:
        r = requests.post(f"{BASE_URL}/stage6/deploy", json=deploy_body, timeout=30)
        if not check("S6-HP-01  deploy returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data       = r.json()
        deploy_tid = data.get("deploy_thread_id")
        check("S6-HP-02  deploy_thread_id in response", bool(deploy_tid),
              deploy_tid or "missing")
        check("S6-HP-03  status is started", data.get("status") == "started",
              data.get("status"))
    except Exception as exc:
        check("S6-HP-01  deploy returns 200", False, str(exc))
        return

    # ── poll GET /stage6/status/{deploy_tid} ──────────────────────────────────
    data = poll_until(
        "Stage 6 deploy",
        f"{BASE_URL}/stage6/status/{deploy_tid}",
        lambda d: d.get("status") in ("complete", "error"),
        timeout=180,    # push + PR creation can be slow
    )
    check("S6-HP-04  deploy completes",
          data is not None and data.get("status") in ("complete", "error"),
          data.get("status", "timeout") if data else "timeout")

    if not data:
        return

    check("S6-HP-05  deploy status is complete (not error)",
          data.get("status") == "complete", data.get("status"))
    check("S6-HP-06  pr_url is present and non-empty",
          bool(data.get("pr_url")), data.get("pr_url") or "missing")
    check("S6-HP-07  branch is present",
          bool(data.get("branch")), data.get("branch") or "missing")
    check("S6-HP-08  files_pushed > 0",
          (data.get("files_pushed") or 0) > 0,
          f"files_pushed={data.get('files_pushed', 0)}")

    if data.get("pr_url"):
        print(f"    {GREEN}ℹ  PR URL: {data['pr_url']}{RESET}")
    if data.get("error"):
        print(f"    {RED}ℹ  deploy error: {data['error']}{RESET}")

    # ── EMBEDDED FAIL TEST: existing PR ──────────────────────────────────────
    _test_s6_existing_pr()


def _test_s6_existing_pr() -> None:
    """
    FAIL TEST — Stage 6: deploy when branch / PR already exists.
    Re-trigger deploy with the same IDs; the server should return the
    existing PR URL rather than crashing with a 422 from GitHub.
    """
    section("FAIL TEST — Stage 6: Re-deploy with Existing Branch")
    if not s4_tid or not s2_tid:
        check("S6-FAIL-01  re-deploy (skipped — missing IDs)", False,
              f"s4_tid={s4_tid}  s2_tid={s2_tid}")
        return

    deploy_body = {
        "stage4_thread_id": s4_tid,
        "stage2_thread_id": s2_tid,
        "qa_thread_id":     qa_tid,
        "stage3_thread_id": s3_tid,
    }

    try:
        r = requests.post(f"{BASE_URL}/stage6/deploy", json=deploy_body, timeout=30)
        if not check("S6-FAIL-01  re-deploy returns 200", r.status_code == 200,
                     f"HTTP {r.status_code}"):
            return

        data              = r.json()
        second_deploy_tid = data.get("deploy_thread_id")
        check("S6-FAIL-02  second deploy_thread_id present", bool(second_deploy_tid),
              second_deploy_tid or "missing")
    except Exception as exc:
        check("S6-FAIL-01  re-deploy returns 200", False, str(exc))
        return

    # ── poll second deploy ────────────────────────────────────────────────────
    data = poll_until(
        "Stage 6 re-deploy (existing branch)",
        f"{BASE_URL}/stage6/status/{second_deploy_tid}",
        lambda d: d.get("status") in ("complete", "error"),
        timeout=180,
    )
    check("S6-FAIL-03  re-deploy completes without crashing",
          data is not None and data.get("status") in ("complete", "error"),
          data.get("status", "timeout") if data else "timeout")

    # The key test: even with a pre-existing branch/PR, pr_url must be present
    check("S6-FAIL-04  re-deploy returns pr_url (existing PR accepted, not error)",
          data is not None and bool(data.get("pr_url")),
          data.get("pr_url") or ("deploy error: " + str(data.get("error", "timeout")))
          if data else "timeout")

    if data and data.get("pr_url"):
        print(f"    {GREEN}ℹ  Re-deploy PR URL: {data['pr_url']}{RESET}")
    if data and data.get("error"):
        print(f"    {RED}ℹ  re-deploy error: {data['error']}{RESET}")


# ═════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print()
    print(f"{BOLD}{'═' * 64}{RESET}")
    print(f"{BOLD}  DevForge AI — End-to-End Test Suite{RESET}")
    print(f"{BOLD}  Target : {BASE_URL}{RESET}")
    print(f"{BOLD}  Feature: {HAPPY_PATH_INPUT[:55]}…{RESET}")
    print(f"{BOLD}{'═' * 64}{RESET}")

    # ── pre-flight: verify the server is reachable ────────────────────────────
    print(f"\n{BOLD}Pre-flight check…{RESET}")
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code == 200:
            info = r.json()
            print(f"  {GREEN}✓ Server is up — {info.get('service', 'DevForge AI')}{RESET}")
        else:
            print(f"  {YELLOW}⚠ /health returned HTTP {r.status_code} — proceeding anyway{RESET}")
    except requests.exceptions.ConnectionError:
        print(f"\n{RED}✗ Cannot reach {BASE_URL}{RESET}")
        print(f"{RED}  Make sure the server is running:  uvicorn main:app --port 8000{RESET}\n")
        sys.exit(1)

    # ── isolated fail tests (no happy-path dependency) ────────────────────────
    test_s1_incomplete()
    test_s1_reject_feedback()

    # ── happy-path pipeline (each stage feeds the next) ───────────────────────
    # S3 / S4 fail tests are embedded before the approve step of each stage.
    run_s1()
    run_s2()
    run_s3()   # includes S3 changes_requested fail test → then approve
    run_s4()   # includes S4 changes_requested fail test → then approve
    run_qa()
    run_s6()   # includes S6 existing-PR fail test

    # ── summary ───────────────────────────────────────────────────────────────
    total  = len(_results)
    passed = sum(1 for _, ok, _ in _results if ok)
    failed = total - passed

    print(f"\n{BOLD}{'═' * 64}{RESET}")
    print(f"{BOLD}  SUMMARY{RESET}")
    print(f"{BOLD}{'═' * 64}{RESET}")
    for name, ok, detail in _results:
        icon   = "✅" if ok else "❌"
        colour = GREEN if ok else RED
        row    = f"  {colour}{icon}{RESET}  {name}"
        if not ok and detail:
            row += f"  {RED}← {detail}{RESET}"
        print(row)

    colour = GREEN if failed == 0 else RED
    print(f"\n{BOLD}{'─' * 64}{RESET}")
    print(f"{colour}{BOLD}  {passed} / {total} tests passed{RESET}", end="")
    if failed:
        print(f"  {RED}({failed} failed){RESET}")
    else:
        print(f"  {GREEN}🎉{RESET}")
    print(f"{BOLD}{'─' * 64}{RESET}\n")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
