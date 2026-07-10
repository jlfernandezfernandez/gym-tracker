from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from database import get_session as get_db_session
from telegram_auth import current_user_id
from models import BODYWEIGHT_WEIGHT, Exercise, WorkoutSession, PlannedExercise, PerformedSet
from schemas import (
    SessionOut,
    SessionSummary,
    PerformedSetCreate,
    PlannedExerciseUpdate,
    SessionFinish,
    SessionUpdate,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


async def _load_session(session_id: int, db: AsyncSession) -> WorkoutSession:
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            ),
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.exercise
            ),
        )
    )
    result = await db.execute(statement)
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="Session not found")
    return workout


def _check_owner(workout: WorkoutSession, user_id: int | None):
    """Verify the session belongs to the authenticated user. Skip in dev mode."""
    if user_id and workout.telegram_user_id and workout.telegram_user_id != user_id:
        raise HTTPException(status_code=403, detail="This session belongs to another user")


def _start_session(workout: WorkoutSession) -> None:
    """Transition once; every path that starts work shares the same timestamp."""
    if workout.status == "planned":
        workout.status = "in_progress"
    if workout.status == "in_progress" and not workout.started_at:
        workout.started_at = datetime.now(timezone.utc).replace(tzinfo=None)


def _ensure_replaceable(planned_exercise: PlannedExercise) -> None:
    """A set belongs permanently to the exercise it was performed for."""
    if planned_exercise.performed_sets:
        raise HTTPException(status_code=422, detail="Cannot replace an exercise after logging sets")


def _current_state(workout: WorkoutSession) -> dict:
    """Derive active exercise/set from persisted exercise statuses and logged sets."""
    planned = sorted(workout.planned_exercises or [], key=lambda planned_exercise: planned_exercise.order)
    if workout.status in {"completed", "cancelled"}:
        return {
            "session_id": workout.id, "session_status": workout.status,
            "current_planned_exercise_id": None, "current_set_number": None,
            "exercise_order": None, "exercise_count": len(planned),
            "completed_exercises": sum(1 for item in planned if item.status in {"completed", "skipped"}),
            "completed_sets": sum(len(item.performed_sets or []) for item in planned),
            "total_sets": sum(item.target_sets for item in planned), "is_complete": True,
        }
    current = None
    for planned_exercise in planned:
        if planned_exercise.status in {"pending", "in_progress"}:
            current = planned_exercise
            break
    if current is None and planned:
        current = planned[-1]

    completed_exercises = sum(1 for planned_exercise in planned if planned_exercise.status in {"completed", "skipped"})
    total_sets = sum(planned_exercise.target_sets for planned_exercise in planned)
    completed_sets = sum(len(planned_exercise.performed_sets or []) for planned_exercise in planned)

    if current is None:
        return {
            "session_id": workout.id,
            "session_status": workout.status,
            "current_planned_exercise_id": None,
            "current_set_number": None,
            "exercise_order": None,
            "exercise_count": 0,
            "completed_exercises": completed_exercises,
            "completed_sets": completed_sets,
            "total_sets": total_sets,
            "is_complete": True,
        }

    current_set_count = len(current.performed_sets or [])
    next_set_number = min(current_set_count + 1, current.target_sets)
    return {
        "session_id": workout.id,
        "session_status": workout.status,
        "current_planned_exercise_id": current.id,
        "current_exercise_id": current.exercise_id,
        "current_exercise_name": current.exercise.name if current.exercise else "",
        "current_set_number": next_set_number,
        "target_sets": current.target_sets,
        "target_reps": current.target_reps,
        "suggested_weight": current.suggested_weight,
        "weight_mode": current.weight_mode,
        "exercise_order": current.order,
        "exercise_count": len(planned),
        "completed_exercises": completed_exercises,
        "completed_sets": completed_sets,
        "total_sets": total_sets,
        "is_complete": bool(planned) and completed_exercises == len(planned),
    }


@router.get("/active")
async def get_active_session(
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Get latest non-completed session with derived current exercise state."""
    statement = select(WorkoutSession).where(WorkoutSession.status.in_(("planned", "in_progress")))
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = statement.order_by(case((WorkoutSession.status == "in_progress", 0), else_=1), WorkoutSession.session_date.desc(), WorkoutSession.id.desc()).limit(1).options(
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
    )
    result = await db.execute(statement)
    workout = result.scalar_one_or_none()
    if not workout:
        raise HTTPException(status_code=404, detail="No active session found")
    # Serialize explicitly: without a response_model FastAPI drops ORM relationships.
    return {"session": SessionOut.model_validate(workout, from_attributes=True), "current": _current_state(workout)}


@router.get("/{session_id}/current")
async def get_current_exercise(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Get derived current exercise/set for the agent and Mini App."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    return _current_state(workout)


@router.post("/{session_id}/exercises/{planned_id}/complete", response_model=SessionOut)
async def complete_planned_exercise(
    session_id: int,
    planned_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Mark one planned exercise completed and keep session active."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    planned_exercise = next(
        (planned for planned in workout.planned_exercises or [] if planned.id == planned_id),
        None,
    )
    if not planned_exercise:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

    planned_exercise.status = "completed"
    _start_session(workout)
    await db.commit()
    return await _load_session(session_id, db)


@router.put("/{session_id}/exercises/{planned_id}", response_model=SessionOut)
async def update_planned_exercise(
    session_id: int,
    planned_id: int,
    body: PlannedExerciseUpdate,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Update a planned exercise: change status, swap the exercise, or set notes."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    # Reuse the eager-loaded relation from _load_session.
    planned_exercise = next(
        (planned for planned in workout.planned_exercises or [] if planned.id == planned_id),
        None,
    )
    if not planned_exercise:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

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
    if planned_exercise.target_sets > 0 and len(planned_exercise.performed_sets or []) >= planned_exercise.target_sets:
        planned_exercise.status = "completed"

    if planned_exercise.status in {"in_progress", "completed", "skipped"}:
        _start_session(workout)
    await db.commit()
    db.expire_all()
    return await _load_session(session_id, db)


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
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
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
    user_id: Optional[int] = Depends(current_user_id),
):
    """Get a full session with exercises and performed sets."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    return workout


@router.patch("/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: int,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Update session metadata: move it to another date or rename it."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    if body.session_date is not None:
        workout.session_date = body.session_date
    if body.title is not None:
        workout.title = body.title
    await db.commit()
    return await _load_session(session_id, db)


@router.post("/{session_id}/exercises/{planned_id}/sets", response_model=SessionOut)
async def log_set(
    session_id: int,
    planned_id: int,
    body: PerformedSetCreate,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Log a performed set for a planned exercise."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    planned_exercise = next(
        (planned for planned in workout.planned_exercises or [] if planned.id == planned_id),
        None,
    )
    if not planned_exercise:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

    if planned_exercise.exercise.is_bodyweight:
        weight = BODYWEIGHT_WEIGHT
    elif body.weight == BODYWEIGHT_WEIGHT:
        raise HTTPException(status_code=422, detail="-1 weight is reserved for bodyweight exercises")
    else:
        weight = body.weight

    logged_set_count = len(planned_exercise.performed_sets or [])
    if body.set_number != logged_set_count + 1 or logged_set_count >= planned_exercise.target_sets:
        raise HTTPException(status_code=422, detail="Sets must be logged consecutively and cannot exceed the target")

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

    _start_session(workout)

    logged_set_count += 1
    if logged_set_count >= planned_exercise.target_sets:
        planned_exercise.status = "completed"
    elif planned_exercise.status == "pending":
        planned_exercise.status = "in_progress"

    await db.commit()
    db.expire_all()
    return await _load_session(session_id, db)


@router.delete("/{session_id}/exercises/{planned_id}/sets/{set_id}", response_model=SessionOut)
async def delete_set(
    session_id: int,
    planned_id: int,
    set_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Delete a performed set (fix a wrongly logged one)."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    planned_exercise = next(
        (planned for planned in workout.planned_exercises or [] if planned.id == planned_id),
        None,
    )
    if not planned_exercise:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")
    performed_set = await db.get(PerformedSet, set_id)
    if not performed_set or performed_set.planned_exercise_id != planned_id:
        raise HTTPException(status_code=404, detail="Set not found in this exercise")
    await db.delete(performed_set)
    if planned_exercise.status == "completed":
        planned_exercise.status = "in_progress"
    await db.commit()
    db.expire_all()
    return await _load_session(session_id, db)


@router.post("/{session_id}/finish", response_model=SessionOut)
async def finish_session(
    session_id: int,
    body: SessionFinish,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Finish a workout session, save feedback and actual duration.

    Idempotent: already-completed sessions are returned untouched.
    """
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    if workout.status == "completed":
        return workout

    if body.duration_actual is not None:
        duration = body.duration_actual
    elif workout.started_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        duration = max(1, int((now - workout.started_at).total_seconds() / 60))
    else:
        raise HTTPException(
            status_code=422,
            detail="Cannot derive duration: session has no started_at and duration_actual is missing. Log at least one set or pass duration_actual.",
        )

    workout.status = "completed"
    workout.duration_actual = duration
    workout.feedback = body.feedback
    workout.energy = body.energy
    workout.discomfort = body.discomfort

    await db.commit()
    return await _load_session(session_id, db)


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Delete a session (e.g. discard a plan preview the athlete rejected)."""
    workout = await _load_session(session_id, db)
    _check_owner(workout, user_id)
    if workout.status != "planned" or any(planned.performed_sets for planned in workout.planned_exercises or []):
        raise HTTPException(status_code=422, detail="Only unstarted plan previews can be deleted")
    for planned_exercise in workout.planned_exercises or []:
        await db.delete(planned_exercise)
    await db.delete(workout)
    await db.commit()
    return {"deleted": session_id}


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = Query(10, ge=1, le=50),
    on_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """List last N sessions with summary info, optionally for one date (e.g. today)."""
    statement = (
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            )
        )
    )
    if on_date:
        statement = statement.where(WorkoutSession.session_date == on_date)
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = statement.order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc()).limit(limit)
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
