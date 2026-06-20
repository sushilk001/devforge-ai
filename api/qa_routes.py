import uuid
import logging
import subprocess
import re
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException

logger = logging.getLogger(__name__)
router_qa = APIRouter(prefix="/qa", tags=["QA — Test Runner"])

_qa_sessions: dict[str, dict] = {}


def _ensure_init_files(root: Path):
    """Create __init__.py in every package dir so Python imports resolve."""
    for d in root.rglob("*"):
        if d.is_dir():
            init = d / "__init__.py"
            if not init.exists():
                init.write_text("")


def _categorise(path: str) -> str:
    """Map a test file path to one of the 4 QA categories."""
    p = path.lower()
    if any(k in p for k in ("e2e", "playwright", "end_to_end", "endtoend")):
        return "e2e"
    if any(k in p for k in ("visual", "regression", "snapshot", "screenshot")):
        return "visual"
    if any(k in p for k in ("integration", "api", "router", "endpoint", "client", "service")):
        return "integration"
    return "unit"


def _cat_summary(tests: list) -> dict:
    passed  = sum(1 for t in tests if t["status"] == "PASSED")
    failed  = sum(1 for t in tests if t["status"] == "FAILED")
    errors  = sum(1 for t in tests if t["status"] == "ERROR")
    skipped = sum(1 for t in tests if t["status"] == "SKIPPED")
    total   = len(tests)
    if total == 0:
        badge = "NONE"
    elif errors > 0 and passed == 0 and failed == 0:
        badge = "ERROR"
    elif failed > 0 or errors > 0:
        badge = "FAIL"
    else:
        badge = "PASS"
    return {
        "passed": passed, "failed": failed, "errors": errors,
        "skipped": skipped, "total": total, "badge": badge,
    }


def _parse_pytest_output(stdout: str) -> dict:
    """Parse pytest -v output into structured results with 4-category breakdown."""
    test_lines = []
    passed = 0
    failed = 0
    errors = 0
    skipped = 0

    for line in stdout.splitlines():
        # Normal verbose line:  tests/foo/test_bar.py::test_baz PASSED
        m = re.match(r"^(tests/\S+::[\w\[\]]+)\s+(PASSED|FAILED|ERROR|SKIPPED)", line)
        if m:
            test_path, status = m.group(1), m.group(2)
            name = test_path.split("::")[-1]
            cat  = _categorise(test_path)
            test_lines.append({"name": name, "path": test_path, "status": status, "category": cat})
            if status == "PASSED":    passed  += 1
            elif status == "FAILED":  failed  += 1
            elif status == "ERROR":   errors  += 1
            elif status == "SKIPPED": skipped += 1
            continue
        # Collection-level error:  ERROR tests/foo/test_bar.py
        m2 = re.match(r"^ERROR\s+(tests/\S+\.py)", line)
        if m2:
            fpath = m2.group(1)
            name  = fpath.split("/")[-1]
            cat   = _categorise(fpath)
            test_lines.append({"name": name, "path": fpath, "status": "ERROR", "category": cat})
            errors += 1

    # Build 4-category breakdown
    by_cat = {k: [] for k in ("unit", "integration", "e2e", "visual")}
    for t in test_lines:
        by_cat[t["category"]].append(t)
    categories = {k: _cat_summary(v) for k, v in by_cat.items()}

    # Summary banner line
    summary_line = ""
    for line in stdout.splitlines():
        if re.search(r"={3,}.*?(passed|failed|error|no tests ran)", line, re.IGNORECASE):
            summary_line = line.strip("= \n")
            break
    if not summary_line and "no tests ran" in stdout.lower():
        summary_line = "no tests ran"

    # Fallback counts from banner if individual lines gave nothing
    if not test_lines:
        m = re.search(r"(\d+) passed", stdout)
        if m: passed = int(m.group(1))
        m = re.search(r"(\d+) failed", stdout)
        if m: failed = int(m.group(1))
        m = re.search(r"(\d+) error", stdout)
        if m: errors = int(m.group(1))

    return {
        "tests":      test_lines,
        "categories": categories,
        "passed":     passed,
        "failed":     failed,
        "errors":     errors,
        "skipped":    skipped,
        "total":      passed + failed + errors + skipped,
        "summary":    summary_line,
    }


def _run_qa(qa_thread_id: str, stage4_thread_id: str):
    from api.stage4_routes import _stage4_output_paths
    generated_dir = _stage4_output_paths.get(stage4_thread_id)
    if not generated_dir:
        _qa_sessions[qa_thread_id]["status"] = "error"
        _qa_sessions[qa_thread_id]["error"] = f"No output path recorded for stage4 {stage4_thread_id}"
        return
    tests_dir = generated_dir / "tests"

    if not generated_dir.exists():
        _qa_sessions[qa_thread_id]["status"] = "error"
        _qa_sessions[qa_thread_id]["error"] = f"Output dir not found: {generated_dir}"
        return

    if not tests_dir.exists():
        _qa_sessions[qa_thread_id]["status"] = "error"
        _qa_sessions[qa_thread_id]["error"] = "No tests/ directory found in generated code"
        return

    # Ensure __init__.py exists everywhere so imports work
    _ensure_init_files(generated_dir)

    # Collect only Python test files (skip TS/JS)
    py_tests = list(tests_dir.rglob("test_*.py")) + list(tests_dir.rglob("*_test.py"))
    if not py_tests:
        _qa_sessions[qa_thread_id]["status"] = "complete"
        _qa_sessions[qa_thread_id]["result"] = {
            "tests": [], "passed": 0, "failed": 0, "errors": 0,
            "skipped": 0, "total": 0, "summary": "no Python tests found",
        }
        _qa_sessions[qa_thread_id]["stdout"] = ""
        return

    logger.info(f"[QA/{qa_thread_id}] Running {len(py_tests)} Python test files in {tests_dir}")

    try:
        proc = subprocess.run(
            ["python", "-m", "pytest", "tests/", "-v", "--tb=short", "--no-header"],
            cwd=str(generated_dir),
            env={
                **__import__("os").environ,
                "PYTHONPATH": str(generated_dir),
            },
            capture_output=True,
            text=True,
            timeout=120,
        )
        stdout = proc.stdout + proc.stderr
        result = _parse_pytest_output(stdout)
        _qa_sessions[qa_thread_id]["status"] = "complete"
        _qa_sessions[qa_thread_id]["result"] = result
        _qa_sessions[qa_thread_id]["stdout"] = stdout[:8000]  # cap stored output
        logger.info(
            f"[QA/{qa_thread_id}] Complete: {result['passed']} passed, "
            f"{result['failed']} failed, {result['errors']} errors"
        )
    except subprocess.TimeoutExpired:
        _qa_sessions[qa_thread_id]["status"] = "error"
        _qa_sessions[qa_thread_id]["error"] = "pytest timed out after 120s"
    except Exception as e:
        logger.error(f"[QA/{qa_thread_id}] Runner error: {e}")
        _qa_sessions[qa_thread_id]["status"] = "error"
        _qa_sessions[qa_thread_id]["error"] = str(e)


@router_qa.post("/run/{stage4_thread_id}")
async def run_qa(stage4_thread_id: str, background_tasks: BackgroundTasks):
    """Kick off pytest on the generated test files for a stage4 session."""
    qa_thread_id = str(uuid.uuid4())
    _qa_sessions[qa_thread_id] = {
        "status": "running",
        "stage4_thread_id": stage4_thread_id,
        "result": None,
        "error": None,
        "stdout": "",
    }
    background_tasks.add_task(_run_qa, qa_thread_id, stage4_thread_id)
    return {"status": "started", "qa_thread_id": qa_thread_id, "stage4_thread_id": stage4_thread_id}


@router_qa.get("/sessions")
def list_qa_sessions():
    return {
        tid: {
            "status":           s["status"],
            "stage4_thread_id": s["stage4_thread_id"],
            "passed":           (s["result"] or {}).get("passed", 0),
            "failed":           (s["result"] or {}).get("failed", 0),
            "errors":           (s["result"] or {}).get("errors", 0),
            "total":            (s["result"] or {}).get("total", 0),
        }
        for tid, s in _qa_sessions.items()
    }


@router_qa.get("/results/{qa_thread_id}")
def get_qa_results(qa_thread_id: str):
    session = _qa_sessions.get(qa_thread_id)
    if not session:
        raise HTTPException(404, "QA session not found")
    return {
        "qa_thread_id":     qa_thread_id,
        "stage4_thread_id": session["stage4_thread_id"],
        "status":           session["status"],
        "result":           session["result"],
        "error":            session.get("error"),
        "stdout":           session.get("stdout", ""),
    }
