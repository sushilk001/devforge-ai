import logging
import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

import api.runtime_config as rc

logger = logging.getLogger(__name__)
router_settings = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    anthropic_api_key:  Optional[str] = None
    model:              Optional[str] = None
    github_token:       Optional[str] = None
    github_repo:        Optional[str] = None
    linear_api_key:     Optional[str] = None
    linear_team_id:     Optional[str] = None
    slack_bot_token:    Optional[str] = None
    slack_prd_channel:  Optional[str] = None


def _preview(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return key[:6] + "..." + key[-4:]


def _current_state() -> dict:
    api_key   = rc.get_api_key()
    gh_token  = rc.get_github_token()
    li_key    = rc.get_linear_api_key()
    sl_token  = rc.get_slack_bot_token()
    return {
        "model":                    rc.get_model(),
        "available_models":         rc.AVAILABLE_MODELS,
        "anthropic_api_key_set":    bool(api_key),
        "anthropic_api_key_preview": _preview(api_key),
        "github_token_set":         bool(gh_token),
        "github_token_preview":     _preview(gh_token),
        "github_repo":              rc.get_github_repo(),
        "linear_api_key_set":       bool(li_key),
        "linear_api_key_preview":   _preview(li_key),
        "linear_team_id":           rc.get_linear_team_id(),
        "slack_bot_token_set":      bool(sl_token),
        "slack_bot_token_preview":  _preview(sl_token),
        "slack_prd_channel":        rc.get_slack_channel(),
    }


@router_settings.get("")
def get_settings():
    return _current_state()


@router_settings.post("")
def update_settings(body: SettingsUpdate):
    if body.anthropic_api_key is not None:
        if body.anthropic_api_key:
            rc.set_override("anthropic_api_key", body.anthropic_api_key)
        else:
            rc.clear_override("anthropic_api_key")

    if body.model and body.model in {m["id"] for m in rc.AVAILABLE_MODELS}:
        rc.set_override("model", body.model)

    for key, val in [
        ("github_token",      body.github_token),
        ("github_repo",       body.github_repo),
        ("linear_api_key",    body.linear_api_key),
        ("linear_team_id",    body.linear_team_id),
        ("slack_bot_token",   body.slack_bot_token),
        ("slack_prd_channel", body.slack_prd_channel),
    ]:
        if val is not None:
            if val:
                rc.set_override(key, val)
            else:
                rc.clear_override(key)

    return _current_state()


@router_settings.post("/test-anthropic")
async def test_anthropic():
    """Quick connectivity test — sends a 1-token message to verify the key works."""
    import anthropic
    key = rc.get_api_key()
    if not key:
        return {"ok": False, "error": "No API key configured"}
    try:
        client = anthropic.Anthropic(api_key=key)
        client.messages.create(
            model=rc.get_model(),
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return {"ok": True, "model": rc.get_model()}
    except Exception as e:
        return {"ok": False, "error": str(e)[:120]}


@router_settings.post("/test-github")
async def test_github():
    """Verify GitHub token and repo access."""
    token = rc.get_github_token()
    repo  = rc.get_github_repo()
    if not token:
        return {"ok": False, "error": "No GitHub token configured"}
    try:
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
            url = f"https://api.github.com/repos/{repo}" if repo else "https://api.github.com/user"
            r = await client.get(url, headers=headers, timeout=8)
        if r.status_code == 200:
            data = r.json()
            name = data.get("full_name") or data.get("login", "authenticated")
            return {"ok": True, "info": name}
        return {"ok": False, "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:120]}


@router_settings.post("/test-linear")
async def test_linear():
    """Verify Linear API key."""
    key = rc.get_linear_api_key()
    if not key:
        return {"ok": False, "error": "No Linear API key configured"}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.linear.app/graphql",
                json={"query": "{ viewer { name email } }"},
                headers={"Authorization": key, "Content-Type": "application/json"},
                timeout=8,
            )
        data = r.json()
        viewer = (data.get("data") or {}).get("viewer", {})
        if viewer:
            return {"ok": True, "info": viewer.get("name") or viewer.get("email", "authenticated")}
        return {"ok": False, "error": data.get("errors", [{}])[0].get("message", "Unknown")}
    except Exception as e:
        return {"ok": False, "error": str(e)[:120]}
