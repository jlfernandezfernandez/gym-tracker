"""
Seed exercises from the vendored dataset (backend/exercise_data/) into the DB
and upload media to S3-compatible object storage.

Dataset: https://github.com/jlfernandezfernandez/exercises-dataset-es (media © Gym Visual, see exercise_data/NOTICE.md). Runs on startup and idempotently upserts metadata.
"""

import asyncio
import json
import logging
import os
import time
import urllib.request
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Exercise

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "exercise_data"
MEDIA_URL_PREFIX = "/exercise-media"
UPSTREAM_BASE_URL = "https://raw.githubusercontent.com/jlfernandezfernandez/exercises-dataset-es/main"
DOWNLOAD_CONCURRENCY = 8

# ── S3-compatible object storage ────────────────────────────────────────────
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


def _parse_exercise(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Map a dataset entry to Exercise model fields."""
    name_en = (raw.get("name_en") or raw.get("name") or "").strip()
    name_es = (raw.get("name_es") or name_en).strip()
    if not name_en:
        return None

    instructions = raw.get("instructions") or {}
    image = raw.get("image", "")
    gif = raw.get("gif_url", "")

    return {
        "external_id": raw.get("id", ""),
        "name": name_es,
        "name_en": name_en,
        "name_es": name_es,
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
    """Idempotently upsert exercise metadata without changing relations."""

    with open(DATA_DIR / "exercises.json", encoding="utf-8") as f:
        data = json.load(f)

    inserted = 0
    updated = 0
    for raw in data:
        parsed = _parse_exercise(raw)
        if parsed is None:
            continue
        result = await db.execute(
            select(Exercise).where(Exercise.external_id == parsed["external_id"])
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(Exercise(**parsed))
            inserted += 1
        else:
            for field, value in parsed.items():
                setattr(existing, field, value)
            updated += 1

    await db.commit()
    logger.info("Upserted exercises: %d inserted, %d updated", inserted, updated)
    return inserted


def _upload_to_s3(key: str, content: bytes, content_type: str) -> None:
    """Upload a single object to S3-compatible storage."""
    s3 = _get_s3()
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )


def _download_and_upload(relative_path: str) -> None:
    """Download a media file and upload it to S3 (with retries)."""
    url = f"{UPSTREAM_BASE_URL}/{relative_path}"
    attempts = 3
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                content = response.read()
                content_type = response.headers.get("Content-Type", "application/octet-stream")
            _upload_to_s3(relative_path, content, content_type)
            return
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(1 + attempt * 2)


def _download_to_disk(relative_path: str) -> None:
    """Fallback: download media to local disk (when S3 is not configured) (with retries)."""
    target = DATA_DIR / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"{UPSTREAM_BASE_URL}/{relative_path}"
    attempts = 3
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                content = response.read()
            target.write_bytes(content)
            return
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(1 + attempt * 2)


async def download_missing_media() -> None:
    """Fetch exercise images/GIFs from the upstream dataset.

    When S3 is configured, uploads to MinIO/S3. Otherwise falls back to local disk.
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
        # Check which keys already exist in S3
        s3 = _get_s3()
        existing_keys: set[str] = set()
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=S3_BUCKET):
            for obj in page.get("Contents", []):
                existing_keys.add(obj["Key"])

        missing_paths = [p for p in media_paths if p not in existing_keys]
        if not missing_paths:
            return

        logger.info("Uploading %d missing exercise media files to S3", len(missing_paths))
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
