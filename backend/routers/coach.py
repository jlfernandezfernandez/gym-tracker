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
from models import BODYWEIGHT_WEIGHT, Exercise, WorkoutSession, PlannedExercise
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

    for exercise_spec in body.exercises:
        exercise = await db.get(Exercise, exercise_spec.exercise_id)
        if not exercise:
            raise HTTPException(status_code=422, detail=f"Exercise {exercise_spec.exercise_id} not found")
        if exercise.is_bodyweight:
            suggested_weight = BODYWEIGHT_WEIGHT
        elif exercise_spec.suggested_weight == BODYWEIGHT_WEIGHT:
            raise HTTPException(status_code=422, detail="-1 weight is reserved for bodyweight exercises")
        db.add(PlannedExercise(
            session_id=workout.id,
            exercise_id=exercise_spec.exercise_id,
            order=exercise_spec.order,
            target_sets=exercise_spec.target_sets,
            target_reps=exercise_spec.target_reps,
            suggested_weight=suggested_weight if exercise.is_bodyweight else exercise_spec.suggested_weight,
            notes=exercise_spec.notes,
        ))

    await db.commit()
    return await _load_session(workout.id, db)
