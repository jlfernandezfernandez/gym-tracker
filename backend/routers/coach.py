"""Coach router — plan creation.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. The agent picks exercises from the
catalog (`list_exercises`) and sends them in the body; if none are provided,
a deterministic fallback picks common exercises so the flow never breaks.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from telegram_auth import current_user_id
from models import WorkoutSession, PlannedExercise, Exercise
from schemas import CoachPlanRequest, SessionOut
from routers.sessions import _load_session

router = APIRouter(prefix="/api/coach", tags=["coach"])


async def _fallback_exercises(db: AsyncSession, time_available: int) -> list[dict]:
    """Pick common compound exercises by name when the agent sends none."""
    desired = 4 if time_available <= 35 else 5 if time_available <= 55 else 6
    fallback_names = ["bench", "squat", "deadlift", "row", "press", "pull"]
    found: list[Exercise] = []
    for name in fallback_names:
        if len(found) >= desired:
            break
        result = await db.execute(select(Exercise).where(Exercise.name.ilike(f"%{name}%")).limit(1))
        ex = result.scalar_one_or_none()
        if ex and ex not in found:
            found.append(ex)
    if len(found) < desired:
        result = await db.execute(select(Exercise).order_by(Exercise.name).limit(desired - len(found)))
        found.extend(result.scalars().all())
    return [
        {
            "exercise_id": ex.id,
            "order": i,
            "target_sets": 3,
            "target_reps": 10,
            "suggested_weight": 0.0,
            "notes": "Empieza conservador y ajusta según sensaciones.",
        }
        for i, ex in enumerate(found)
    ]


@router.post("/plan", response_model=SessionOut)
async def coach_plan(
    body: CoachPlanRequest,
    db: AsyncSession = Depends(get_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Create a workout plan from the coach agent's exercise selection."""

    if body.exercises:
        exercises_data = [ex.model_dump() for ex in body.exercises]
    else:
        exercises_data = await _fallback_exercises(db, body.time_available)

    db_session = WorkoutSession(
        title=body.title or "Entreno de hoy",
        goal=body.goal,
        status="planned",
        energy=body.energy,
        discomfort=body.discomfort,
        duration_estimated=body.time_available,
        telegram_user_id=uid,
    )
    db.add(db_session)
    await db.flush()

    for i, ex in enumerate(exercises_data):
        db.add(PlannedExercise(
            session_id=db_session.id,
            exercise_id=ex["exercise_id"],
            order=ex.get("order", i),
            target_sets=ex.get("target_sets", 3),
            target_reps=ex.get("target_reps", 10),
            suggested_weight=ex.get("suggested_weight", 0.0),
            notes=ex.get("notes", ""),
        ))

    await db.commit()
    return await _load_session(db_session.id, db)
