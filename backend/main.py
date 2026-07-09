"""
Gym Tracker — FastAPI Backend

Endpoints for workout session management, exercise catalog, and Hermes AI coach.
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import sessions, exercises, coach, profile

# dotenv already loaded by database.py on import.
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# ── S3-compatible object storage (MinIO/Coolify or local Compose) ───────────
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "gym-tracker-media")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

_s3_client: Any = None


def _get_s3() -> boto3.client:
    """Lazy-init the S3-compatible client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
            config=BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )
    return _s3_client


def _s3_enabled() -> bool:
    return bool(S3_ENDPOINT)


def _ensure_s3_bucket() -> None:
    """Create the configured bucket when running against a fresh MinIO."""
    if not _s3_enabled():
        return
    s3 = _get_s3()
    last_error: Exception | None = None
    for _ in range(30):
        try:
            s3.head_bucket(Bucket=S3_BUCKET)
            return
        except Exception as error:
            last_error = error
            code = str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchBucket", "NotFound"}:
                s3.create_bucket(Bucket=S3_BUCKET)
                logger.info("Created S3 bucket %s", S3_BUCKET)
                return
            time.sleep(1)
    raise RuntimeError(f"S3 bucket unavailable after retries: {last_error}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB on startup, clean up on shutdown."""
    try:
        await init_db()
        logger.info("Database initialized successfully")
        await asyncio.to_thread(_ensure_s3_bucket)
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)
        raise
    # Seed the exercise catalog on first boot (no-op if already seeded).
    try:
        from database import async_session
        from seed.exercises import seed_exercises, download_missing_media
        async with async_session() as db_session:
            await seed_exercises(db_session)
        # Media is not vendored: pull missing files in the background so
        # startup stays fast and the API serves immediately.
        asyncio.create_task(download_missing_media())
    except Exception as error:
        logger.warning("Exercise seed skipped: %s", error)
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


# ── Exercise media ───────────────────────────────────────────────────────────
# When S3 is configured, serve from MinIO/S3. Otherwise fall back to local disk.

_media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exercise_data")


@app.get("/exercise-media/{path:path}", include_in_schema=False)
async def serve_media(path: str):
    """Serve exercise images/GIFs from S3-compatible storage or local disk."""
    if _s3_enabled():
        try:
            s3 = _get_s3()
            obj = s3.get_object(Bucket=S3_BUCKET, Key=path)
            return StreamingResponse(
                obj["Body"],
                media_type=obj.get("ContentType", "application/octet-stream"),
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                },
            )
        except Exception as e:
            # boto3 ClientError wraps the S3 error; check for NoSuchKey
            error_response = getattr(e, "response", {}) or {}
            error_code = (error_response.get("Error") or {}).get("Code", "")
            if error_code == "NoSuchKey":
                raise HTTPException(status_code=404, detail="Media not found")
            logger.warning("S3 fetch failed for %s: %s", path, e)
            raise HTTPException(status_code=502, detail="Storage unavailable")

    # Fallback: serve from local disk
    file_path = os.path.join(_media_dir, path)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(file_path)


# Serve the static Telegram Mini App from the same container/domain.
# Keep this after API routes so /api/* and /health continue to resolve first.
# In Docker the built frontend is copied to ./static; in local dev use ../frontend/dist.
_static_dir = next((d for d in ("static", "../frontend/dist") if os.path.isdir(d)), None)

# Clean client-side routes. These return the Mini App shell; the island reads path params.
if _static_dir:
    @app.get("/", include_in_schema=False)
    @app.get("/session/share/{share_token}", include_in_schema=False)
    @app.get("/session/share/{share_token}/exercise/{planned_exercise_id}", include_in_schema=False)
    async def frontend_shell():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
