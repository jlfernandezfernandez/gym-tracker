"""Coach router — plan creation.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. The agent picks exercises from the
catalog (`list_exercises`) and must send them in the body.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from telegram_auth import current_user_id
from models import WorkoutSession, PlannedExercise
from schemas import CoachPlanRequest, SessionOut
from routers.sessions import _load_session

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.post("/plan", response_model=SessionOut)
async def coach_plan(
    body: CoachPlanRequest,
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Create a workout plan from the coach agent's exercise selection."""

    if not body.exercises:
        raise HTTPException(
            status_code=422,
            detail="exercises is required: pick exercises from list_exercises and send them in the plan.",
        )
    exercises_data = [exercise.model_dump() for exercise in body.exercises]

    workout = WorkoutSession(
        title=body.title or "Entreno de hoy",
        goal=body.goal,
        status="planned",
        energy=body.energy,
        discomfort=body.discomfort,
        duration_estimated=body.time_available,
        telegram_user_id=user_id,
    )
    db.add(workout)
    await db.flush()

    for position, exercise_data in enumerate(exercises_data):
        db.add(PlannedExercise(
            session_id=workout.id,
            exercise_id=exercise_data["exercise_id"],
            order=exercise_data.get("order", position),
            target_sets=exercise_data.get("target_sets", 3),
            target_reps=exercise_data.get("target_reps", 10),
            suggested_weight=exercise_data.get("suggested_weight", 0.0),
            notes=exercise_data.get("notes", ""),
        ))

    await db.commit()
    return await _load_session(workout.id, db)
