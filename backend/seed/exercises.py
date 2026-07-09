"""
Seed exercises from the vendored dataset (backend/exercise_data/) into the DB
and upload media to Garage S3.

Dataset: https://github.com/hasaneyldrm/exercises-dataset (media © Gym Visual,
see exercise_data/NOTICE.md). Runs on startup; no-op if the table already has rows.
"""

import asyncio
import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Exercise

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "exercise_data"
MEDIA_URL_PREFIX = "/exercise-media"
UPSTREAM_BASE_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main"
DOWNLOAD_CONCURRENCY = 16

# ── S3 / Garage ──────────────────────────────────────────────────────────────
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "gym-tracker-media")
S3_REGION = os.getenv("S3_REGION", "garage")

_s3_client: Any = None


def _get_s3() -> boto3.client:
    """Lazy-init the S3 client (Garage-compatible)."""
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


def _parse_exercise(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Map a dataset entry to Exercise model fields."""
    name = raw.get("name", "").strip()
    if not name:
        return None

    instructions = raw.get("instructions") or {}
    image = raw.get("image", "")
    gif = raw.get("gif_url", "")

    return {
        "external_id": raw.get("id", ""),
        "name": name,
        "muscle_group": raw.get("muscle_group") or raw.get("target") or "other",
        "secondary_muscles": ", ".join(raw.get("secondary_muscles") or []),
        "target": raw.get("target", ""),
        "body_part": raw.get("body_part", ""),
        "equipment": raw.get("equipment", ""),
        "instructions": instructions.get("en", ""),
        "instructions_es": instructions.get("es", ""),
        "image_url": f"{MEDIA_URL_PREFIX}/{image}" if image else "",
        "gif_url": f"{MEDIA_URL_PREFIX}/{gif}" if gif else "",
    }


async def seed_exercises(db: AsyncSession) -> int:
    """Seed exercises from the local JSON. Returns number of rows inserted."""
    result = await db.execute(select(func.count(Exercise.id)))
    count = result.scalar()
    if count and count > 0:
        return 0

    with open(DATA_DIR / "exercises.json", encoding="utf-8") as f:
        data = json.load(f)

    inserted = 0
    for raw in data:
        parsed = _parse_exercise(raw)
        if parsed is None:
            continue
        db.add(Exercise(**parsed))
        inserted += 1

    await db.commit()
    logger.info("Seeded %d exercises from local dataset", inserted)
    return inserted


def _upload_to_s3(key: str, content: bytes, content_type: str) -> None:
    """Upload a single object to Garage S3."""
    s3 = _get_s3()
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )


def _download_and_upload(relative_path: str) -> None:
    """Download a media file from upstream and upload it to Garage S3."""
    url = f"{UPSTREAM_BASE_URL}/{relative_path}"
    with urllib.request.urlopen(url, timeout=30) as response:
        content = response.read()
        content_type = response.headers.get("Content-Type", "application/octet-stream")

    _upload_to_s3(relative_path, content, content_type)


def _download_to_disk(relative_path: str) -> None:
    """Fallback: download media to local disk (when S3 is not configured)."""
    target = DATA_DIR / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"{UPSTREAM_BASE_URL}/{relative_path}", timeout=30) as response:
        content = response.read()
    target.write_bytes(content)


async def download_missing_media() -> None:
    """Fetch exercise images/GIFs from the upstream dataset.

    When S3 is configured, uploads to Garage. Otherwise falls back to local disk.
    Existing objects/files are never re-downloaded.
    """
    with open(DATA_DIR / "exercises.json", encoding="utf-8") as file:
        entries = json.load(file)

    media_paths = [
        path
        for entry in entries
        for path in (entry.get("image", ""), entry.get("gif_url", ""))
        if path
    ]

    if _s3_enabled():
        # Check which keys already exist in Garage
        s3 = _get_s3()
        existing_keys: set[str] = set()
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=S3_BUCKET):
            for obj in page.get("Contents", []):
                existing_keys.add(obj["Key"])

        missing_paths = [p for p in media_paths if p not in existing_keys]
        if not missing_paths:
            return

        logger.info("Uploading %d missing exercise media files to Garage S3", len(missing_paths))
        semaphore = asyncio.Semaphore(DOWNLOAD_CONCURRENCY)
        failed_count = 0

        async def upload_with_limit(relative_path: str) -> None:
            nonlocal failed_count
            async with semaphore:
                try:
                    await asyncio.to_thread(_download_and_upload, relative_path)
                except Exception as error:
                    failed_count += 1
                    logger.warning("Media upload failed for %s: %s", relative_path, error)

        await asyncio.gather(*(upload_with_limit(path) for path in missing_paths))
        logger.info("Exercise media upload finished (%d ok, %d failed)", len(missing_paths) - failed_count, failed_count)
    else:
        # Fallback: download to local disk
        missing_paths = [path for path in media_paths if not (DATA_DIR / path).exists()]
        if not missing_paths:
            return

        logger.info("Downloading %d missing exercise media files to local disk", len(missing_paths))
        semaphore = asyncio.Semaphore(DOWNLOAD_CONCURRENCY)
        failed_count = 0

        async def download_with_limit(relative_path: str) -> None:
            nonlocal failed_count
            async with semaphore:
                try:
                    await asyncio.to_thread(_download_to_disk, relative_path)
                except Exception as error:
                    failed_count += 1
                    logger.warning("Media download failed for %s: %s", relative_path, error)

        await asyncio.gather(*(download_with_limit(path) for path in missing_paths))
        logger.info("Exercise media download finished (%d ok, %d failed)", len(missing_paths) - failed_count, failed_count)
