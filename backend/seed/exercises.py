"""
Seed exercises from free-exercise-db into the database.

Downloads the exercise catalog JSON from the public repo and inserts
exercises if the database is empty.
"""

import json
from typing import Any

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Exercise

EXERCISE_DB_URL = (
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
)


def _parse_exercise(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Map a free-exercise-db entry to our Exercise model fields."""
    name = raw.get("name", "").strip()
    if not name:
        return None

    # Map muscle groups
    primary_muscles = raw.get("primaryMuscles", [])
    secondary_muscles = raw.get("secondaryMuscles", [])
    muscle_group = primary_muscles[0] if primary_muscles else "other"
    equipment = raw.get("equipment", "")
    instructions_list = raw.get("instructions", [])
    instructions = "\n".join(instructions_list) if isinstance(instructions_list, list) else ""

    # Images
    images = raw.get("images", [])
    image_url = images[0] if images else ""
    gif_url = ""

    return {
        "name": name,
        "muscle_group": muscle_group,
        "secondary_muscles": ", ".join(secondary_muscles),
        "equipment": equipment,
        "instructions": instructions,
        "image_url": image_url,
        "gif_url": gif_url,
        "source": "free-exercise-db",
        "alternatives": "",
    }


async def seed_exercises(db: AsyncSession) -> int:
    """Download and seed exercises. Returns number of new exercises inserted."""
    # Check if already seeded
    result = await db.execute(select(func.count(Exercise.id)))
    count = result.scalar()
    if count and count > 0:
        return 0

    print("Downloading exercise catalog from free-exercise-db...")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(EXERCISE_DB_URL)
        resp.raise_for_status()
        data = resp.json()

    exercises = data if isinstance(data, list) else data.get("exercises", [])

    inserted = 0
    for raw in exercises:
        parsed = _parse_exercise(raw)
        if parsed is None:
            continue
        exercise = Exercise(**parsed)
        db.add(exercise)
        inserted += 1

    await db.commit()
    print(f"Seeded {inserted} exercises from free-exercise-db")
    return inserted
