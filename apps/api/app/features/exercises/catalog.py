import asyncio
import hashlib
import json
import os
import re
import shutil
import tarfile
import tempfile
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import CatalogState, Exercise


@dataclass(frozen=True)
class DatasetManifest:
    dataset_version: str
    sha256: str
    exercise_count: int
    media_count: int
    archive: str = "exercise-dataset.tar.gz"

    @classmethod
    def parse(cls, payload: dict[str, Any], expected_version: str) -> "DatasetManifest":
        if payload.get("schema_version") != 1:
            raise ValueError("Unsupported dataset manifest")
        if payload.get("dataset_version") != expected_version:
            raise ValueError("Dataset version mismatch")
        if payload.get("archive") != "exercise-dataset.tar.gz":
            raise ValueError("Unexpected dataset archive")
        sha256 = payload.get("sha256", "")
        if not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise ValueError("Invalid dataset checksum")
        return cls(
            dataset_version=expected_version,
            sha256=sha256,
            exercise_count=int(payload.get("exercise_count", 0)),
            media_count=int(payload.get("media_count", 0)),
        )


@dataclass(frozen=True)
class SeedResult:
    added: int
    updated: int
    media_installed: int
    skipped: bool = False


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


def manifest_url(settings: Settings) -> str:
    return f"{settings.exercise_dataset_release_url}/manifest.json"


def archive_url(settings: Settings) -> str:
    return f"{settings.exercise_dataset_release_url}/exercise-dataset.tar.gz"


def fetch_manifest(settings: Settings) -> DatasetManifest:
    with urllib.request.urlopen(manifest_url(settings), timeout=30) as response:
        payload = json.load(response)
    return DatasetManifest.parse(payload, settings.exercise_dataset_version)


def download_archive(settings: Settings, destination: Path, expected_sha256: str) -> None:
    digest = hashlib.sha256()
    with urllib.request.urlopen(archive_url(settings), timeout=60) as response:
        with destination.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
    if digest.hexdigest() != expected_sha256:
        raise ValueError("Dataset checksum mismatch")


def _safe_member_name(name: str) -> bool:
    path = PurePosixPath(name)
    return not path.is_absolute() and ".." not in path.parts


def extract_archive(
    archive_path: Path, destination: Path, manifest: DatasetManifest
) -> tuple[list[dict[str, Any]], int]:
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        if any(not member.isfile() or not _safe_member_name(member.name) for member in members):
            raise ValueError("Unsafe dataset archive")
        by_name = {member.name: member for member in members}
        if len(by_name) != len(members) or "data/exercises.json" not in by_name:
            raise ValueError("Invalid dataset archive")
        dataset_file = archive.extractfile(by_name["data/exercises.json"])
        if dataset_file is None:
            raise ValueError("Dataset is missing")
        entries = json.load(dataset_file)
        if not isinstance(entries, list) or len(entries) != manifest.exercise_count:
            raise ValueError("Exercise count mismatch")
        if any(
            not isinstance(entry.get("image"), str)
            or not entry["image"].startswith("images/")
            or not isinstance(entry.get("gif_url"), str)
            or not entry["gif_url"].startswith("videos/")
            for entry in entries
        ):
            raise ValueError("Invalid media path")
        media = sorted({entry[field] for entry in entries for field in ("image", "gif_url")})
        if len(media) != manifest.media_count or any(name not in by_name for name in media):
            raise ValueError("Media count mismatch")
        allowed = {"data/exercises.json", "LICENSE", "NOTICE.md", *media}
        if set(by_name) != allowed:
            raise ValueError("Unexpected dataset archive contents")

        for name in [*media, "LICENSE", "NOTICE.md"]:
            source = archive.extractfile(by_name[name])
            if source is None:
                raise ValueError(f"Missing archive member: {name}")
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("wb") as output:
                shutil.copyfileobj(source, output)
    return entries, len(media)


async def seed_catalog(db: AsyncSession, entries: list[dict[str, Any]]) -> tuple[int, int]:
    result = await db.execute(select(Exercise))
    existing = {exercise.external_id: exercise for exercise in result.scalars()}
    added = updated = 0
    for entry in entries:
        parsed = parse_exercise(entry)
        external_id = parsed["external_id"]
        if not external_id:
            continue
        if exercise := existing.get(external_id):
            for key, value in parsed.items():
                if key != "external_id":
                    setattr(exercise, key, value)
            updated += 1
        else:
            db.add(Exercise(**parsed))
            added += 1
    await db.flush()
    return added, updated


async def install_dataset(db: AsyncSession, settings: Settings) -> SeedResult:
    version_dir = settings.exercise_dataset_dir
    marker = version_dir / ".installed"
    state = await db.get(CatalogState, 1)
    if (
        state
        and state.dataset_version == settings.exercise_dataset_version
        and marker.is_file()
        and marker.read_text(encoding="utf-8").strip() == state.sha256
    ):
        return SeedResult(0, 0, 0, skipped=True)

    manifest = await asyncio.to_thread(fetch_manifest, settings)
    settings.exercise_dataset_root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=settings.exercise_dataset_root, delete=False) as temporary:
        archive_path = Path(temporary.name)
    temporary_dir = Path(
        tempfile.mkdtemp(
            prefix=f".{settings.exercise_dataset_version}-", dir=settings.exercise_dataset_root
        )
    )
    try:
        await asyncio.to_thread(download_archive, settings, archive_path, manifest.sha256)
        entries, media_count = await asyncio.to_thread(
            extract_archive, archive_path, temporary_dir, manifest
        )
        added, updated = await seed_catalog(db, entries)
        (temporary_dir / ".installed").write_text(manifest.sha256 + "\n", encoding="utf-8")
        for stale in settings.exercise_dataset_root.iterdir():
            if stale != temporary_dir:
                shutil.rmtree(stale, ignore_errors=True)
        os.replace(temporary_dir, version_dir)
        if state is None:
            state = CatalogState(dataset_version=manifest.dataset_version, sha256=manifest.sha256)
            db.add(state)
        else:
            state.dataset_version = manifest.dataset_version
            state.sha256 = manifest.sha256
            state.installed_at = datetime.now(UTC).replace(tzinfo=None)
        await db.flush()
        return SeedResult(added, updated, media_count)
    finally:
        archive_path.unlink(missing_ok=True)
        if temporary_dir.exists():
            shutil.rmtree(temporary_dir)
