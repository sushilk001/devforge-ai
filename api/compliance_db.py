# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
"""SQLite persistence for compliance runs and findings."""
import sqlite3
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).parent.parent / "output" / "compliance.db"


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Called at import time."""
    try:
        conn = _connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS compliance_runs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_slug    TEXT    NOT NULL DEFAULT '',
                thread_id       TEXT    NOT NULL UNIQUE,
                s4_thread_id    TEXT    NOT NULL DEFAULT '',
                timestamp       TEXT    NOT NULL,
                score           INTEGER NOT NULL DEFAULT 0,
                criticals       INTEGER NOT NULL DEFAULT 0,
                warnings_count  INTEGER NOT NULL DEFAULT 0,
                verdict         TEXT    NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS compliance_findings (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id          INTEGER NOT NULL REFERENCES compliance_runs(id) ON DELETE CASCADE,
                project_slug    TEXT    NOT NULL DEFAULT '',
                agent           TEXT    NOT NULL DEFAULT '',
                severity        TEXT    NOT NULL DEFAULT '',
                standard        TEXT    NOT NULL DEFAULT '',
                title           TEXT    NOT NULL DEFAULT '',
                description     TEXT    NOT NULL DEFAULT '',
                file            TEXT,
                recommendation  TEXT    NOT NULL DEFAULT '',
                waived          INTEGER NOT NULL DEFAULT 0,
                waive_reason    TEXT,
                first_seen      TEXT    NOT NULL,
                last_seen       TEXT    NOT NULL
            );
        """)
        conn.commit()
        conn.close()
        logger.info(f"[ComplianceDB] Initialised at {_DB_PATH}")
    except Exception as e:
        logger.error(f"[ComplianceDB] init_db failed: {e}")


def save_run(
    thread_id: str,
    project_slug: str,
    s4_thread_id: str,
    findings: list,
    score: int,
    criticals: int,
    warnings_count: int,
    verdict: str,
) -> int | None:
    """Insert a compliance run and its findings. Returns the run id."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn = _connect()
        cur = conn.execute(
            """INSERT OR IGNORE INTO compliance_runs
               (project_slug, thread_id, s4_thread_id, timestamp, score, criticals, warnings_count, verdict)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_slug, thread_id, s4_thread_id, now, score, criticals, warnings_count, verdict),
        )
        run_id = cur.lastrowid
        conn.commit()

        if not run_id:
            # Already exists (IGNORE fired) — look it up
            row = conn.execute(
                "SELECT id FROM compliance_runs WHERE thread_id = ?", (thread_id,)
            ).fetchone()
            conn.close()
            return row["id"] if row else None

        for f in findings:
            conn.execute(
                """INSERT INTO compliance_findings
                   (run_id, project_slug, agent, severity, standard, title, description,
                    file, recommendation, first_seen, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    run_id,
                    project_slug,
                    f.get("agent", ""),
                    f.get("severity", ""),
                    f.get("standard", ""),
                    f.get("title", ""),
                    f.get("description", ""),
                    f.get("file"),
                    f.get("recommendation", ""),
                    now,
                    now,
                ),
            )
        conn.commit()
        conn.close()
        logger.info(f"[ComplianceDB] Saved run {thread_id} ({len(findings)} findings, run_id={run_id})")
        return run_id
    except Exception as e:
        logger.error(f"[ComplianceDB] save_run failed: {e}")
        return None


def get_debt_history(project_slug: str, limit: int = 10) -> list:
    """Return [{date, score, criticals, warnings}] oldest-first for a project slug."""
    try:
        conn = _connect()
        rows = conn.execute(
            """SELECT timestamp, score, criticals, warnings_count
               FROM compliance_runs
               WHERE project_slug = ?
               ORDER BY timestamp ASC
               LIMIT ?""",
            (project_slug, limit),
        ).fetchall()
        conn.close()
        return [
            {
                "date":     row["timestamp"][:10],
                "score":    row["score"],
                "criticals": row["criticals"],
                "warnings": row["warnings_count"],
            }
            for row in rows
        ]
    except Exception as e:
        logger.error(f"[ComplianceDB] get_debt_history failed: {e}")
        return []


def waive_finding(finding_id: int, reason: str) -> bool:
    """Mark a finding as waived with a reason. Returns True on success."""
    try:
        conn = _connect()
        conn.execute(
            "UPDATE compliance_findings SET waived = 1, waive_reason = ? WHERE id = ?",
            (reason, finding_id),
        )
        conn.commit()
        conn.close()
        logger.info(f"[ComplianceDB] Waived finding {finding_id}: {reason}")
        return True
    except Exception as e:
        logger.error(f"[ComplianceDB] waive_finding failed: {e}")
        return False


# Initialise on import
init_db()
