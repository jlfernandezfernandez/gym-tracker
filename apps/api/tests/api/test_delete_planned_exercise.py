import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


def _build_workout(status: str, user_id: int = 42, exercises: list | None = None) -> WorkoutSession:
    workout = WorkoutSession(id=1, status=status, telegram_user_id=user_id)
    workout.planned_exercises = exercises or []
    return workout


def _build_planned(
    planned_id: int,
    status: str = "pending",
    performed: list | None = None,
    exercise_name: str = "Bench Press",
) -> PlannedExercise:
    exercise = Exercise(id=10, name=exercise_name, muscle_group="chest")
    planned = PlannedExercise(
        id=planned_id,
        session_id=1,
        exercise_id=10,
        order=0,
        target_sets=3,
        target_reps=10,
        suggested_weight=40.0,
        status=status,
    )
    planned.exercise = exercise
    planned.performed_sets = performed or []
    return planned


def _make_client(
    workout: WorkoutSession,
    user_id_override: int | None = 42,
    deleted_ids: list | None = None,
):
    fake_db = AsyncMock()
    fake_db.delete = AsyncMock()
    fake_db.commit = AsyncMock()
    fake_db.expire_all = MagicMock()

    load_count = 0

    async def fake_load_session(session_id, db):
        nonlocal load_count
        load_count += 1
        if load_count > 1 and deleted_ids is not None:
            workout.planned_exercises = [
                pe for pe in workout.planned_exercises if pe.id not in deleted_ids
            ]
        return workout

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id_override

    import app.features.sessions.routes as routes_mod

    original_load = routes_mod.load_session
    routes_mod.load_session = fake_load_session

    try:
        client = TestClient(app)
        yield client, fake_db
    finally:
        routes_mod.load_session = original_load
        app.dependency_overrides.clear()


@pytest.fixture()
def client_and_db():
    workout = _build_workout("planned", exercises=[_build_planned(5)])
    gen = _make_client(workout)
    client, fake_db = next(gen)
    yield client, fake_db, workout


def test_owner_can_delete_from_planned_session() -> None:
    planned = _build_planned(5, status="pending")
    workout = _build_workout("planned", exercises=[planned])
    gen = _make_client(workout, deleted_ids=[5])
    client, _ = next(gen)
    response = client.delete("/api/sessions/1/exercises/5")
    assert response.status_code == 200
    body = response.json()
    assert all(e["id"] != 5 for e in body["planned_exercises"])


def test_owner_can_delete_from_in_progress_session() -> None:
    planned = _build_planned(5, status="pending")
    workout = _build_workout("in_progress", exercises=[planned])
    gen = _make_client(workout, deleted_ids=[5])
    client, _ = next(gen)
    response = client.delete("/api/sessions/1/exercises/5")
    assert response.status_code == 200


def test_owner_can_delete_from_completed_session() -> None:
    planned = _build_planned(5, status="pending")
    workout = _build_workout("completed", exercises=[planned])
    gen = _make_client(workout, deleted_ids=[5])
    client, _ = next(gen)
    response = client.delete("/api/sessions/1/exercises/5")
    assert response.status_code == 200


def test_other_user_cannot_delete() -> None:
    planned = _build_planned(5)
    workout = _build_workout("planned", user_id=42, exercises=[planned])
    gen = _make_client(workout, user_id_override=99)
    client, _ = next(gen)
    response = client.delete("/api/sessions/1/exercises/5")
    assert response.status_code == 403


def test_delete_exercise_with_sets_returns_422() -> None:
    performed = [PerformedSet(id=1, planned_exercise_id=5, set_number=1, weight=40, reps=10)]
    planned = _build_planned(5, status="in_progress", performed=performed)
    workout = _build_workout("in_progress", exercises=[planned])
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.delete("/api/sessions/1/exercises/5")
    assert response.status_code == 422
    fake_db.delete.assert_not_called()


def test_delete_nonexistent_exercise_returns_404() -> None:
    planned = _build_planned(5)
    workout = _build_workout("planned", exercises=[planned])
    gen = _make_client(workout)
    client, _ = next(gen)
    response = client.delete("/api/sessions/1/exercises/999")
    assert response.status_code == 404
