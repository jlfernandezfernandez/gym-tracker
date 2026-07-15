import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PlannedExercise, WorkoutSession


def test_owner_can_delete_in_progress_session_without_logged_sets() -> None:
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
    planned.performed_sets = []
    workout = WorkoutSession(id=1, status="in_progress", telegram_user_id=42)
    workout.planned_exercises = [planned]

    fake_db = AsyncMock()
    fake_db.delete = AsyncMock()
    fake_db.commit = AsyncMock()

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: 42

    import app.features.sessions.routes as routes_mod

    original_load = routes_mod.load_session
    routes_mod.load_session = AsyncMock(return_value=workout)
    try:
        response = TestClient(app).delete("/api/sessions/1")
    finally:
        routes_mod.load_session = original_load
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert fake_db.delete.await_count == 2
    fake_db.commit.assert_awaited_once()
