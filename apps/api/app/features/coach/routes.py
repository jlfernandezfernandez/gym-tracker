"""Coach router — plan creation and history import.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. The agent picks exercises from the
catalog (`list_exercises`) and must send them in the body.
"""

from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_user_id
from app.core.database import get_session
from app.features.disliked.routes import disliked_exercise_ids
from app.features.profile.routes import _get_or_create_profile
from app.features.sessions.schemas import (
    CoachImportRequest,
    CoachPlanRequest,
    SessionOut,
    SessionSummary,
)
from app.features.sessions.service import current_state, load_session, validate_exercise_weight
from app.models import (
    AthleteMeasurement,
    Exercise,
    PerformedSet,
    PlannedExercise,
    WorkoutSession,
)

router = APIRouter(prefix="/coach", tags=["coach"])


@router.get("/snapshot")
async def training_snapshot(
    limit: int = 5,
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Compact context for a coach turn; avoids a fan-out of MCP reads."""
    limit = max(1, min(limit, 10))
    profile = await _get_or_create_profile(db, user_id)
    sessions = (
        (
            await db.execute(
                select(WorkoutSession)
                .where(WorkoutSession.telegram_user_id == user_id)
                .options(
                    selectinload(WorkoutSession.planned_exercises).selectinload(
                        PlannedExercise.performed_sets
                    ),
                    selectinload(WorkoutSession.planned_exercises).selectinload(
                        PlannedExercise.exercise
                    ),
                )
                .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    active = (
        await db.execute(
            select(WorkoutSession)
            .where(
                WorkoutSession.telegram_user_id == user_id,
                WorkoutSession.status.in_(("planned", "in_progress")),
            )
            .options(
                selectinload(WorkoutSession.planned_exercises).selectinload(
                    PlannedExercise.performed_sets
                ),
                selectinload(WorkoutSession.planned_exercises).selectinload(
                    PlannedExercise.exercise
                ),
            )
            .order_by(
                case((WorkoutSession.status == "in_progress", 0), else_=1),
                WorkoutSession.session_date.desc(),
                WorkoutSession.id.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    measurements = (
        (
            await db.execute(
                select(AthleteMeasurement)
                .where(AthleteMeasurement.telegram_user_id == user_id)
                .order_by(AthleteMeasurement.measured_at.desc())
                .limit(3)
            )
        )
        .scalars()
        .all()
    )
    return {
        "profile": profile,
        "active_session": {
            "session": SessionOut.model_validate(active, from_attributes=True),
            "current": current_state(active),
        }
        if active
        else None,
        "recent_sessions": [
            SessionSummary(
                id=session.id,
                session_date=session.session_date,
                title=session.title,
                status=session.status,
                energy=session.energy,
                duration_actual=session.duration_actual,
                exercise_count=len(session.planned_exercises or []),
                total_sets=sum(
                    len(item.performed_sets or []) for item in session.planned_exercises or []
                ),
            ).model_dump(mode="json")
            | {
                "exercises": [
                    {
                        "exercise_id": item.exercise_id,
                        "name": item.exercise.name if item.exercise else "",
                        "status": item.status,
                        "target_sets": item.target_sets,
                        "target_reps": item.target_reps,
                        "performed_sets": [
                            {
                                "weight": performed.weight,
                                "reps": performed.reps,
                                "rpe": performed.rpe,
                            }
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
    user_id: int | None = Depends(current_user_id),
):
    """Create a workout plan from the coach agent's exercise selection."""

    if not body.exercises:
        raise HTTPException(
            status_code=422,
            detail=(
                "exercises is required: pick exercises from list_exercises"
                " and send them in the plan."
            ),
        )
    profile = await _get_or_create_profile(db, user_id)
    requested_ids = [ex.exercise_id for ex in body.exercises]
    disliked_ids = await disliked_exercise_ids(db, profile.id, requested_ids)
    if disliked_ids:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Exercises {sorted(disliked_ids)} are disliked by the athlete. Pick alternatives."
            ),
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
            raise HTTPException(
                status_code=422, detail=f"Exercise {exercise_spec.exercise_id} not found"
            )
        validate_exercise_weight(exercise, exercise_spec.suggested_weight)
        set_targets_data = None
        if exercise_spec.set_targets:
            set_targets_data = [t.model_dump() for t in exercise_spec.set_targets]
            for t in set_targets_data:
                validate_exercise_weight(exercise, t.get("weight"))
        db.add(
            PlannedExercise(
                session_id=workout.id,
                exercise_id=exercise_spec.exercise_id,
                order=exercise_spec.order,
                target_sets=exercise_spec.target_sets,
                target_reps=exercise_spec.target_reps,
                suggested_weight=exercise_spec.suggested_weight,
                notes=exercise_spec.notes,
                set_targets=set_targets_data,
            )
        )

    await db.commit()
    return await load_session(workout.id, db)


@router.post("/import", response_model=SessionOut)
async def coach_import(
    body: CoachImportRequest,
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Import one already-performed historical session in a single call.

    Creates a completed session on session_date with its exercises and
    performed sets, for athletes migrating from another tracker.
    """
    workout = WorkoutSession(
        session_date=body.session_date,
        title=body.title or "Entreno importado",
        status="completed",
        feedback=body.feedback,
        duration_actual=body.duration_actual,
        telegram_user_id=user_id,
    )
    db.add(workout)
    await db.flush()

    # ponytail: fixed midday timestamp — the source tracker rarely keeps per-set times
    performed_at = datetime.combine(body.session_date, time(12, 0))
    for exercise_spec in body.exercises:
        exercise = await db.get(Exercise, exercise_spec.exercise_id)
        if not exercise:
            raise HTTPException(
                status_code=422, detail=f"Exercise {exercise_spec.exercise_id} not found"
            )
        planned = PlannedExercise(
            session_id=workout.id,
            exercise_id=exercise_spec.exercise_id,
            order=exercise_spec.order,
            target_sets=len(exercise_spec.sets),
            target_reps=exercise_spec.sets[0].reps,
            suggested_weight=exercise_spec.sets[0].weight,
            notes=exercise_spec.notes,
            status="completed",
        )
        db.add(planned)
        await db.flush()
        for set_number, set_spec in enumerate(exercise_spec.sets, start=1):
            validate_exercise_weight(exercise, set_spec.weight)
            db.add(
                PerformedSet(
                    planned_exercise_id=planned.id,
                    set_number=set_number,
                    weight=set_spec.weight,
                    reps=set_spec.reps,
                    rpe=set_spec.rpe,
                    notes=set_spec.notes,
                    timestamp=performed_at,
                )
            )

    await db.commit()
    return await load_session(workout.id, db)
