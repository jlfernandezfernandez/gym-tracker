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
    uid: Optional[int] = Depends(current_user_id),
):
    """Create a workout plan from the coach agent's exercise selection."""

    if not body.exercises:
        raise HTTPException(
            status_code=422,
            detail="exercises is required: pick exercises from list_exercises and send them in the plan.",
        )
    exercises_data = [ex.model_dump() for ex in body.exercises]

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
