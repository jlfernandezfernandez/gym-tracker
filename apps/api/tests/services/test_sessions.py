from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.features.sessions.service import auto_finish_if_done, find_planned_exercise, start_session
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


def test_auto_finish_when_all_completed() -> None:
    workout = WorkoutSession(
        status="in_progress",
        started_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=30),
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
            PlannedExercise(id=2, session_id=1, exercise_id=2, status="completed"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "completed"
    assert workout.duration_actual == 30


def test_auto_finish_with_skipped_exercises() -> None:
    workout = WorkoutSession(
        status="in_progress",
        started_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=45),
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
            PlannedExercise(id=2, session_id=1, exercise_id=2, status="skipped"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "completed"
    assert workout.duration_actual == 45


def test_auto_finish_noop_when_pending_exercise() -> None:
    workout = WorkoutSession(
        status="in_progress",
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
            PlannedExercise(id=2, session_id=1, exercise_id=2, status="pending"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "in_progress"


def test_auto_finish_noop_when_already_completed() -> None:
    workout = WorkoutSession(
        status="completed",
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "completed"


def test_auto_finish_noop_when_no_exercises() -> None:
    workout = WorkoutSession(status="in_progress", planned_exercises=[])
    auto_finish_if_done(workout)
    assert workout.status == "in_progress"


def test_auto_finish_preserves_existing_duration() -> None:
    workout = WorkoutSession(
        status="in_progress",
        started_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=60),
        duration_actual=45,
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "completed"
    assert workout.duration_actual == 45


def test_auto_finish_without_started_at() -> None:
    workout = WorkoutSession(
        status="in_progress",
        planned_exercises=[
            PlannedExercise(id=1, session_id=1, exercise_id=1, status="completed"),
        ],
    )
    auto_finish_if_done(workout)
    assert workout.status == "completed"
    assert workout.duration_actual == 0
