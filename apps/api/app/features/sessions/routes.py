from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.features.sessions.schemas import (
    PerformedSetCreate,
    PlannedExerciseUpdate,
    SessionFinish,
    SessionOut,
    SessionSummary,
    SessionUpdate,
)
from app.features.sessions.service import (
    check_session_owner,
    current_state,
    find_planned_exercise,
    load_session,
    set_conflict_error,
    start_session,
)
from app.models import BODYWEIGHT_WEIGHT, Exercise, PerformedSet, PlannedExercise, WorkoutSession

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _ensure_replaceable(planned_exercise: PlannedExercise) -> None:
    """A set belongs permanently to the exercise it was performed for."""
    if planned_exercise.performed_sets:
        raise HTTPException(status_code=422, detail="Cannot replace an exercise after logging sets")


@router.get("/active")
async def get_active_session(
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Get latest non-completed session with derived current exercise state."""
    statement = select(WorkoutSession).where(WorkoutSession.status.in_(("planned", "in_progress")))
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = (
        statement.order_by(
            case((WorkoutSession.status == "in_progress", 0), else_=1),
            WorkoutSession.session_date.desc(),
            WorkoutSession.id.desc(),
        )
        .limit(1)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            ),
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
        )
    )
    result = await db.execute(statement)
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="No active session found")
    # Serialize explicitly: without a response_model FastAPI drops ORM relationships.
    return {
        "session": SessionOut.model_validate(workout, from_attributes=True),
        "current": current_state(workout),
    }


@router.get("/{session_id}/current")
async def get_current_exercise(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Get derived current exercise/set for the agent and Mini App."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    return current_state(workout)


@router.post("/{session_id}/exercises/{planned_id}/complete", response_model=SessionOut)
async def complete_planned_exercise(
    session_id: int,
    planned_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Mark one planned exercise completed and keep session active."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)

    planned_exercise.status = "completed"
    start_session(workout)
    await db.commit()
    return await load_session(session_id, db)


@router.put("/{session_id}/exercises/{planned_id}", response_model=SessionOut)
async def update_planned_exercise(
    session_id: int,
    planned_id: int,
    body: PlannedExerciseUpdate,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Update a planned exercise: change status, swap the exercise, or set notes."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    # Reuse the eager-loaded relation from load_session.
    planned_exercise = find_planned_exercise(workout, planned_id)

    if body.status is not None:
        planned_exercise.status = body.status
    if body.new_exercise_id is not None:
        _ensure_replaceable(planned_exercise)
        if not await db.get(Exercise, body.new_exercise_id):
            raise HTTPException(status_code=404, detail="Exercise not found in catalog")
        planned_exercise.exercise_id = body.new_exercise_id
    if body.target_sets is not None:
        logged = len(planned_exercise.performed_sets or [])
        if body.target_sets < logged:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot reduce target_sets below {logged} (already logged sets)",
            )
        planned_exercise.target_sets = body.target_sets
    if body.notes is not None:
        planned_exercise.notes = body.notes

    # Recompute completion from logged sets (issue #9): swapping or changing an
    # exercise must not strand it in in_progress/changed when all target sets
    # are already logged.
    if (
        planned_exercise.target_sets > 0
        and len(planned_exercise.performed_sets or []) >= planned_exercise.target_sets
    ):
        planned_exercise.status = "completed"

    if planned_exercise.status in {"in_progress", "completed", "skipped"}:
        start_session(workout)
    await db.commit()
    db.expire_all()
    return await load_session(session_id, db)


@router.get("/share/{share_token}", response_model=SessionOut)
async def get_shared_session(
    share_token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """Read-only public session view by unguessable share token."""
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.share_token == share_token)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            ),
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
        )
    )
    result = await db.execute(statement)
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="Shared session not found")
    return workout


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Get a full session with exercises and performed sets."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    return workout


@router.patch("/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: int,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Update session metadata: date, title, goal, feedback, summary,
    discomfort, energy or duration."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(workout, field, value)
    await db.commit()
    return await load_session(session_id, db)


@router.post("/{session_id}/exercises/{planned_id}/sets", response_model=SessionOut)
async def log_set(
    session_id: int,
    planned_id: int,
    body: PerformedSetCreate,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Log a performed set for a planned exercise."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)

    if planned_exercise.exercise.is_bodyweight:
        weight = BODYWEIGHT_WEIGHT
    elif body.weight == BODYWEIGHT_WEIGHT:
        raise HTTPException(
            status_code=422, detail="-1 weight is reserved for bodyweight exercises"
        )
    else:
        weight = body.weight

    logged_set_count = len(planned_exercise.performed_sets or [])
    if body.set_number != logged_set_count + 1 or logged_set_count >= planned_exercise.target_sets:
        raise HTTPException(
            status_code=422, detail="Sets must be logged consecutively and cannot exceed the target"
        )

    performed_set = PerformedSet(
        planned_exercise_id=planned_id,
        set_number=body.set_number,
        weight=weight,
        reps=body.reps,
        rpe=body.rpe,
        sensation=body.sensation,
        notes=body.notes,
    )
    db.add(performed_set)

    start_session(workout)

    logged_set_count += 1
    if logged_set_count >= planned_exercise.target_sets:
        planned_exercise.status = "completed"
    elif planned_exercise.status == "pending":
        planned_exercise.status = "in_progress"

    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise set_conflict_error(error) from error
    db.expire_all()
    return await load_session(session_id, db)


@router.delete("/{session_id}/exercises/{planned_id}/sets/{set_id}", response_model=SessionOut)
async def delete_set(
    session_id: int,
    planned_id: int,
    set_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Delete a performed set (fix a wrongly logged one)."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)
    performed_set = await db.get(PerformedSet, set_id)
    if not performed_set or performed_set.planned_exercise_id != planned_id:
        raise HTTPException(status_code=404, detail="Set not found in this exercise")
    await db.delete(performed_set)
    if planned_exercise.status == "completed":
        planned_exercise.status = "in_progress"
    await db.commit()
    db.expire_all()
    return await load_session(session_id, db)


@router.post("/{session_id}/finish", response_model=SessionOut)
async def finish_session(
    session_id: int,
    body: SessionFinish,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Finish a workout session, save feedback and actual duration.

    Idempotent: already-completed sessions are returned untouched.
    """
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    if workout.status == "completed":
        return workout

    if body.duration_actual is not None:
        duration = body.duration_actual
    elif workout.started_at:
        now = datetime.now(UTC).replace(tzinfo=None)
        duration = max(1, int((now - workout.started_at).total_seconds() / 60))
    else:
        raise HTTPException(
            status_code=422,
            detail=(
                "Cannot derive duration: session has no started_at and"
                " duration_actual is missing. Log at least one set or pass"
                " duration_actual."
            ),
        )

    workout.status = "completed"
    workout.duration_actual = duration
    workout.feedback = body.feedback
    workout.energy = body.energy
    workout.discomfort = body.discomfort

    await db.commit()
    return await load_session(session_id, db)


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Delete a session (e.g. discard a plan preview the athlete rejected)."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    if workout.status != "planned" or any(
        planned.performed_sets for planned in workout.planned_exercises or []
    ):
        raise HTTPException(status_code=422, detail="Only unstarted plan previews can be deleted")
    for planned_exercise in workout.planned_exercises or []:
        await db.delete(planned_exercise)
    await db.delete(workout)
    await db.commit()
    return {"deleted": session_id}


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = Query(10, ge=1, le=50),
    on_date: date | None = None,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """List last N sessions with summary info, optionally for one date (e.g. today)."""
    statement = select(WorkoutSession).options(
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets)
    )
    if on_date:
        statement = statement.where(WorkoutSession.session_date == on_date)
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = statement.order_by(
        WorkoutSession.session_date.desc(), WorkoutSession.id.desc()
    ).limit(limit)
    result = await db.execute(statement)
    workouts = result.scalars().all()
    return [
        SessionSummary(
            id=workout.id,
            session_date=workout.session_date,
            title=workout.title,
            status=workout.status,
            energy=workout.energy,
            duration_actual=workout.duration_actual,
            exercise_count=len(workout.planned_exercises or []),
            total_sets=sum(
                len(planned_exercise.performed_sets or [])
                for planned_exercise in (workout.planned_exercises or [])
            ),
        )
        for workout in workouts
    ]
