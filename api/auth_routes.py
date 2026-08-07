# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
"""
Google OAuth 2.0 — Authorization Code Flow (no extra deps, uses httpx).

Flow:
  1. GET /auth/google/login      → redirect to Google consent screen
  2. GET /auth/google/callback   → exchange code, store user in session
  3. GET /auth/me                → return current user or {"user": null}
  4. POST /auth/logout           → clear user from session
"""
import secrets
import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter
from fastapi.responses import RedirectResponse, JSONResponse

from api import runtime_config as rc
from config import get_settings

logger = logging.getLogger(__name__)

router_auth = APIRouter(prefix="/auth", tags=["Auth"])

_GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_INFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"


def _redirect_uri() -> str:
    return get_settings().app_base_url.rstrip("/") + "/auth/google/callback"


# ── GET /auth/google/login ────────────────────────────────────────────────────

@router_auth.get("/google/login")
async def google_login():
    settings = get_settings()
    if not settings.google_client_id:
        return JSONResponse({"error": "GOOGLE_CLIENT_ID not configured"}, status_code=503)

    state = secrets.token_urlsafe(16)
    rc.set_override("__oauth_state__", state)

    params = urlencode({
        "client_id":     settings.google_client_id,
        "redirect_uri":  _redirect_uri(),
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "online",
        "prompt":        "select_account",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


# ── GET /auth/google/callback ─────────────────────────────────────────────────

@router_auth.get("/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        logger.warning("[Auth] Google OAuth error: %s", error)
        return RedirectResponse("/?auth_error=1")

    saved_state = rc.get_override("__oauth_state__")
    if not state or state != saved_state:
        logger.warning("[Auth] OAuth state mismatch")
        return RedirectResponse("/?auth_error=1")

    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Exchange code for tokens
            token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
                "code":          code,
                "client_id":     settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri":  _redirect_uri(),
                "grant_type":    "authorization_code",
            })
            tokens = token_resp.json()
            access_token = tokens.get("access_token")
            if not access_token:
                logger.error("[Auth] No access_token in token response: %s", tokens)
                return RedirectResponse("/?auth_error=1")

            # Fetch user info
            info_resp = await client.get(
                _GOOGLE_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            info = info_resp.json()

        rc.set_override("__user__", {
            "email":   info.get("email", ""),
            "name":    info.get("name", ""),
            "picture": info.get("picture", ""),
            "sub":     info.get("sub", ""),
        })
        rc.clear_override("__oauth_state__")
        logger.info("[Auth] Logged in: %s", info.get("email"))

    except Exception as exc:
        logger.exception("[Auth] callback failed: %s", exc)
        return RedirectResponse("/?auth_error=1")

    return RedirectResponse("/")


# ── GET /auth/me ──────────────────────────────────────────────────────────────

@router_auth.get("/auth/me")
async def auth_me():
    user = rc.get_override("__user__")
    return JSONResponse({"user": user})


# ── POST /auth/logout ─────────────────────────────────────────────────────────

@router_auth.post("/auth/logout")
async def auth_logout():
    rc.clear_override("__user__")
    return {"ok": True}
