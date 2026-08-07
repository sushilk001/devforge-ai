# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
"""
Auth routes — three providers:
  - Google OAuth 2.0   (GET /auth/google/login, GET /auth/google/callback)
  - GitHub OAuth 2.0   (GET /auth/github/login, GET /auth/github/callback)
  - Email/Password     (POST /auth/signup, POST /auth/login)
  - GET  /auth/me      → current user or {"user": null}
  - POST /auth/logout  → clear session user

No extra dependencies — uses httpx (already in requirements) and Python stdlib
hashlib/hmac for password hashing (PBKDF2-SHA256).
"""
import hashlib
import hmac
import logging
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from api import runtime_config as rc
from config import get_settings

logger = logging.getLogger(__name__)

router_auth = APIRouter(prefix="/auth", tags=["Auth"])

# ── In-memory user store (email/password accounts) ────────────────────────────
# In-memory only — resets on server restart (fine for demo; swap for DB in prod)
_users: dict[str, dict] = {}   # email → {email, name, picture, hashed_pw}


# ── Password helpers ──────────────────────────────────────────────────────────

def _hash_pw(password: str) -> str:
    salt = os.urandom(16)
    key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + ":" + key.hex()


def _verify_pw(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
        key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False


def _avatar_url(name: str) -> str:
    initials = name.replace(" ", "+") or "U"
    return f"https://ui-avatars.com/api/?name={initials}&background=D4662E&color=fff&size=64"


# ── Shared helper ─────────────────────────────────────────────────────────────

def _base_url() -> str:
    return get_settings().app_base_url.rstrip("/")


# ════════════════════════════════════════════════════════════════════════════════
# Email / Password
# ════════════════════════════════════════════════════════════════════════════════

class SignupRequest(BaseModel):
    email:    str
    password: str
    name:     str = ""


class LoginRequest(BaseModel):
    email:    str
    password: str


@router_auth.post("/signup")
async def auth_signup(body: SignupRequest):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if email in _users:
        raise HTTPException(409, "An account with this email already exists")

    name = body.name.strip() or email.split("@")[0]
    _users[email] = {
        "email":     email,
        "name":      name,
        "picture":   _avatar_url(name),
        "hashed_pw": _hash_pw(body.password),
    }
    user = {"email": email, "name": name, "picture": _users[email]["picture"]}
    rc.set_override("__user__", user)
    logger.info("[Auth] Signed up: %s", email)
    return {"user": user}


@router_auth.post("/login")
async def auth_login(body: LoginRequest):
    email  = body.email.strip().lower()
    record = _users.get(email)
    if not record or not _verify_pw(body.password, record["hashed_pw"]):
        raise HTTPException(401, "Invalid email or password")
    user = {"email": record["email"], "name": record["name"], "picture": record["picture"]}
    rc.set_override("__user__", user)
    logger.info("[Auth] Logged in: %s", email)
    return {"user": user}


# ════════════════════════════════════════════════════════════════════════════════
# Google OAuth 2.0
# ════════════════════════════════════════════════════════════════════════════════

_GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_INFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"


@router_auth.get("/google/login")
async def google_login():
    settings = get_settings()
    if not settings.google_client_id:
        return JSONResponse({"error": "GOOGLE_CLIENT_ID not configured"}, status_code=503)
    state = secrets.token_urlsafe(16)
    rc.set_override("__oauth_state__", state)
    params = urlencode({
        "client_id":     settings.google_client_id,
        "redirect_uri":  _base_url() + "/auth/google/callback",
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "access_type":   "online",
        "prompt":        "select_account",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router_auth.get("/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse("/?auth_error=google")
    if not state or state != rc.get_override("__oauth_state__"):
        return RedirectResponse("/?auth_error=state")
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            tok = (await client.post(_GOOGLE_TOKEN_URL, data={
                "code": code, "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": _base_url() + "/auth/google/callback",
                "grant_type": "authorization_code",
            })).json()
            if not tok.get("access_token"):
                return RedirectResponse("/?auth_error=token")
            info = (await client.get(_GOOGLE_INFO_URL,
                headers={"Authorization": f"Bearer {tok['access_token']}"})).json()
        rc.set_override("__user__", {
            "email": info.get("email", ""), "name": info.get("name", ""),
            "picture": info.get("picture", ""), "sub": info.get("sub", ""),
        })
        rc.clear_override("__oauth_state__")
        logger.info("[Auth/Google] Logged in: %s", info.get("email"))
    except Exception as exc:
        logger.exception("[Auth/Google] callback failed: %s", exc)
        return RedirectResponse("/?auth_error=google")
    return RedirectResponse("/")


# ════════════════════════════════════════════════════════════════════════════════
# GitHub OAuth 2.0
# ════════════════════════════════════════════════════════════════════════════════

_GH_AUTH_URL  = "https://github.com/login/oauth/authorize"
_GH_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GH_USER_URL  = "https://api.github.com/user"


@router_auth.get("/github/login")
async def github_login():
    settings = get_settings()
    if not settings.github_client_id:
        return JSONResponse({"error": "GITHUB_CLIENT_ID not configured"}, status_code=503)
    state = secrets.token_urlsafe(16)
    rc.set_override("__oauth_state__", state)
    params = urlencode({
        "client_id":    settings.github_client_id,
        "redirect_uri": _base_url() + "/auth/github/callback",
        "scope":        "user:email",
        "state":        state,
    })
    return RedirectResponse(f"{_GH_AUTH_URL}?{params}")


@router_auth.get("/github/callback")
async def github_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse("/?auth_error=github")
    if not state or state != rc.get_override("__oauth_state__"):
        return RedirectResponse("/?auth_error=state")
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            tok = (await client.post(_GH_TOKEN_URL,
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": _base_url() + "/auth/github/callback",
                },
                headers={"Accept": "application/json"},
            )).json()
            access_token = tok.get("access_token")
            if not access_token:
                return RedirectResponse("/?auth_error=token")
            info = (await client.get(_GH_USER_URL, headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            })).json()
        email = info.get("email") or f"{info.get('login', 'github')}@github"
        name  = info.get("name") or info.get("login", "")
        rc.set_override("__user__", {
            "email": email, "name": name,
            "picture": info.get("avatar_url", ""), "sub": str(info.get("id", "")),
        })
        rc.clear_override("__oauth_state__")
        logger.info("[Auth/GitHub] Logged in: %s", email)
    except Exception as exc:
        logger.exception("[Auth/GitHub] callback failed: %s", exc)
        return RedirectResponse("/?auth_error=github")
    return RedirectResponse("/")


# ════════════════════════════════════════════════════════════════════════════════
# Session endpoints
# ════════════════════════════════════════════════════════════════════════════════

@router_auth.get("/me")
async def auth_me():
    return JSONResponse({"user": rc.get_override("__user__")})


@router_auth.post("/logout")
async def auth_logout():
    rc.clear_override("__user__")
    return {"ok": True}
