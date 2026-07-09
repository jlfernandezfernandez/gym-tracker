"""
Seed exercises from the vendored dataset (backend/exercise_data/) into the DB.

Dataset: https://github.com/hasaneyldrm/exercises-dataset (media © Gym Visual,
see exercise_data/NOTICE.md). Runs on startup; no-op if the table already has rows.
"""

import asyncio
import json
import logging
import urllib.request
from pathlib import Path
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Exercise

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "exercise_data"
MEDIA_URL_PREFIX = "/exercise-media"
UPSTREAM_BASE_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main"
DOWNLOAD_CONCURRENCY = 16


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


def _download_media_file(relative_path: str) -> None:
    target = DATA_DIR / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"{UPSTREAM_BASE_URL}/{relative_path}", timeout=30) as response:
        content = response.read()
    # Write only after a full read so a failed download never leaves a truncated file.
    target.write_bytes(content)


async def download_missing_media() -> None:
    """Fetch exercise images/GIFs missing on disk from the upstream dataset.

    Media is not vendored in the repo (issue #7): the catalog JSON travels with
    the code and binaries are pulled on boot. Existing files are never re-downloaded.
    """
    with open(DATA_DIR / "exercises.json", encoding="utf-8") as file:
        entries = json.load(file)

    media_paths = [
        path
        for entry in entries
        for path in (entry.get("image", ""), entry.get("gif_url", ""))
        if path
    ]
    missing_paths = [path for path in media_paths if not (DATA_DIR / path).exists()]
    if not missing_paths:
        return

    logger.info("Downloading %d missing exercise media files from upstream", len(missing_paths))
    semaphore = asyncio.Semaphore(DOWNLOAD_CONCURRENCY)
    failed_count = 0

    async def download_with_limit(relative_path: str) -> None:
        nonlocal failed_count
        async with semaphore:
            try:
                await asyncio.to_thread(_download_media_file, relative_path)
            except Exception as error:
                failed_count += 1
                logger.warning("Media download failed for %s: %s", relative_path, error)

    await asyncio.gather(*(download_with_limit(path) for path in missing_paths))
    logger.info("Exercise media download finished (%d ok, %d failed)", len(missing_paths) - failed_count, failed_count)
