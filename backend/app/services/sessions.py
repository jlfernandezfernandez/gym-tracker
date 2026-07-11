from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import PlannedExercise, WorkoutSession


def check_session_owner(workout: WorkoutSession, user_id: int | None, auth_disabled: bool) -> None:
    if auth_disabled and user_id is None:
        return
    if user_id is None or workout.telegram_user_id != user_id:
        raise HTTPException(status_code=403, detail="This session belongs to another user")


async def load_session(session_id: int, db: AsyncSession) -> WorkoutSession:
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
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


def start_session(workout: WorkoutSession) -> None:
    if workout.status == "planned":
        workout.status = "in_progress"
    if workout.status == "in_progress" and not workout.started_at:
        workout.started_at = datetime.now(timezone.utc).replace(tzinfo=None)


def current_state(workout: WorkoutSession) -> dict:
    planned = sorted(workout.planned_exercises or [], key=lambda pe: pe.order)
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
            "session_id": workout.id, "session_status": workout.status,
            "current_planned_exercise_id": None, "current_set_number": None,
            "exercise_order": None, "exercise_count": 0,
            "completed_exercises": completed_exercises, "completed_sets": completed_sets,
            "total_sets": total_sets, "is_complete": True,
        }
    current_set_count = len(current.performed_sets or [])
    next_set_number = min(current_set_count + 1, current.target_sets)
    return {
        "session_id": workout.id, "session_status": workout.status,
        "current_planned_exercise_id": current.id, "current_exercise_id": current.exercise_id,
        "current_exercise_name": current.exercise.name if current.exercise else "",
        "current_set_number": next_set_number, "target_sets": current.target_sets,
        "target_reps": current.target_reps, "suggested_weight": current.suggested_weight,
        "weight_mode": current.weight_mode, "exercise_order": current.order,
        "exercise_count": len(planned), "completed_exercises": completed_exercises,
        "completed_sets": completed_sets, "total_sets": total_sets,
        "is_complete": bool(planned) and completed_exercises == len(planned),
    }
