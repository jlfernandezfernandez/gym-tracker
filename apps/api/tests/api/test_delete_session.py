import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


def _build_workout(status: str, with_logged_set: bool = False) -> WorkoutSession:
    exercise = Exercise(id=10, name="Bench Press", muscle_group="chest")
    planned = PlannedExercise(
        id=5,
        session_id=1,
        exercise_id=10,
        order=0,
        target_sets=3,
        target_reps=10,
        status="pending",
    )
    planned.exercise = exercise
    planned.performed_sets = (
        [PerformedSet(id=7, planned_exercise_id=5, set_number=1, weight=40, reps=10)]
        if with_logged_set
        else []
    )
    workout = WorkoutSession(id=1, status=status, telegram_user_id=42)
    workout.planned_exercises = [planned]
    return workout


def _delete(workout: WorkoutSession, user_id: int | None = 42):
    fake_db = AsyncMock()
    fake_db.delete = AsyncMock()
    fake_db.commit = AsyncMock()

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id

    import app.features.sessions.routes as routes_mod

    original_load = routes_mod.load_session
    routes_mod.load_session = AsyncMock(return_value=workout)
    try:
        response = TestClient(app).delete("/api/sessions/1")
    finally:
        routes_mod.load_session = original_load
        app.dependency_overrides.clear()
    return response, fake_db


def test_owner_can_delete_planned_session_without_logged_sets() -> None:
    response, fake_db = _delete(_build_workout("planned"))

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert fake_db.delete.await_count == 2
    fake_db.commit.assert_awaited_once()


def test_owner_can_delete_in_progress_session_without_logged_sets() -> None:
    response, fake_db = _delete(_build_workout("in_progress"))

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert fake_db.delete.await_count == 2
    fake_db.commit.assert_awaited_once()


def test_owner_cannot_delete_in_progress_session_with_logged_sets() -> None:
    response, fake_db = _delete(_build_workout("in_progress", with_logged_set=True))

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Only planned sessions or empty in-progress sessions can be deleted"
    }
    fake_db.delete.assert_not_awaited()
    fake_db.commit.assert_not_awaited()


def test_other_user_cannot_delete_empty_in_progress_session() -> None:
    response, fake_db = _delete(_build_workout("in_progress"), user_id=99)

    assert response.status_code == 403
    fake_db.delete.assert_not_awaited()
    fake_db.commit.assert_not_awaited()
