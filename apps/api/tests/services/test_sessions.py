import pytest
from fastapi import HTTPException

from app.features.sessions.service import find_planned_exercise, start_session
from app.models import PlannedExercise, WorkoutSession


def test_find_planned_exercise_is_scoped_to_session() -> None:
    workout = WorkoutSession(
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1),
            PlannedExercise(id=2, session_id=1, exercise_id=2),
        ]
    )
    assert find_planned_exercise(workout, 2).id == 2
    with pytest.raises(HTTPException) as error:
        find_planned_exercise(workout, 3)
    assert error.value.status_code == 404


def test_start_session_is_idempotent() -> None:
    workout = WorkoutSession(status="planned")
    start_session(workout)
    started_at = workout.started_at
    start_session(workout)
    assert workout.status == "in_progress"
    assert workout.started_at == started_at
