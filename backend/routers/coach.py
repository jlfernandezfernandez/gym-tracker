"""Coach router — plan creation.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. The agent picks exercises from the
catalog (`list_exercises`) and must send them in the body.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_session
from telegram_auth import current_user_id
from models import AthleteMeasurement, BODYWEIGHT_WEIGHT, Exercise, WorkoutSession, PlannedExercise
from schemas import CoachPlanRequest, SessionOut, SessionSummary
from routers.sessions import _current_state, _load_session
from routers.profile import _get_or_create_profile

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.get("/snapshot")
async def training_snapshot(
    limit: int = 5,
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Compact context for a coach turn; avoids a fan-out of MCP reads."""
    limit = max(1, min(limit, 10))
    profile = await _get_or_create_profile(db, user_id)
    sessions = (await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.telegram_user_id == user_id)
        .options(selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets), selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise))
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc()).limit(limit)
    )).scalars().all()
    active = (await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.telegram_user_id == user_id, WorkoutSession.status.in_(("planned", "in_progress")))
        .options(selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets), selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise))
        .order_by(case((WorkoutSession.status == "in_progress", 0), else_=1), WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .limit(1)
    )).scalar_one_or_none()
    measurements = (await db.execute(
        select(AthleteMeasurement).where(AthleteMeasurement.telegram_user_id == user_id)
        .order_by(AthleteMeasurement.measured_at.desc()).limit(3)
    )).scalars().all()
    return {
        "profile": profile,
        "active_session": {"session": SessionOut.model_validate(active, from_attributes=True), "current": _current_state(active)} if active else None,
        "recent_sessions": [
            SessionSummary(
                id=session.id, session_date=session.session_date, title=session.title, status=session.status,
                energy=session.energy, duration_actual=session.duration_actual,
                exercise_count=len(session.planned_exercises or []),
                total_sets=sum(len(item.performed_sets or []) for item in session.planned_exercises or []),
            ).model_dump(mode="json") | {
                "exercises": [
                    {
                        "exercise_id": item.exercise_id,
                        "name": item.exercise.name if item.exercise else "",
                        "status": item.status,
                        "target_sets": item.target_sets,
                        "target_reps": item.target_reps,
                        "performed_sets": [
                            {"weight": performed.weight, "reps": performed.reps, "rpe": performed.rpe}
                            for performed in item.performed_sets or []
                        ],
                    }
                    for item in sorted(session.planned_exercises or [], key=lambda item: item.order)
                ],
            }
            for session in sessions
        ],
        "recent_measurements": measurements,
    }


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
