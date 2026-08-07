# Copyright (c) 2026 Sushil Kumar. Licensed under BSL 1.1 — see LICENSE or https://devforgeai.in/license
import logging
import secrets
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import runtime_config as rc

from api.routes import router
from api.stage2_routes import router_stage2
from api.stage3_routes import router_stage3
from api.stage4_routes import router_stage4
from api.qa_routes import router_qa
from api.stage6_routes import router_stage6
from api.observability import router as router_obs
from api.debug_routes import router_debug
from api.settings_routes import router_settings
from api.compliance_routes import router_compliance
from api.auth_routes import router_auth
from config import get_settings

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

settings = get_settings()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="DevForge AI",
    description=(
        "Autonomous End-to-End SDLC Intelligence Engine.\n\n"
        "Stage 1: Requirements Agent — Feature Request → PRD\n"
        "Stage 2: Task Orchestration Agent — PRD → Linear Tasks + Dependency Graph\n"
        "Stage 3: PR Review Agent — Tasks → Parallel Security/Quality/Coverage/Architecture Review\n"
        "Stage 4: Code Generation Agent — Tasks → Implementation + Test Files"
    ),
    version="1.0.0",
)

_origins = (
    [o.strip() for o in settings.allowed_origins.split(",")]
    if settings.allowed_origins != "*"
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    allow_credentials=True,
)


# ── Per-session credentials ───────────────────────────────────────────────────
# Give each browser its own credential session via an HttpOnly `df_sid` cookie,
# so users who paste their own API keys never share or clobber one another.
# Pure-ASGI middleware (NOT BaseHTTPMiddleware) so the session ContextVar set
# here propagates to endpoints, background tasks, and worker threads.
class _SessionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        sid = None
        for name, value in scope.get("headers") or []:
            if name == b"cookie":
                for part in value.decode("latin-1").split(";"):
                    k, _, v = part.strip().partition("=")
                    if k == "df_sid" and v:
                        sid = v
                        break
            if sid:
                break

        new = sid is None
        if new:
            sid = secrets.token_urlsafe(18)
        rc.set_current_session(sid)

        if not new:
            await self.app(scope, receive, send)
            return

        secure = scope.get("scheme") == "https"
        cookie = ("df_sid=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800" % sid) + (
            "; Secure" if secure else ""
        )

        async def _send(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append(
                    (b"set-cookie", cookie.encode("latin-1"))
                )
            await send(message)

        await self.app(scope, receive, _send)


app.add_middleware(_SessionMiddleware)

app.include_router(router)
app.include_router(router_stage2)
app.include_router(router_stage3)
app.include_router(router_stage4)
app.include_router(router_qa)
app.include_router(router_stage6)
app.include_router(router_obs)
app.include_router(router_debug)
app.include_router(router_settings)
app.include_router(router_compliance)
app.include_router(router_auth)


@app.get("/health")
def health():
    return {"status": "ok", "service": "DevForge AI", "stages": ["1 — Requirements Agent", "2 — Task Orchestration", "3 — PR Review Agent", "4 — Code Generation Agent", "5 — QA Runner", "6 — Deploy"]}


# ── Serve the built dashboard (single origin) ─────────────────────────────────
# Mounted last so it never shadows the API routers or /docs. Present only in the
# container build (dist/ is produced by the Vite build stage); skipped in local
# dev where the Vite dev server proxies to this API instead.
_DIST = Path(__file__).parent / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="dashboard")


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.app_port,
        reload=True,
        reload_dirs=["api", "agents", "integrations"],
    )
