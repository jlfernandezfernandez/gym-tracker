from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, select
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
    PerformedSetUpdate,
    PlannedExerciseUpdate,
    SessionActivitySummary,
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
    repeat_session_prescriptions,
    resolve_planned_execution_metric,
    set_conflict_error,
    start_session,
    sync_exercise_status_from_sets,
    validate_exercise_metrics,
)
from app.models import (
    Exercise,
    PerformedSet,
    PlannedExercise,
    SetLogReceipt,
    WorkoutSession,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _ensure_replaceable(planned_exercise: PlannedExercise) -> None:
    """A set belongs permanently to the exercise it was performed for."""
    if planned_exercise.performed_sets:
        raise HTTPException(status_code=422, detail="Cannot replace an exercise after logging sets")


def _default_execution_metric(exercise: Exercise) -> str:
    return "duration_minutes" if exercise.is_cardio else "reps"


def _normalize_set_targets(
    existing_targets: list[dict] | None,
    *,
    target_sets: int,
    execution_metric: str,
    target_reps: int | None,
    target_duration_minutes: int | None,
    target_duration_seconds: int | None,
) -> list[dict] | None:
    if not existing_targets:
        return None
    by_number = {
        int(target.get("set_number")): dict(target)
        for target in existing_targets
        if int(target.get("set_number", 0)) >= 1
    }
    normalized: list[dict] = []
    for set_number in range(1, target_sets + 1):
        target = by_number.get(set_number)
        if target is None:
            continue
        normalized_target = {
            **target,
            "set_number": set_number,
            "reps": None,
            "duration_minutes": None,
            "duration_seconds": None,
        }
        if execution_metric == "reps":
            normalized_target["reps"] = target.get("reps")
            if normalized_target["reps"] is None:
                normalized_target["reps"] = target_reps
        elif execution_metric == "duration_minutes":
            normalized_target["duration_minutes"] = target.get("duration_minutes")
            if normalized_target["duration_minutes"] is None:
                normalized_target["duration_minutes"] = target_duration_minutes
        else:
            normalized_target["duration_seconds"] = target.get("duration_seconds")
            if normalized_target["duration_seconds"] is None:
                normalized_target["duration_seconds"] = target_duration_seconds
        normalized.append(normalized_target)
    return normalized or None


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
            execution_metric=resolve_planned_execution_metric(planned),
            reps=performed_set.reps,
            duration_minutes=performed_set.duration_minutes,
            duration_seconds=performed_set.duration_seconds,
            weight=performed_set.weight,
        )
    validate_exercise_metrics(
        new_exercise,
        execution_metric=resolve_planned_execution_metric(planned),
        reps=planned.target_reps,
        duration_minutes=planned.target_duration_minutes,
        duration_seconds=planned.target_duration_seconds,
        weight=planned.suggested_weight,
        unilateral=planned.unilateral,
        require_cardio_duration=False,
    )
    for target in planned.set_targets or []:
        validate_exercise_metrics(
            new_exercise,
            execution_metric=resolve_planned_execution_metric(planned),
            reps=target.get("reps"),
            duration_minutes=target.get("duration_minutes"),
            duration_seconds=target.get("duration_seconds"),
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
    selected_exercise = planned_exercise.exercise
    next_status = body.status if body.status is not None else planned_exercise.status
    next_notes = body.notes if body.notes is not None else planned_exercise.notes
    next_superset_group = (
        body.superset_group if body.superset_group is not None else planned_exercise.superset_group
    )
    next_target_sets = (
        body.target_sets if body.target_sets is not None else planned_exercise.target_sets
    )
    next_unilateral = (
        body.unilateral if body.unilateral is not None else planned_exercise.unilateral
    )
    next_exercise_id = planned_exercise.exercise_id

    if body.new_exercise_id is not None:
        _ensure_replaceable(planned_exercise)
        replacement = await db.get(Exercise, body.new_exercise_id)
        if not replacement:
            raise HTTPException(status_code=404, detail="Exercise not found in catalog")
        selected_exercise = replacement
        next_exercise_id = replacement.id

    effective_execution_metric = (
        body.execution_metric
        if body.execution_metric is not None
        else resolve_planned_execution_metric(planned_exercise)
    )
    if body.new_exercise_id is not None and body.execution_metric is None:
        if selected_exercise.is_cardio:
            effective_execution_metric = "duration_minutes"
        elif body.target_duration_seconds is not None:
            effective_execution_metric = "duration_seconds"
        elif body.target_reps is not None or planned_exercise.exercise.is_cardio:
            effective_execution_metric = "reps"

    if (
        planned_exercise.performed_sets
        and effective_execution_metric != resolve_planned_execution_metric(planned_exercise)
    ):
        raise HTTPException(
            status_code=422,
            detail="Cannot change execution_metric with logged sets",
        )

    if effective_execution_metric == "duration_minutes":
        effective_reps = None
        effective_duration_minutes = (
            body.target_duration_minutes
            if body.target_duration_minutes is not None
            else planned_exercise.target_duration_minutes
        )
        effective_duration_seconds = None
        effective_weight = None
    elif effective_execution_metric == "duration_seconds":
        effective_reps = None
        effective_duration_minutes = None
        effective_duration_seconds = (
            body.target_duration_seconds
            if body.target_duration_seconds is not None
            else planned_exercise.target_duration_seconds
        )
        effective_weight = (
            body.suggested_weight
            if "suggested_weight" in body.model_fields_set
            else planned_exercise.suggested_weight
        )
    else:
        effective_reps = (
            body.target_reps if body.target_reps is not None else planned_exercise.target_reps
        )
        effective_duration_minutes = None
        effective_duration_seconds = None
        effective_weight = (
            body.suggested_weight
            if "suggested_weight" in body.model_fields_set
            else planned_exercise.suggested_weight
        )

    if body.target_sets is not None:
        highest_logged_set = max(performed_set_numbers(planned_exercise), default=0)
        if next_target_sets < highest_logged_set:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Cannot reduce target_sets below "
                    f"{highest_logged_set} (highest logged set number)"
                ),
            )
    if selected_exercise.is_cardio and next_unilateral:
        raise HTTPException(status_code=422, detail="Cardio does not accept unilateral execution")

    validate_exercise_metrics(
        selected_exercise,
        execution_metric=effective_execution_metric,
        reps=effective_reps,
        duration_minutes=effective_duration_minutes,
        duration_seconds=effective_duration_seconds,
        weight=effective_weight,
        unilateral=next_unilateral,
        require_cardio_duration=False,
    )

    existing_set_targets = (
        [dict(target) for target in planned_exercise.set_targets or []]
        if planned_exercise.set_targets
        else None
    )
    if body.set_targets is not None:
        next_set_targets = [t.model_dump() for t in body.set_targets]
    elif body.new_exercise_id is not None:
        next_set_targets = None
    else:
        next_set_targets = _normalize_set_targets(
            existing_set_targets,
            target_sets=next_target_sets,
            execution_metric=effective_execution_metric,
            target_reps=effective_reps,
            target_duration_minutes=effective_duration_minutes,
            target_duration_seconds=effective_duration_seconds,
        )
    if next_set_targets is not None:
        next_set_targets = [
            target for target in next_set_targets if target.get("set_number", 0) <= next_target_sets
        ]
        for target in next_set_targets:
            validate_exercise_metrics(
                selected_exercise,
                execution_metric=effective_execution_metric,
                reps=target.get("reps"),
                duration_minutes=target.get("duration_minutes"),
                duration_seconds=target.get("duration_seconds"),
                weight=target.get("weight"),
            )

    planned_exercise.status = next_status
    planned_exercise.exercise_id = next_exercise_id
    planned_exercise.exercise = selected_exercise
    planned_exercise.superset_group = next_superset_group
    planned_exercise.target_sets = next_target_sets
    planned_exercise.notes = next_notes
    planned_exercise.unilateral = next_unilateral
    planned_exercise.set_targets = next_set_targets
    planned_exercise.execution_metric = effective_execution_metric
    planned_exercise.target_reps = effective_reps
    planned_exercise.target_duration_minutes = effective_duration_minutes
    planned_exercise.target_duration_seconds = effective_duration_seconds
    planned_exercise.suggested_weight = effective_weight

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
        raise HTTPException(status_code=404, detail=f"Exercise {body.exercise_id} not found")

    execution_metric = body.execution_metric or _default_execution_metric(exercise)

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
        execution_metric=execution_metric,
        reps=body.target_reps,
        duration_minutes=body.target_duration_minutes,
        duration_seconds=body.target_duration_seconds,
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
                execution_metric=execution_metric,
                reps=target.get("reps"),
                duration_minutes=target.get("duration_minutes"),
                duration_seconds=target.get("duration_seconds"),
                weight=target.get("weight"),
            )

    db.add(
        PlannedExercise(
            session_id=workout.id,
            exercise_id=body.exercise_id,
            order=order,
            target_sets=body.target_sets,
            execution_metric=execution_metric,
            target_reps=body.target_reps,
            target_duration_minutes=body.target_duration_minutes,
            target_duration_seconds=body.target_duration_seconds,
            suggested_weight=body.suggested_weight,
            unilateral=body.unilateral,
            superset_group=body.superset_group,
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


@router.get("/activity", response_model=list[SessionActivitySummary])
async def list_session_activity(
    days: int = Query(365, ge=1, le=366),
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Return date-level completed workout summaries for the yearly heatmap."""
    since = date.today() - timedelta(days=days - 1)
    reps_column = cast(Any, PerformedSet.reps)
    volume_expr = func.coalesce(
        func.sum(
            case(
                (
                    and_(PerformedSet.is_warmup.is_(False), reps_column.is_not(None)),
                    func.coalesce(PerformedSet.weight, 0) * PerformedSet.reps,
                ),
                else_=0,
            )
        ),
        0,
    )
    session_totals = (
        select(
            WorkoutSession.id.label("id"),
            WorkoutSession.session_date.label("session_date"),
            WorkoutSession.duration_actual.label("duration_actual"),
            volume_expr.label("total_volume"),
        )
        .select_from(WorkoutSession)
        .outerjoin(PlannedExercise, PlannedExercise.session_id == WorkoutSession.id)
        .outerjoin(PerformedSet, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .where(WorkoutSession.status == "completed")
        .where(WorkoutSession.session_date >= since)
        .group_by(
            WorkoutSession.id,
            WorkoutSession.session_date,
            WorkoutSession.duration_actual,
        )
    )
    if user_id is not None:
        session_totals = session_totals.where(WorkoutSession.telegram_user_id == user_id)
    session_totals_subquery = session_totals.subquery()

    statement = (
        select(
            func.max(session_totals_subquery.c.id).label("id"),
            session_totals_subquery.c.session_date.label("session_date"),
            func.count(session_totals_subquery.c.id).label("workout_count"),
            func.coalesce(func.sum(session_totals_subquery.c.duration_actual), 0).label(
                "duration_actual"
            ),
            func.coalesce(func.sum(session_totals_subquery.c.total_volume), 0).label(
                "total_volume"
            ),
        )
        .select_from(session_totals_subquery)
        .group_by(session_totals_subquery.c.session_date)
        .order_by(session_totals_subquery.c.session_date.desc())
    )
    result = await db.execute(statement)
    rows = result.all()
    return [
        SessionActivitySummary(
            id=row.id,
            session_date=row.session_date,
            workout_count=row.workout_count,
            duration_actual=int(row.duration_actual or 0),
            total_volume=float(row.total_volume or 0),
        )
        for row in rows
    ]


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


@router.post("/{session_id}/repeat", response_model=SessionOut)
async def repeat_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Create today's planned copy of a completed historical session."""
    source = await load_session(session_id, db)
    check_session_owner(source, user_id)
    if source.status != "completed":
        raise HTTPException(status_code=422, detail="Only completed sessions can be repeated")

    repeated = repeat_session_prescriptions(source)
    db.add(repeated)
    await db.flush()
    for planned in repeated.planned_exercises:
        planned.session_id = repeated.id
        db.add(planned)
    await db.commit()
    return await load_session(repeated.id, db)


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
    # Serialize set writes before loading relationships, including simultaneous replays.
    await db.execute(
        select(WorkoutSession).where(WorkoutSession.id == session_id).with_for_update()
    )
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)

    payload = body.model_dump(mode="json", exclude={"request_id"})
    if body.request_id:
        receipt = await db.get(SetLogReceipt, str(body.request_id))
        if receipt:
            receipt_payload = {"duration_seconds": None, **receipt.payload}
            original = next(
                (
                    item
                    for item in planned_exercise.performed_sets
                    if item.id == receipt.performed_set_id
                ),
                None,
            )
            if (
                receipt.session_id != session_id
                or receipt.planned_exercise_id != planned_id
                or receipt.exercise_id != planned_exercise.exercise_id
                or receipt_payload != payload
                or original is None
                or any(getattr(original, key) != value for key, value in payload.items())
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Original set was changed or deleted; pending input retained",
                )
            return workout

    validate_exercise_metrics(
        planned_exercise.exercise,
        execution_metric=resolve_planned_execution_metric(planned_exercise),
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        duration_seconds=body.duration_seconds,
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
        duration_seconds=body.duration_seconds,
        is_warmup=body.is_warmup,
        rpe=body.rpe,
        rir=body.rir,
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
        if body.request_id:
            await db.flush()
            db.add(
                SetLogReceipt(
                    request_id=str(body.request_id),
                    session_id=session_id,
                    planned_exercise_id=planned_id,
                    exercise_id=planned_exercise.exercise_id,
                    performed_set_id=performed_set.id,
                    payload=payload,
                )
            )
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


@router.patch("/{session_id}/exercises/{planned_id}/sets/{set_id}", response_model=SessionOut)
async def update_set(
    session_id: int,
    planned_id: int,
    set_id: int,
    body: PerformedSetUpdate,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Correct one existing set in place without recreating historical data."""
    workout = await load_session(session_id, db)
    check_session_owner(workout, user_id)
    planned_exercise = find_planned_exercise(workout, planned_id)
    performed_set = await db.get(PerformedSet, set_id)
    if not performed_set or performed_set.planned_exercise_id != planned_id:
        raise HTTPException(status_code=404, detail="Set not found in this exercise")

    execution_metric = resolve_planned_execution_metric(planned_exercise)
    field_names = body.model_fields_set
    if execution_metric == "duration_minutes" and (
        "reps" in field_names or "duration_seconds" in field_names
    ):
        raise HTTPException(status_code=422, detail="Cardio requires duration_minutes")
    if execution_metric == "duration_seconds" and (
        "reps" in field_names or "duration_minutes" in field_names
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Timed strength requires duration_seconds and does not accept reps "
                "or duration_minutes"
            ),
        )
    if execution_metric == "reps" and (
        "duration_minutes" in field_names or "duration_seconds" in field_names
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Strength requires reps and does not accept duration_minutes or duration_seconds"
            ),
        )

    effective_reps = (
        body.reps
        if execution_metric == "reps" and "reps" in field_names
        else performed_set.reps
        if execution_metric == "reps"
        else None
    )
    effective_duration_minutes = (
        body.duration_minutes
        if execution_metric == "duration_minutes" and "duration_minutes" in field_names
        else performed_set.duration_minutes
        if execution_metric == "duration_minutes"
        else None
    )
    effective_duration_seconds = (
        body.duration_seconds
        if execution_metric == "duration_seconds" and "duration_seconds" in field_names
        else performed_set.duration_seconds
        if execution_metric == "duration_seconds"
        else None
    )
    effective_weight = body.weight if "weight" in field_names else performed_set.weight

    validate_exercise_metrics(
        planned_exercise.exercise,
        execution_metric=execution_metric,
        reps=effective_reps,
        duration_minutes=effective_duration_minutes,
        duration_seconds=effective_duration_seconds,
        weight=effective_weight,
    )

    performed_set.weight = effective_weight
    performed_set.reps = effective_reps
    performed_set.duration_minutes = effective_duration_minutes
    performed_set.duration_seconds = effective_duration_seconds
    if "is_warmup" in field_names:
        performed_set.is_warmup = bool(body.is_warmup)
    if "rpe" in field_names:
        performed_set.rpe = body.rpe
    if "rir" in field_names:
        performed_set.rir = body.rir
    if "sensation" in field_names:
        performed_set.sensation = body.sensation or ""
    if "notes" in field_names:
        performed_set.notes = body.notes or ""

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
        execution_metric=resolve_planned_execution_metric(planned),
        reps=body.reps,
        duration_minutes=body.duration_minutes,
        duration_seconds=body.duration_seconds,
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
        duration_seconds=body.duration_seconds,
        is_warmup=body.is_warmup,
        rpe=body.rpe,
        rir=body.rir,
        sensation=body.sensation,
        notes=body.notes,
    )
    db.add(restored)
    restored_numbers = existing_numbers | {body.set_number}
    if restored_numbers == set(range(1, planned.target_sets + 1)):
        planned.status = "completed"
    else:
        planned.status = "in_progress"
    auto_finish_if_done(workout, derive_duration=not reopened)
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
    offset: int = Query(0, ge=0),
    on_date: date | None = None,
    completed_only: bool = False,
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """List last N sessions with summary info, optionally for one date (e.g. today)."""
    summary_columns: tuple[Any, ...] = (
        WorkoutSession.id,
        WorkoutSession.session_date,
        WorkoutSession.title,
        WorkoutSession.status,
        WorkoutSession.energy,
        WorkoutSession.duration_actual,
        func.count(func.distinct(PlannedExercise.id)).label("exercise_count"),
        func.count(PerformedSet.id).label("total_sets"),
    )
    statement = (
        select(*summary_columns)
        .select_from(WorkoutSession)
        .outerjoin(PlannedExercise, PlannedExercise.session_id == WorkoutSession.id)
        .outerjoin(PerformedSet, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .group_by(
            WorkoutSession.id,
            WorkoutSession.session_date,
            WorkoutSession.title,
            WorkoutSession.status,
            WorkoutSession.energy,
            WorkoutSession.duration_actual,
        )
    )
    if on_date:
        statement = statement.where(WorkoutSession.session_date == on_date)
    if completed_only:
        statement = statement.where(WorkoutSession.status == "completed")
    if user_id is not None:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = (
        statement.order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(statement)
    rows = result.all()
    return [
        SessionSummary(
            id=row.id,
            session_date=row.session_date,
            title=row.title,
            status=row.status,
            energy=row.energy,
            duration_actual=row.duration_actual,
            exercise_count=row.exercise_count,
            total_sets=row.total_sets,
        )
        for row in rows
    ]
