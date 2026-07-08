"""Coach router — plan creation and exercise alternatives.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. This endpoint just stores the plan
with a deterministic fallback if no exercises are provided.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from database import get_session
from telegram_auth import get_telegram_user_id
from models import WorkoutSession, PlannedExercise, Exercise
from schemas import CoachPlanRequest, SessionOut, ExerciseOut
from routers.sessions import _load_session

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.post("/plan", response_model=SessionOut)
async def coach_plan(
    body: CoachPlanRequest,
    db: AsyncSession = Depends(get_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Create a workout plan. The coach agent provides exercise IDs via MCP;
    if none provided, a deterministic fallback picks common exercises.
    """
    uid = get_telegram_user_id(init_data, coach_key)

    title = "Entreno de hoy"
    goal = ""
    exercises_data = []

    # If the agent provided exercises via MCP, use them
    # (future: accept exercises in body — for now MCP calls create_plan
    # which sends energy/time/context, and the agent picks exercises
    # via list_exercises + create_session)

    # Deterministic fallback: pick common exercises by name
    desired = 4 if body.time_available <= 35 else 5 if body.time_available <= 55 else 6
    # Search by well-known names instead of hardcoded IDs
    fallback_names = ["bench", "squat", "deadlift", "row", "press", "pull"]
    fallback_exercises: list[Exercise] = []
    for name in fallback_names:
        if len(fallback_exercises) >= desired:
            break
        stmt = select(Exercise).where(Exercise.name.ilike(f"%{name}%")).limit(1)
        result = await db.execute(stmt)
        ex = result.scalar_one_or_none()
        if ex and ex not in fallback_exercises:
            fallback_exercises.append(ex)

    # Top up with any exercises if we didn't find enough
    if len(fallback_exercises) < desired:
        stmt = select(Exercise).order_by(Exercise.name).limit(desired - len(fallback_exercises))
        result = await db.execute(stmt)
        fallback_exercises.extend(result.scalars().all())

    exercises_data = [
        {
            "exercise_id": ex.id,
            "order": i,
            "target_sets": 3,
            "target_reps": 10,
            "suggested_weight": 0.0,
            "notes": "Empieza conservador y ajusta según sensaciones.",
        }
        for i, ex in enumerate(fallback_exercises)
    ]

    db_session = WorkoutSession(
        title=title,
        goal=goal,
        status="planned",
        energy=body.energy,
        discomfort=body.discomfort,
        duration_estimated=body.time_available,
        telegram_user_id=uid,
    )
    db.add(db_session)
    await db.flush()

    for ex in exercises_data:
        pe = PlannedExercise(
            session_id=db_session.id,
            exercise_id=ex["exercise_id"],
            order=ex["order"],
            target_sets=ex["target_sets"],
            target_reps=ex["target_reps"],
            suggested_weight=ex["suggested_weight"],
            notes=ex["notes"],
        )
        db.add(pe)

    await db.commit()
    return await _load_session(db_session.id, db)


@router.get("/alternatives", response_model=list[ExerciseOut])
async def alternatives(
    muscle: str = "",
    limit: int = 4,
    db: AsyncSession = Depends(get_session),
):
    """Return same-muscle alternatives for the coach change flow."""
    stmt = select(Exercise)
    if muscle:
        stmt = stmt.where(Exercise.muscle_group == muscle)
    stmt = stmt.order_by(Exercise.name).limit(max(1, min(limit, 8)))
    result = await db.execute(stmt)
    return result.scalars().all()