"""Coach router — plan creation and history import.

The coach agent creates plans via MCP `create_plan`, which calls this endpoint.
No LLM call here — the agent IS the LLM. The agent picks exercises from the
catalog (`list_exercises`) and must send them in the body.
"""

import re
from datetime import date, datetime, time
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import current_user_id
from app.core.database import get_session
from app.features.coach.importer import (
    TrackerCsvImportError,
    _normalize_name,
    parse_tracker_csv,
)
from app.features.coach.progression import recommend_progression
from app.features.coach.recovery import calculate_muscle_readiness
from app.features.disliked.routes import disliked_exercise_ids
from app.features.profile.routes import _get_or_create_profile
from app.features.sessions.schemas import (
    CoachImportRequest,
    CoachPlanRequest,
    SessionOut,
    SessionSummary,
)
from app.features.sessions.service import current_state, load_session, validate_exercise_metrics
from app.models import (
    AthleteMeasurement,
    Exercise,
    PerformedSet,
    PlannedExercise,
    WorkoutSession,
)

router = APIRouter(prefix="/coach", tags=["coach"])


def _default_execution_metric(exercise: Exercise) -> str:
    return "duration_minutes" if exercise.is_cardio else "reps"


def _exercise_match_keys(name: str) -> list[str]:
    keys = [_normalize_name(name)]
    stripped = _normalize_name(re.sub(r"\([^)]*\)", " ", name))
    if stripped and stripped not in keys:
        keys.append(stripped)
    return [key for key in keys if key]


async def _load_recent_completed_sessions(
    db: AsyncSession, user_id: int | None, limit: int = 30
) -> list[WorkoutSession]:
    """Fetch recent completed sessions with exercises and performed sets."""
    return list(
        (
            await db.execute(
                select(WorkoutSession)
                .where(
                    WorkoutSession.telegram_user_id == user_id,
                    WorkoutSession.status == "completed",
                )
                .options(
                    selectinload(WorkoutSession.planned_exercises).selectinload(
                        PlannedExercise.performed_sets
                    ),
                    selectinload(WorkoutSession.planned_exercises).selectinload(
                        PlannedExercise.exercise
                    ),
                )
                .order_by(WorkoutSession.session_date.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )


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
    # Fetch 30-day completed sessions to compute exact muscle readiness
    completed_sessions = await _load_recent_completed_sessions(db, user_id, limit=30)
    muscle_recovery = calculate_muscle_readiness(completed_sessions)

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
        "muscle_recovery": muscle_recovery,
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
                        "execution_metric": item.execution_metric,
                        "target_reps": item.target_reps,
                        "target_duration_minutes": item.target_duration_minutes,
                        "target_duration_seconds": item.target_duration_seconds,
                        "activity_type": item.activity_type,
                        "performed_sets": [
                            {
                                "weight": performed.weight,
                                "reps": performed.reps,
                                "duration_minutes": performed.duration_minutes,
                                "duration_seconds": performed.duration_seconds,
                                "is_warmup": performed.is_warmup,
                                "rpe": performed.rpe,
                                "rir": performed.rir,
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


@router.get("/recovery")
async def athlete_muscle_recovery(
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Calculates exponential decay muscle fatigue & readiness for the athlete."""
    completed_sessions = await _load_recent_completed_sessions(db, user_id, limit=30)
    return calculate_muscle_readiness(completed_sessions)


@router.get("/progression/{exercise_id}")
async def progression_recommendation(
    exercise_id: int,
    policy: Literal["linear", "greyskull", "double", "bodyweight"] = Query("linear"),
    target_reps: int = Query(10, ge=1, le=50),
    reps_min: int = Query(8, ge=1, le=50),
    reps_max: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Get progression advice (weight jump, rep targets, deload triggers) from history."""
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    statement = (
        select(WorkoutSession)
        .join(PlannedExercise, PlannedExercise.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.telegram_user_id == user_id,
            WorkoutSession.status == "completed",
            PlannedExercise.exercise_id == exercise_id,
        )
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            )
        )
        .order_by(WorkoutSession.session_date.desc())
        .limit(10)
    )
    sessions = (await db.execute(statement)).scalars().all()
    history = []
    for s in sessions:
        for pe in s.planned_exercises or []:
            if pe.exercise_id == exercise_id and pe.performed_sets:
                history.append(
                    {
                        "date": s.session_date.isoformat(),
                        "top_weight": max(
                            (ps.weight or 0.0 for ps in pe.performed_sets), default=None
                        ),
                        "sets": [
                            {
                                "weight": ps.weight,
                                "reps": ps.reps,
                                "is_warmup": ps.is_warmup,
                                "rpe": ps.rpe,
                                "rir": ps.rir,
                            }
                            for ps in pe.performed_sets
                        ],
                    }
                )

    return recommend_progression(
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        body_part=exercise.body_part or exercise.muscle_group,
        activity_type=exercise.activity_type,
        history=history,
        policy=policy,
        target_reps=target_reps,
        reps_min=reps_min,
        reps_max=reps_max,
    )


@router.post("/import-csv")
async def import_tracker_csv_endpoint(
    csv_content: str = Body(..., media_type="text/plain"),
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Import historical sessions from CSV (Hevy, Strong, FitNotes) with catalog matching."""
    try:
        parsed_workouts = parse_tracker_csv(csv_content)
    except TrackerCsvImportError as error:
        raise HTTPException(status_code=422, detail={"errors": error.errors}) from error
    if not parsed_workouts:
        raise HTTPException(status_code=422, detail="Could not parse any workouts from CSV")

    # Resolve all exercises before any write so an invalid import is atomic.
    all_exercises = (await db.execute(select(Exercise))).scalars().all()
    exercise_lookup: dict[str, list[Exercise]] = {}
    for ex in all_exercises:
        for raw_name in (ex.name, ex.name_en or ""):
            for key in _exercise_match_keys(raw_name):
                bucket = exercise_lookup.setdefault(key, [])
                if all(candidate.id != ex.id for candidate in bucket):
                    bucket.append(ex)

    def match_exercise(name: str) -> tuple[Exercise | None, str | None]:
        matches: list[Exercise] = []
        for key in _exercise_match_keys(name):
            for candidate in exercise_lookup.get(key, []):
                if all(existing.id != candidate.id for existing in matches):
                    matches.append(candidate)
        if not matches:
            return None, "unknown"
        if len(matches) > 1:
            return None, "ambiguous"
        return matches[0], None

    validation_errors: list[str] = []
    unknown_exercises: list[str] = []
    ambiguous_exercises: list[str] = []
    resolved_workouts: list[dict[str, Any]] = []

    for workout_data in parsed_workouts:
        resolved_exercises: list[dict[str, Any]] = []
        for exercise_data in workout_data["exercises"]:
            matched, error_kind = match_exercise(exercise_data["name"])
            if error_kind == "unknown":
                unknown_exercises.append(exercise_data["name"])
                continue
            if error_kind == "ambiguous":
                ambiguous_exercises.append(exercise_data["name"])
                continue
            assert matched is not None
            for set_index, set_data in enumerate(exercise_data["sets"], start=1):
                try:
                    validate_exercise_metrics(
                        matched,
                        execution_metric=(
                            "duration_minutes"
                            if set_data.get("duration_minutes") is not None
                            else "reps"
                        ),
                        reps=set_data.get("reps"),
                        duration_minutes=set_data.get("duration_minutes"),
                        duration_seconds=set_data.get("duration_seconds"),
                        weight=set_data.get("weight"),
                    )
                except HTTPException as error:
                    validation_errors.append(
                        f"{exercise_data['name']} set {set_index}: {error.detail}"
                    )
            resolved_exercises.append({**exercise_data, "matched_exercise": matched})
        resolved_workouts.append({**workout_data, "exercises": resolved_exercises})

    if validation_errors or unknown_exercises or ambiguous_exercises:
        raise HTTPException(
            status_code=422,
            detail={
                "errors": validation_errors,
                "unknown_exercises": sorted(set(unknown_exercises)),
                "ambiguous_exercises": sorted(set(ambiguous_exercises)),
            },
        )

    imported_sessions_count = 0
    total_sets_count = 0

    for w_data in resolved_workouts:
        session_date = date.fromisoformat(w_data["session_date"])
        workout = WorkoutSession(
            session_date=session_date,
            title=w_data["title"] or "Entreno importado",
            status="completed",
            telegram_user_id=user_id,
        )
        db.add(workout)
        await db.flush()

        order = 0
        for ex_data in w_data["exercises"]:
            matched = ex_data["matched_exercise"]

            planned = PlannedExercise(
                session_id=workout.id,
                exercise_id=matched.id,
                order=order,
                target_sets=len(ex_data["sets"]),
                execution_metric=(
                    "duration_minutes"
                    if ex_data["sets"][0].get("duration_minutes") is not None
                    else "reps"
                ),
                target_reps=ex_data["sets"][0].get("reps"),
                target_duration_minutes=ex_data["sets"][0].get("duration_minutes"),
                suggested_weight=ex_data["sets"][0].get("weight"),
                status="completed",
            )
            db.add(planned)
            await db.flush()
            order += 1

            for set_idx, s in enumerate(ex_data["sets"], start=1):
                perf = PerformedSet(
                    planned_exercise_id=planned.id,
                    set_number=set_idx,
                    weight=s.get("weight"),
                    reps=s.get("reps"),
                    duration_minutes=s.get("duration_minutes"),
                    duration_seconds=s.get("duration_seconds"),
                    is_warmup=s.get("is_warmup", False),
                    rpe=s.get("rpe"),
                    rir=s.get("rir"),
                    notes=s.get("notes", ""),
                    timestamp=datetime.combine(session_date, time(12, 0)),
                )
                db.add(perf)
                total_sets_count += 1

        imported_sessions_count += 1

    await db.commit()
    return {
        "success": True,
        "imported_sessions": imported_sessions_count,
        "total_sets": total_sets_count,
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
        execution_metric = exercise_spec.execution_metric or _default_execution_metric(exercise)
        validate_exercise_metrics(
            exercise,
            execution_metric=execution_metric,
            reps=exercise_spec.target_reps,
            duration_minutes=exercise_spec.target_duration_minutes,
            duration_seconds=exercise_spec.target_duration_seconds,
            weight=exercise_spec.suggested_weight,
            unilateral=exercise_spec.unilateral,
            require_cardio_duration=False,
        )
        set_targets_data = None
        if exercise_spec.set_targets:
            set_targets_data = [t.model_dump() for t in exercise_spec.set_targets]
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
                exercise_id=exercise_spec.exercise_id,
                order=exercise_spec.order,
                target_sets=exercise_spec.target_sets,
                execution_metric=execution_metric,
                target_reps=exercise_spec.target_reps,
                target_duration_minutes=exercise_spec.target_duration_minutes,
                target_duration_seconds=exercise_spec.target_duration_seconds,
                suggested_weight=exercise_spec.suggested_weight,
                unilateral=exercise_spec.unilateral,
                superset_group=exercise_spec.superset_group,
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
        execution_metric = exercise_spec.execution_metric or (
            "duration_seconds"
            if exercise_spec.sets[0].duration_seconds is not None
            else "duration_minutes"
            if exercise_spec.sets[0].duration_minutes is not None
            else _default_execution_metric(exercise)
        )
        planned = PlannedExercise(
            session_id=workout.id,
            exercise_id=exercise_spec.exercise_id,
            order=exercise_spec.order,
            target_sets=len(exercise_spec.sets),
            execution_metric=execution_metric,
            target_reps=exercise_spec.sets[0].reps,
            target_duration_minutes=exercise_spec.sets[0].duration_minutes,
            target_duration_seconds=exercise_spec.sets[0].duration_seconds,
            suggested_weight=exercise_spec.sets[0].weight,
            unilateral=exercise_spec.unilateral,
            superset_group=exercise_spec.superset_group,
            notes=exercise_spec.notes,
            status="completed",
        )
        db.add(planned)
        await db.flush()
        for set_number, set_spec in enumerate(exercise_spec.sets, start=1):
            validate_exercise_metrics(
                exercise,
                execution_metric=execution_metric,
                reps=set_spec.reps,
                duration_minutes=set_spec.duration_minutes,
                duration_seconds=set_spec.duration_seconds,
                weight=set_spec.weight,
                unilateral=exercise_spec.unilateral,
            )
            db.add(
                PerformedSet(
                    planned_exercise_id=planned.id,
                    set_number=set_number,
                    weight=set_spec.weight,
                    reps=set_spec.reps,
                    duration_minutes=set_spec.duration_minutes,
                    duration_seconds=set_spec.duration_seconds,
                    is_warmup=set_spec.is_warmup,
                    rpe=set_spec.rpe,
                    rir=set_spec.rir,
                    notes=set_spec.notes,
                    timestamp=performed_at,
                )
            )

    await db.commit()
    return await load_session(workout.id, db)
