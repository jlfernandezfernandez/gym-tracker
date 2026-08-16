from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.core.webhooks import enqueue_event
from app.features.disliked.routes import disliked_exercise_ids
from app.features.profile.routes import _get_or_create_profile
from app.features.sessions.schemas import (
    AddExerciseRequest,
    ExerciseReclassify,
    PerformedSetCreate,
    PerformedSetRestore,
    PlannedExerciseUpdate,
    SessionExerciseReorder,
    SessionFinish,
    SessionOut,
    SessionSummary,
    SessionUpdate,
)
from app.features.sessions.service import (
    auto_finish_if_done,
    check_session_owner,
    current_state,
    exercise_has_all_target_sets,
    find_planned_exercise,
    load_session,
    next_missing_set_number,
    performed_set_numbers,
    reopen_session_for_correction,
    set_conflict_error,
    start_session,
    sync_exercise_status_from_sets,
    validate_exercise_metrics,
)
from app.models import (
    Exercise,
    PerformedSet,
    PlannedExercise,
    WorkoutSession,
)

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
    auto_finish_if_done(workout)
    await db.commit()
    return await load_session(session_id, db)


@router.put("/{session_id}/exercises/reorder", response_model=SessionOut)
async def reorder_session_exercises(
    session_id: int,
    body: SessionExerciseReorder,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Apply an explicit, gap-free order to every exercise in a session."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    exercises = list(workout.planned_exercises or [])
    by_id = {exercise.id: exercise for exercise in exercises}
    requested = body.planned_exercise_ids
    if len(requested) != len(exercises) or set(requested) != set(by_id):
        raise HTTPException(
            status_code=422,
            detail="Order must contain every exercise exactly once",
        )
    # Move to a temporary range first to avoid the unique(session_id, order) constraint.
    temporary_offset = (
        max((exercise.order for exercise in exercises), default=-1) + len(exercises) + 1
    )
    for index, planned in enumerate(exercises):
        planned.order = temporary_offset + index
    await db.flush()
    for index, planned_id in enumerate(requested):
        by_id[planned_id].order = index
    await db.commit()
    db.expire_all()
    return await load_session(session_id, db)


@router.post("/{session_id}/exercises/{planned_id}/reclassify", response_model=SessionOut)
async def reclassify_exercise(
    session_id: int,
    planned_id: int,
    body: ExerciseReclassify,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Change the catalog identity while preserving every performed set."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned = find_planned_exercise(workout, planned_id)
    new_exercise = await db.get(Exercise, body.new_exercise_id)
    if not new_exercise:
        raise HTTPException(status_code=404, detail="Exercise not found in catalog")
    # The historical sets keep their values.  Changing their catalog identity is
    # only valid when every existing load has the new exercise's weight semantics.
    for performed_set in planned.performed_sets or []:
        validate_exercise_metrics(
            new_exercise,
            reps=performed_set.reps,
            duration_minutes=performed_set.duration_minutes,
            weight=performed_set.weight,
        )
    validate_exercise_metrics(
        new_exercise,
        reps=planned.target_reps,
        duration_minutes=planned.target_duration_minutes,
        weight=planned.suggested_weight,
        unilateral=planned.unilateral,
        require_cardio_duration=False,
    )
    for target in planned.set_targets or []:
        validate_exercise_metrics(
            new_exercise,
            reps=target.get("reps"),
            duration_minutes=target.get("duration_minutes"),
            weight=target.get("weight"),
        )
    planned.exercise_id = new_exercise.id
    planned.exercise = new_exercise
    if body.reason:
        planned.notes = f"{planned.notes}\nCorrección: {body.reason}".strip()
    await db.commit()
    db.expire_all()
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
        replacement = await db.get(Exercise, body.new_exercise_id)
        if not replacement:
            raise HTTPException(status_code=404, detail="Exercise not found in catalog")
        if replacement.is_cardio:
            effective_reps = None
            effective_weight = None
            effective_duration = (
                body.target_duration_minutes
                if body.target_duration_minutes is not None
                else planned_exercise.target_duration_minutes
            )
        else:
            effective_reps = (
                body.target_reps if body.target_reps is not None else planned_exercise.target_reps
            )
            effective_weight = (
                body.suggested_weight
                if body.suggested_weight is not None
                else planned_exercise.suggested_weight
            )
            effective_duration = None
        validate_exercise_metrics(
            replacement,
            reps=effective_reps,
            duration_minutes=effective_duration,
            weight=effective_weight,
            unilateral=planned_exercise.unilateral,
            require_cardio_duration=False,
        )
        for target in planned_exercise.set_targets or []:
            validate_exercise_metrics(
                replacement,
                reps=target.get("reps"),
                duration_minutes=target.get("duration_minutes"),
                weight=target.get("weight"),
            )
        planned_exercise.exercise_id = replacement.id
        planned_exercise.exercise = replacement
        planned_exercise.target_reps = effective_reps
        planned_exercise.target_duration_minutes = effective_duration
        planned_exercise.suggested_weight = effective_weight
    if body.target_sets is not None:
        highest_logged_set = max(performed_set_numbers(planned_exercise), default=0)
        if body.target_sets < highest_logged_set:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Cannot reduce target_sets below "
                    f"{highest_logged_set} (highest logged set number)"
                ),
            )
        planned_exercise.target_sets = body.target_sets
    if body.notes is not None:
        planned_exercise.notes = body.notes
    if body.unilateral is not None:
        if planned_exercise.exercise.is_cardio and body.unilateral:
            raise HTTPException(
                status_code=422, detail="Cardio does not accept unilateral execution"
            )
        planned_exercise.unilateral = body.unilateral
    if body.set_targets is not None:
        set_targets_data = [t.model_dump() for t in body.set_targets]
        for target in set_targets_data:
            validate_exercise_metrics(
                planned_exercise.exercise,
                reps=target.get("reps"),
                duration_minutes=target.get("duration_minutes"),
                weight=target.get("weight"),
            )
        planned_exercise.set_targets = set_targets_data
    # Trim set_targets when target_sets is lowered (avoid orphan targets)
    if planned_exercise.set_targets and planned_exercise.target_sets:
        planned_exercise.set_targets = [
            t
            for t in planned_exercise.set_targets
            if t.get("set_number", 0) <= planned_exercise.target_sets
        ]

    # Completion is derived from the required numbered set set, not its row count.
    if exercise_has_all_target_sets(planned_exercise):
        planned_exercise.status = "completed"
    elif body.status is None and body.target_sets is not None:
        sync_exercise_status_from_sets(planned_exercise)

    if planned_exercise.status in {"in_progress", "completed", "skipped"}:
        start_session(workout)
    auto_finish_if_done(workout)
    await db.commit()
    db.expire_all()
    return await load_session(session_id, db)


@router.post("/{session_id}/exercises", response_model=SessionOut)
async def add_planned_exercise(
    session_id: int,
    body: AddExerciseRequest,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Add a catalog exercise to an existing planned or in-progress session."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    if workout.status not in ("planned", "in_progress"):
        raise HTTPException(
            status_code=422,
            detail="Can only add exercises to planned or in-progress sessions",
        )

    exercise = await db.get(Exercise, body.exercise_id)
    if not exercise:
        raise HTTPException(status_code=422, detail=f"Exercise {body.exercise_id} not found")

    profile = await _get_or_create_profile(db, user_id)
    if await disliked_exercise_ids(db, profile.id, [body.exercise_id]):
        raise HTTPException(
            status_code=422,
            detail=f"Exercise {body.exercise_id} is disliked by the athlete. Pick an alternative.",
        )

    existing = workout.planned_exercises or []
    if body.order is None:
        order = max((pe.order for pe in existing), default=-1) + 1
    else:
        order = body.order
        for pe in existing:
            if pe.order >= order:
                pe.order += 1

    validate_exercise_metrics(
        exercise,
        reps=body.target_reps,
        duration_minutes=body.target_duration_minutes,
        weight=body.suggested_weight,
        unilateral=body.unilateral,
        require_cardio_duration=False,
    )

    set_targets_data = None
    if body.set_targets:
        set_targets_data = [target.model_dump() for target in body.set_targets]
        for target in set_targets_data:
            validate_exercise_metrics(
                exercise,
                reps=target.get("reps"),
                duration_minutes=target.get("duration_minutes"),
                weight=target.get("weight"),
            )

    db.add(
        PlannedExercise(
            session_id=workout.id,
            exercise_id=body.exercise_id,
            order=order,
            target_sets=body.target_sets,
            target_reps=body.target_reps,
            target_duration_minutes=body.target_duration_minutes,
            suggested_weight=body.suggested_weight,
            unilateral=body.unilateral,
            notes=body.notes,
            set_targets=set_targets_data,
        )
    )
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
    previous_discomfort = workout.discomfort
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(workout, field, value)
    if body.discomfort and body.discomfort != previous_discomfort:
        await enqueue_event(
            db,
            event_type="gym.discomfort.reported",
            subject=f"sessions/{session_id}",
            data={
                "session_id": session_id,
                "telegram_user_id": workout.telegram_user_id,
                "discomfort": body.discomfort,
                "source": "session_update",
            },
        )
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

    validate_exercise_metrics(
        planned_exercise.exercise,
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        weight=body.weight,
    )

    reopen_session_for_correction(workout)
    next_set_number = next_missing_set_number(planned_exercise)
    if next_set_number is None or body.set_number != next_set_number:
        raise HTTPException(
            status_code=422,
            detail="Log the earliest missing target set number and do not exceed the target",
        )

    performed_set = PerformedSet(
        planned_exercise_id=planned_id,
        set_number=body.set_number,
        weight=body.weight,
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        rpe=body.rpe,
        sensation=body.sensation,
        notes=body.notes,
    )
    db.add(performed_set)

    start_session(workout)

    logged_after = performed_set_numbers(planned_exercise) | {body.set_number}
    if logged_after == set(range(1, planned_exercise.target_sets + 1)):
        planned_exercise.status = "completed"
    elif planned_exercise.status != "skipped":
        planned_exercise.status = "in_progress"

    auto_finish_if_done(workout)

    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise set_conflict_error(error) from error
    db.expire_all()
    return await load_session(session_id, db)


@router.delete("/{session_id}/exercises/{planned_id}", response_model=SessionOut)
async def delete_planned_exercise(
    session_id: int,
    planned_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Delete a planned exercise that has no performed sets."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)
    if planned_exercise.performed_sets:
        raise HTTPException(status_code=422, detail="Cannot delete an exercise with logged sets")
    await db.delete(planned_exercise)
    await db.commit()
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
    # The in-memory relation is eagerly loaded; keep it coherent before deriving
    # status, then expire/reload after commit for the response.
    planned_exercise.performed_sets.remove(performed_set)
    reopen_session_for_correction(workout)
    sync_exercise_status_from_sets(planned_exercise)
    await db.commit()
    db.expire_all()
    return await load_session(session_id, db)


@router.post("/{session_id}/exercises/{planned_id}/sets/restore", response_model=SessionOut)
async def restore_set(
    session_id: int,
    planned_id: int,
    body: PerformedSetRestore,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Restore a deleted set at its original number; middle-set undo is supported."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned = find_planned_exercise(workout, planned_id)
    existing_numbers = performed_set_numbers(planned)
    if body.set_number in existing_numbers:
        raise HTTPException(status_code=409, detail="That set number already exists")
    if body.set_number > planned.target_sets:
        raise HTTPException(status_code=422, detail="Cannot restore a set beyond the target")
    validate_exercise_metrics(
        planned.exercise,
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        weight=body.weight,
    )
    reopened = workout.status == "completed"
    reopen_session_for_correction(workout)
    restored = PerformedSet(
        planned_exercise_id=planned_id,
        set_number=body.set_number,
        weight=body.weight,
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        rpe=body.rpe,
        sensation=body.sensation,
        notes=body.notes,
    )
    db.add(restored)
    restored_numbers = existing_numbers | {body.set_number}
    if restored_numbers == set(range(1, planned.target_sets + 1)):
        planned.status = "completed"
    else:
        planned.status = "in_progress"
    if reopened:
        start_session(workout)
    auto_finish_if_done(workout)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise set_conflict_error(error) from error
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
    previous_discomfort = workout.discomfort
    workout.discomfort = body.discomfort

    if body.discomfort and body.discomfort != previous_discomfort:
        await enqueue_event(
            db,
            event_type="gym.discomfort.reported",
            subject=f"sessions/{session_id}",
            data={
                "session_id": session_id,
                "telegram_user_id": workout.telegram_user_id,
                "discomfort": body.discomfort,
                "source": "session_finished",
            },
        )
    await enqueue_event(
        db,
        event_type="gym.session.finished",
        subject=f"sessions/{session_id}",
        data={
            "session_id": session_id,
            "telegram_user_id": workout.telegram_user_id,
            "title": workout.title,
            "session_date": workout.session_date.isoformat(),
            "duration_actual": duration,
            "energy": body.energy,
            "discomfort": body.discomfort,
            "feedback": body.feedback,
        },
    )
    await db.commit()
    return await load_session(session_id, db)


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Delete a planned session or an in-progress session with no logged sets."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    if workout.status not in ("planned", "in_progress") or any(
        planned.performed_sets for planned in workout.planned_exercises or []
    ):
        raise HTTPException(
            status_code=422,
            detail="Only planned sessions or empty in-progress sessions can be deleted",
        )
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
