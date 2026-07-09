"""
Seed exercises from the vendored dataset (backend/exercise_data/) into the DB.

Dataset: https://github.com/hasaneyldrm/exercises-dataset (media © Gym Visual,
see exercise_data/NOTICE.md). Runs on startup; no-op if the table already has rows.
"""

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Exercise

DATA_DIR = Path(__file__).resolve().parent.parent / "exercise_data"
MEDIA_URL_PREFIX = "/exercise-media"


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
    print(f"Seeded {inserted} exercises from local dataset")
    return inserted
