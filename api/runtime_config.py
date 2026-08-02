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


def get_custom_models() -> list:
    return _overrides.get("custom_models", [])


def add_custom_model(model_id: str, name: str) -> None:
    customs = _overrides.get("custom_models", [])
    if not any(m["id"] == model_id for m in customs):
        customs.append({
            "id": model_id,
            "name": name or model_id,
            "tier": "custom",
            "desc": "Custom model",
            "input_mtok": None,
            "output_mtok": None,
        })
        _overrides["custom_models"] = customs
        _save()


def remove_custom_model(model_id: str) -> None:
    _overrides["custom_models"] = [
        m for m in _overrides.get("custom_models", []) if m["id"] != model_id
    ]
    _save()


def get_all_models() -> list:
    return AVAILABLE_MODELS + get_custom_models()


def get_model() -> str:
    m = _overrides.get("model", "claude-sonnet-5")
    all_ids = {m["id"] for m in get_all_models()}
    return m if m in all_ids else "claude-sonnet-5"


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
