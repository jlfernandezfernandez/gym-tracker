"""
Gym Tracker — FastAPI Backend

Endpoints for workout session management, exercise catalog, and Hermes AI coach.
"""

from contextlib import asynccontextmanager
import os

import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import sessions, exercises, coach, profile

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB on startup, clean up on shutdown."""
    try:
        await init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise
    # Seed the exercise catalog on first boot (no-op if already seeded).
    try:
        from database import async_session
        from seed.exercises import seed_exercises
        async with async_session() as session:
            n = await seed_exercises(session)
            if n:
                logger.info("Seeded %d exercises", n)
    except Exception as e:
        logger.warning("Exercise seed skipped: %s", e)
    yield


app = FastAPI(
    title="Gym Tracker API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Mini App domain(s)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
is_wildcard = "*" in origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=not is_wildcard,  # credentials incompatible with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(sessions.router)
app.include_router(exercises.router)
app.include_router(coach.router)
app.include_router(profile.router)


@app.get("/health")
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Serve exercise images/GIFs from the vendored dataset.
_media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exercise_data")
if os.path.isdir(_media_dir):
    app.mount("/exercise-media", StaticFiles(directory=_media_dir), name="exercise-media")

# Serve the static Telegram Mini App from the same container/domain.
# Keep this after API routes so /api/* and /health continue to resolve first.
# In Docker the built frontend is copied to ./static; in local dev use ../frontend/dist.
_static_dir = next((d for d in ("static", "../frontend/dist") if os.path.isdir(d)), None)


def _frontend_index() -> str:
    assert _static_dir is not None
    return os.path.join(_static_dir, "index.html")


# Clean client-side routes. These return the Mini App shell; app.ts reads path params.
if _static_dir:
    @app.get("/", include_in_schema=False)
    @app.get("/session/share/{share_token}", include_in_schema=False)
    @app.get("/session/share/{share_token}/exercise/{planned_exercise_id}", include_in_schema=False)
    async def frontend_shell():
        return FileResponse(_frontend_index())

    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
