import asyncio
import json
import urllib.request
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Exercise
from app.storage.s3 import S3Storage


@dataclass
class SeedResult:
    added: int
    updated: int
    media_uploaded: int


def parse_exercise(entry: dict[str, Any]) -> dict[str, Any]:
    instructions = entry.get("instructions", {})
    instructions_en = instructions.get("en", "") if isinstance(instructions, dict) else ""
    instructions_es = instructions.get("es", "") if isinstance(instructions, dict) else ""
    image_path = entry.get("image", "")
    gif_path = entry.get("gif_url", "")
    return {
        "external_id": str(entry.get("id", "")),
        "name": entry.get("name_es", "") or entry.get("name", ""),
        "name_en": entry.get("name", ""),
        "name_es": entry.get("name_es", ""),
        "muscle_group": entry.get("target", ""),
        "secondary_muscles": ", ".join(entry.get("secondary_muscles", [])),
        "target": entry.get("target", ""),
        "body_part": entry.get("body_part", ""),
        "equipment": entry.get("equipment", ""),
        "instructions": instructions_en,
        "instructions_es": instructions_es,
        "image_url": f"/exercise-media/{image_path}" if image_path else "",
        "gif_url": f"/exercise-media/{gif_path}" if gif_path else "",
    }


def media_paths(entries: list[dict[str, Any]], existing_keys: set[str]) -> list[str]:
    paths = set()
    for entry in entries:
        if image := entry.get("image"):
            paths.add(image)
        if gif := entry.get("gif_url"):
            paths.add(gif)
    missing = sorted(paths - existing_keys)
    return missing


async def fetch_catalog(settings: Settings) -> list[dict[str, Any]]:
    url = f"{settings.exercise_dataset_raw_base}/exercises.json"

    def _fetch() -> list[dict[str, Any]]:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.load(response)

    return await asyncio.to_thread(_fetch)


async def seed_catalog(db: AsyncSession, entries: list[dict[str, Any]]) -> SeedResult:
    result = await db.execute(select(Exercise))
    existing = {exercise.external_id: exercise for exercise in result.scalars()}
    added = 0
    updated = 0
    for entry in entries:
        parsed = parse_exercise(entry)
        external_id = parsed["external_id"]
        if not external_id:
            continue
        if external_id in existing:
            exercise = existing[external_id]
            for key, value in parsed.items():
                if key != "external_id":
                    setattr(exercise, key, value)
            updated += 1
        else:
            exercise = Exercise(**parsed)
            db.add(exercise)
            added += 1
    await db.flush()
    return SeedResult(added=added, updated=updated, media_uploaded=0)


async def seed_missing_media(
    storage: S3Storage, settings: Settings, entries: list[dict[str, Any]]
) -> int:
    existing_keys = storage.list_keys()
    missing = media_paths(entries, existing_keys)
    if not missing:
        return 0

    semaphore = asyncio.Semaphore(8)
    uploaded = 0

    async def _upload_one(path: str) -> None:
        nonlocal uploaded
        async with semaphore:
            url = f"{settings.exercise_dataset_raw_base}/{path}"

            def _download_and_upload() -> None:
                with urllib.request.urlopen(url, timeout=30) as response:
                    content = response.read()
                    content_type = response.headers.get("Content-Type", "application/octet-stream")
                storage.upload(path, content, content_type)

            await asyncio.to_thread(_download_and_upload)
            uploaded += 1

    await asyncio.gather(*[_upload_one(path) for path in missing])
    return uploaded


async def sync_exercise_catalog(
    db: AsyncSession, storage: S3Storage, settings: Settings
) -> SeedResult:
    entries = await fetch_catalog(settings)
    seed_result = await seed_catalog(db, entries)
    media_uploaded = await seed_missing_media(storage, settings, entries)
    return SeedResult(
        added=seed_result.added,
        updated=seed_result.updated,
        media_uploaded=media_uploaded,
    )
