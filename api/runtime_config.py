"""
Runtime configuration overrides — sits on top of .env settings.
Changes here take effect immediately without restarting the server.
Persisted to settings_override.json so they survive restarts.
"""
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_OVERRIDE_FILE = Path(__file__).parent.parent / "settings_override.json"
_overrides: dict[str, Any] = {}

AVAILABLE_MODELS = [
    {
        "id":    "claude-sonnet-4-6",
        "name":  "Claude Sonnet 4.6",
        "tier":  "default",
        "desc":  "Best balance of speed and quality — recommended for all stages",
        "input_mtok":  3.0,
        "output_mtok": 15.0,
    },
    {
        "id":    "claude-opus-4-8",
        "name":  "Claude Opus 4.8",
        "tier":  "powerful",
        "desc":  "Most powerful — best for complex PRDs and architecture reviews",
        "input_mtok":  15.0,
        "output_mtok": 75.0,
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
_VALID_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS}


def _load() -> None:
    global _overrides
    if _OVERRIDE_FILE.exists():
        try:
            _overrides = json.loads(_OVERRIDE_FILE.read_text())
            logger.info("[RuntimeConfig] Loaded overrides from %s", _OVERRIDE_FILE.name)
        except Exception as e:
            logger.warning("[RuntimeConfig] Could not load overrides: %s", e)


def _save() -> None:
    try:
        _OVERRIDE_FILE.write_text(json.dumps(_overrides, indent=2))
    except Exception as e:
        logger.warning("[RuntimeConfig] Could not save overrides: %s", e)


def set_override(key: str, value: Any) -> None:
    _overrides[key] = value
    _save()


def clear_override(key: str) -> None:
    _overrides.pop(key, None)
    _save()


# ── Typed accessors ───────────────────────────────────────────────────────────

def get_api_key() -> str:
    from config import get_settings
    return _overrides.get("anthropic_api_key") or get_settings().anthropic_api_key


def get_model() -> str:
    m = _overrides.get("model", "claude-sonnet-4-6")
    return m if m in _VALID_MODEL_IDS else "claude-sonnet-4-6"


def get_github_token() -> str:
    from config import get_settings
    return _overrides.get("github_token") or get_settings().github_token


def get_github_repo() -> str:
    from config import get_settings
    return _overrides.get("github_repo") or get_settings().github_repo


def get_linear_api_key() -> str:
    from config import get_settings
    return _overrides.get("linear_api_key") or get_settings().linear_api_key


def get_linear_team_id() -> str:
    from config import get_settings
    return _overrides.get("linear_team_id") or get_settings().linear_team_id


def get_slack_bot_token() -> str:
    from config import get_settings
    return _overrides.get("slack_bot_token") or get_settings().slack_bot_token


def get_slack_channel() -> str:
    from config import get_settings
    return _overrides.get("slack_prd_channel") or get_settings().slack_prd_channel


# Load on import
_load()
