import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PlannedExercise, WorkoutSession


def _build_workout(status: str, user_id: int = 42, exercises: list | None = None) -> WorkoutSession:
    workout = WorkoutSession(id=1, status=status, telegram_user_id=user_id)
    workout.planned_exercises = exercises or []
    return workout


def _build_planned(planned_id: int, order: int = 0, status: str = "pending") -> PlannedExercise:
    exercise = Exercise(id=10, name="Bench Press", muscle_group="chest")
    planned = PlannedExercise(
        id=planned_id,
        session_id=1,
        exercise_id=10,
        order=order,
        target_sets=3,
        target_reps=10,
        suggested_weight=40.0,
        status=status,
    )
    planned.exercise = exercise
    planned.performed_sets = []
    return planned


def _make_client(
    workout: WorkoutSession,
    user_id_override: int | None = 42,
    catalog_exercise: Exercise | None = None,
    exercise_is_disliked: bool = False,
):
    fake_db = AsyncMock()
    fake_db.add = MagicMock()
    fake_db.commit = AsyncMock()
    fake_db.expire_all = MagicMock()

    exercise_to_return = catalog_exercise or Exercise(id=20, name="Squat", muscle_group="legs")

    async def fake_get(model, pk):
        if model is Exercise:
            return exercise_to_return
        return None

    fake_db.get = fake_get

    async def fake_load_session(session_id, db):
        return workout

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id_override

    import app.features.sessions.routes as routes_mod

    async def fake_get_or_create_profile(db, user_id):
        return MagicMock(id=1)

    async def fake_disliked_exercise_ids(db, athlete_id, exercise_ids):
        return set(exercise_ids) if exercise_is_disliked else set()

    original_load = routes_mod.load_session
    original_profile = routes_mod._get_or_create_profile
    original_disliked = routes_mod.disliked_exercise_ids
    routes_mod.load_session = fake_load_session
    routes_mod._get_or_create_profile = fake_get_or_create_profile
    routes_mod.disliked_exercise_ids = fake_disliked_exercise_ids

    try:
        client = TestClient(app)
        yield client, fake_db
    finally:
        routes_mod.load_session = original_load
        routes_mod._get_or_create_profile = original_profile
        routes_mod.disliked_exercise_ids = original_disliked
        app.dependency_overrides.clear()


def test_add_exercise_to_planned_session() -> None:
    existing = _build_planned(5, order=0)
    workout = _build_workout("planned", exercises=[existing])
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 12,
            "suggested_weight": 60.0,
        },
    )
    assert response.status_code == 200
    fake_db.add.assert_called_once()


def test_add_exercise_to_in_progress_session() -> None:
    existing = _build_planned(5, order=0, status="in_progress")
    workout = _build_workout("in_progress", exercises=[existing])
    gen = _make_client(workout)
    client, _ = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 200


def test_add_exercise_to_completed_session_returns_422() -> None:
    workout = _build_workout("completed", exercises=[])
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 422
    fake_db.add.assert_not_called()


def test_other_user_cannot_add_exercise() -> None:
    workout = _build_workout("planned", user_id=42, exercises=[])
    gen = _make_client(workout, user_id_override=99)
    client, _ = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 403


def test_add_exercise_not_in_catalog_returns_422() -> None:
    workout = _build_workout("planned", exercises=[])
    fake_db = AsyncMock()
    fake_db.add = MagicMock()
    fake_db.commit = AsyncMock()
    fake_db.expire_all = MagicMock()

    async def fake_get(model, pk):
        return None

    fake_db.get = fake_get

    async def fake_load_session(session_id, db):
        return workout

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: 42

    import app.features.sessions.routes as routes_mod

    original_load = routes_mod.load_session
    routes_mod.load_session = fake_load_session

    try:
        client = TestClient(app)
        response = client.post(
            "/api/sessions/1/exercises",
            json={
                "exercise_id": 999,
                "target_sets": 3,
                "target_reps": 10,
            },
        )
        assert response.status_code == 422
        fake_db.add.assert_not_called()
    finally:
        routes_mod.load_session = original_load
        app.dependency_overrides.clear()


def test_add_exercise_default_order_appends_at_end() -> None:
    existing = [_build_planned(5, order=0), _build_planned(6, order=1)]
    workout = _build_workout("planned", exercises=existing)
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 200
    added = fake_db.add.call_args[0][0]
    assert added.order == 2


def test_add_exercise_explicit_order_shifts_existing() -> None:
    existing = [_build_planned(5, order=0), _build_planned(6, order=1)]
    workout = _build_workout("planned", exercises=existing)
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "order": 0,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 200
    added = fake_db.add.call_args[0][0]
    assert added.order == 0
    assert existing[0].order == 1
    assert existing[1].order == 2


def test_add_exercise_empty_session_order_zero() -> None:
    workout = _build_workout("planned", exercises=[])
    gen = _make_client(workout)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 200
    added = fake_db.add.call_args[0][0]
    assert added.order == 0


def test_add_disliked_exercise_rejected() -> None:
    workout = _build_workout("planned", exercises=[])
    gen = _make_client(workout, exercise_is_disliked=True)
    client, fake_db = next(gen)
    response = client.post(
        "/api/sessions/1/exercises",
        json={
            "exercise_id": 20,
            "target_sets": 3,
            "target_reps": 10,
        },
    )
    assert response.status_code == 422
    assert "disliked" in response.json()["detail"]
    fake_db.add.assert_not_called()
