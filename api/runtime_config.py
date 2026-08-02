"""
Runtime configuration — PER-SESSION credential overrides.

Each browser gets its own session id (the `df_sid` cookie set by the ASGI
middleware in main.py). Credentials a user pastes in the Settings panel are
stored only for THAT session, so users who bring their own API keys never
share or clobber one another. Session overrides live in memory only (never
written to disk) and fall back to the server's .env settings when a session
hasn't provided a given value.

The current session id is carried in a ContextVar so the deep agent code can
read `get_api_key()` etc. without threading a session argument everywhere. The
middleware sets it per request; worker threads (ThreadPoolExecutor, rerun
threads) must be launched via `contextvars.copy_context().run(...)` so the id
propagates into them (see agents/stage3/nodes.py, agents/stage4/nodes.py).
"""
import json
import logging
import threading
import contextvars
from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_OVERRIDE_FILE = Path(__file__).parent.parent / "settings_override.json"

# Current request's session id. Copied into worker threads via copy_context().
_current_session: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "df_session", default=None
)

# session_id -> overrides dict. In-memory only; capped to bound memory use.
_sessions: "OrderedDict[str, dict]" = OrderedDict()
_MAX_SESSIONS = 5000
_lock = threading.Lock()

# Read-only NON-SECRET defaults (currently just the default model), optionally
# loaded from settings_override.json. Secrets are never loaded globally.
_defaults: dict[str, Any] = {}

# Overrides used when there is no session context (import-time / stray calls).
# Kept separate so it can never leak into a real session.
_anon: dict[str, Any] = {}

AVAILABLE_MODELS = [
    {
        "id":    "claude-sonnet-5",
        "name":  "Claude Sonnet 5",
        "tier":  "default",
        "desc":  "Latest and most capable — best balance of intelligence and speed",
        "input_mtok":  3.0,
        "output_mtok": 15.0,
    },
    {
        "id":    "claude-fable-5",
        "name":  "Claude Fable 5",
        "tier":  "powerful",
        "desc":  "Most powerful model — ideal for complex PRDs and architecture reviews",
        "input_mtok":  15.0,
        "output_mtok": 75.0,
    },
    {
        "id":    "claude-opus-4-8",
        "name":  "Claude Opus 4.8",
        "tier":  "powerful",
        "desc":  "High-intelligence model — excellent for deep reasoning tasks",
        "input_mtok":  15.0,
        "output_mtok": 75.0,
    },
    {
        "id":    "claude-sonnet-4-6",
        "name":  "Claude Sonnet 4.6",
        "tier":  "balanced",
        "desc":  "Reliable and fast — good for straightforward generation tasks",
        "input_mtok":  3.0,
        "output_mtok": 15.0,
    },
    {
        "id":    "claude-haiku-4-5-20251001",
        "name":  "Claude Haiku 4.5",
        "tier":  "fast",
        "desc":  "Fastest and cheapest — good for simple tasks",
        "input_mtok":  0.8,
        "output_mtok": 4.0,
    },
]


def _sess() -> dict:
    """The current session's override dict (or the anon dict if unset)."""
    sid = _current_session.get()
    if not sid:
        return _anon
    with _lock:
        d = _sessions.get(sid)
        if d is None:
            d = {}
            _sessions[sid] = d
            if len(_sessions) > _MAX_SESSIONS:
                _sessions.popitem(last=False)  # evict oldest
        else:
            _sessions.move_to_end(sid)
    return d


# ── Session control (used by the ASGI middleware in main.py) ──────────────────

def set_current_session(sid: Optional[str]) -> None:
    _current_session.set(sid)


def current_session_id() -> Optional[str]:
    return _current_session.get()


# ── Overrides ─────────────────────────────────────────────────────────────────

def set_override(key: str, value: Any) -> None:
    _sess()[key] = value


def clear_override(key: str) -> None:
    _sess().pop(key, None)


def get_override(key: str, default: Any = None) -> Any:
    return _sess().get(key, default)


# ── Typed accessors ───────────────────────────────────────────────────────────

def get_api_key() -> str:
    from config import get_settings
    return _sess().get("anthropic_api_key") or get_settings().anthropic_api_key


def get_custom_models() -> list:
    return _sess().get("custom_models", [])


def add_custom_model(model_id: str, name: str) -> None:
    s = _sess()
    customs = s.get("custom_models", [])
    if not any(m["id"] == model_id for m in customs):
        customs.append({
            "id": model_id,
            "name": name or model_id,
            "tier": "custom",
            "desc": "Custom model",
            "input_mtok": None,
            "output_mtok": None,
        })
        s["custom_models"] = customs


def remove_custom_model(model_id: str) -> None:
    s = _sess()
    s["custom_models"] = [
        m for m in s.get("custom_models", []) if m["id"] != model_id
    ]


def get_all_models() -> list:
    return AVAILABLE_MODELS + get_custom_models()


def get_model() -> str:
    m = _sess().get("model") or _defaults.get("model") or "claude-sonnet-5"
    all_ids = {x["id"] for x in get_all_models()}
    return m if m in all_ids else "claude-sonnet-5"


def get_github_token() -> str:
    from config import get_settings
    return _sess().get("github_token") or get_settings().github_token


def get_github_repo() -> str:
    from config import get_settings
    return _sess().get("github_repo") or get_settings().github_repo


def get_linear_api_key() -> str:
    from config import get_settings
    return _sess().get("linear_api_key") or get_settings().linear_api_key


def get_linear_team_id() -> str:
    from config import get_settings
    return _sess().get("linear_team_id") or get_settings().linear_team_id


def get_slack_bot_token() -> str:
    from config import get_settings
    return _sess().get("slack_bot_token") or get_settings().slack_bot_token


def get_slack_channel() -> str:
    from config import get_settings
    return _sess().get("slack_prd_channel") or get_settings().slack_prd_channel


def _load_defaults() -> None:
    """Load only non-secret defaults (model) from disk, if present."""
    global _defaults
    if _OVERRIDE_FILE.exists():
        try:
            data = json.loads(_OVERRIDE_FILE.read_text())
            _defaults = {k: v for k, v in data.items() if k == "model"}
        except Exception as e:
            logger.warning("[RuntimeConfig] Could not load defaults: %s", e)


_load_defaults()
