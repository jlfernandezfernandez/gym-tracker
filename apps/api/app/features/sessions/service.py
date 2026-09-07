from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Exercise, PlannedExercise, WorkoutSession


def resolve_planned_execution_metric(planned_exercise: PlannedExercise) -> str:
    exercise = planned_exercise.exercise
    if exercise and exercise.is_cardio:
        return "duration_minutes"
    if planned_exercise.target_duration_seconds is not None:
        return "duration_seconds"
    if any(
        target.get("duration_seconds") is not None
        for target in planned_exercise.set_targets or []
        if isinstance(target, dict)
    ):
        return "duration_seconds"
    return planned_exercise.execution_metric or "reps"


def validate_exercise_weight(exercise: Exercise, weight: float | None) -> None:
    """Weight is NULL or > 0; unloaded strength equipment takes none."""
    if exercise.is_unloaded and weight is not None:
        raise HTTPException(
            status_code=422,
            detail=f"'{exercise.equipment}' exercises take no weight; omit it",
        )


def validate_exercise_metrics(
    exercise: Exercise,
    *,
    execution_metric: str | None = None,
    reps: int | None,
    duration_minutes: int | None,
    duration_seconds: int | None = None,
    weight: float | None,
    unilateral: bool = False,
    require_cardio_duration: bool = True,
) -> None:
    """Enforce the catalog activity domain at every session mutation boundary."""
    metric = execution_metric
    if metric is None:
        if duration_seconds is not None:
            metric = "duration_seconds"
        elif duration_minutes is not None:
            metric = "duration_minutes"
        elif reps is not None:
            metric = "reps"
        else:
            metric = "duration_minutes" if exercise.is_cardio else "reps"

    if exercise.is_cardio:
        if (
            metric != "duration_minutes"
            or reps is not None
            or (require_cardio_duration and duration_minutes is None)
            or duration_seconds is not None
            or weight is not None
            or unilateral
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Cardio requires duration_minutes and does not accept reps, weight,"
                    " duration_seconds or unilateral execution"
                ),
            )
        return

    if metric == "duration_minutes":
        raise HTTPException(
            status_code=422,
            detail="Strength does not accept duration_minutes; use reps or duration_seconds",
        )

    if metric == "duration_seconds":
        if duration_seconds is None or reps is not None or duration_minutes is not None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Timed strength requires duration_seconds"
                    " and does not accept reps or duration_minutes"
                ),
            )
        validate_exercise_weight(exercise, weight)
        return

    if reps is None or duration_minutes is not None or duration_seconds is not None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Strength requires reps and does not accept duration_minutes or duration_seconds"
            ),
        )
    validate_exercise_weight(exercise, weight)


def set_conflict_error(error: IntegrityError) -> HTTPException:
    if any(name in str(error.orig) for name in ("uq_performed_set_number", "pk_set_log_receipts")):
        return HTTPException(status_code=409, detail="Set was already logged by another request")
    raise error


def check_session_owner(workout: WorkoutSession, user_id: int | None) -> None:
    """Enforce ownership between Telegram users.

    A None user_id is only reachable in development with auth disabled:
    current_user_id rejects everything else with 401, and the coach key is
    always scoped to one user via X-Telegram-User-Id.
    """
    if user_id is not None and workout.telegram_user_id != user_id:
        raise HTTPException(status_code=403, detail="This session belongs to another user")


async def load_session(session_id: int, db: AsyncSession) -> WorkoutSession:
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
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
        raise HTTPException(status_code=404, detail="Session not found")
    return workout


def find_planned_exercise(workout: WorkoutSession, planned_id: int) -> PlannedExercise:
    for planned in workout.planned_exercises or []:
        if planned.id == planned_id:
            return planned
    raise HTTPException(status_code=404, detail="Planned exercise not found in this session")


def performed_set_numbers(planned_exercise: PlannedExercise) -> set[int]:
    return {performed.set_number for performed in planned_exercise.performed_sets or []}


def exercise_has_all_target_sets(planned_exercise: PlannedExercise) -> bool:
    """Completion is based on the actual numbered set collection, never its length."""
    expected = set(range(1, planned_exercise.target_sets + 1))
    return performed_set_numbers(planned_exercise) == expected


def next_missing_set_number(planned_exercise: PlannedExercise) -> int | None:
    """Return the earliest missing target set, including a deleted middle set."""
    performed = performed_set_numbers(planned_exercise)
    return next(
        (
            number
            for number in range(1, planned_exercise.target_sets + 1)
            if number not in performed
        ),
        None,
    )


def sync_exercise_status_from_sets(planned_exercise: PlannedExercise) -> None:
    """Keep derived set-driven states aligned after a correction.

    Explicit completion remains available through the complete endpoint. Correction
    endpoints use this helper because their meaning is the real performed-set set.
    """
    if exercise_has_all_target_sets(planned_exercise):
        planned_exercise.status = "completed"
    elif planned_exercise.performed_sets:
        planned_exercise.status = "in_progress"
    else:
        planned_exercise.status = "pending"


def reopen_session_for_correction(workout: WorkoutSession) -> None:
    """A set correction reopens an auto/manual completed workout coherently."""
    if workout.status == "completed":
        workout.status = "in_progress"


def start_session(workout: WorkoutSession) -> None:
    if workout.status == "planned":
        workout.status = "in_progress"
    if workout.status == "in_progress" and not workout.started_at:
        workout.started_at = datetime.now(UTC).replace(tzinfo=None)


def auto_finish_if_done(workout: WorkoutSession, *, derive_duration: bool = True) -> None:
    planned = workout.planned_exercises or []
    if not planned or workout.status != "in_progress":
        return
    if not all(pe.status in {"completed", "skipped"} for pe in planned):
        return
    workout.status = "completed"
    if derive_duration and workout.started_at and not workout.duration_actual:
        now = datetime.now(UTC).replace(tzinfo=None)
        workout.duration_actual = max(1, int((now - workout.started_at).total_seconds() / 60))


def current_state(workout: WorkoutSession) -> dict:
    planned = sorted(workout.planned_exercises or [], key=lambda pe: pe.order)
    if workout.status in {"completed", "cancelled"}:
        return {
            "session_id": workout.id,
            "session_status": workout.status,
            "current_planned_exercise_id": None,
            "current_set_number": None,
            "exercise_order": None,
            "exercise_count": len(planned),
            "completed_exercises": sum(
                1 for item in planned if item.status in {"completed", "skipped"}
            ),
            "completed_sets": sum(len(item.performed_sets or []) for item in planned),
            "total_sets": sum(item.target_sets for item in planned),
            "is_complete": True,
        }
    current = None
    for planned_exercise in planned:
        if planned_exercise.status in {"pending", "in_progress"}:
            current = planned_exercise
            break
    if current is None and planned:
        current = planned[-1]
    completed_exercises = sum(
        1 for planned_exercise in planned if planned_exercise.status in {"completed", "skipped"}
    )
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
    next_set_number = next_missing_set_number(current)
    if next_set_number is None:
        next_set_number = current.target_sets
    next_set_target = next(
        (t for t in current.set_targets or [] if t.get("set_number") == next_set_number), None
    )
    return {
        "session_id": workout.id,
        "session_status": workout.status,
        "current_planned_exercise_id": current.id,
        "current_exercise_id": current.exercise_id,
        "current_exercise_name": current.exercise.name if current.exercise else "",
        "current_set_number": next_set_number,
        "target_sets": current.target_sets,
        "execution_metric": resolve_planned_execution_metric(current),
        "target_reps": current.target_reps,
        "target_duration_minutes": current.target_duration_minutes,
        "target_duration_seconds": current.target_duration_seconds,
        "suggested_weight": current.suggested_weight,
        "weight_mode": current.weight_mode,
        "activity_type": current.activity_type,
        "next_set_target": next_set_target,
        "exercise_order": current.order,
        "exercise_count": len(planned),
        "completed_exercises": completed_exercises,
        "completed_sets": completed_sets,
        "total_sets": total_sets,
        "is_complete": bool(planned) and completed_exercises == len(planned),
    }
