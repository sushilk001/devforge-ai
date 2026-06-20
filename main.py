import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.stage2_routes import router_stage2
from api.stage3_routes import router_stage3
from api.stage4_routes import router_stage4
from api.qa_routes import router_qa
from api.observability import router as router_obs
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(router_stage2)
app.include_router(router_stage3)
app.include_router(router_stage4)
app.include_router(router_qa)
app.include_router(router_obs)


@app.get("/health")
def health():
    return {"status": "ok", "service": "DevForge AI", "stages": ["1 — Requirements Agent", "2 — Task Orchestration", "3 — PR Review Agent", "4 — Code Generation Agent"]}


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
