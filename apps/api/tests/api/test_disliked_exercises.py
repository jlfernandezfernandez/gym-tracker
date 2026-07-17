import os
from collections.abc import AsyncGenerator
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import AthleteDislikedExercise, AthleteProfile, Exercise


def _profile(user_id: int = 42) -> AthleteProfile:
    return AthleteProfile(id=1, name="Test", telegram_user_id=user_id)


def _exercise(exercise_id: int = 10, name: str = "Bench Press") -> Exercise:
    return Exercise(id=exercise_id, name=name, muscle_group="chest", equipment="barbell")


def _disliked(
    row_id: int = 1, athlete_id: int = 1, exercise_id: int = 10
) -> AthleteDislikedExercise:
    return AthleteDislikedExercise(
        id=row_id,
        athlete_id=athlete_id,
        exercise_id=exercise_id,
        created_at=datetime(2026, 1, 1),
    )


def _make_client(profile: AthleteProfile, user_id_override: int | None = 42):
    fake_db = AsyncMock()
    fake_db.add = AsyncMock()
    fake_db.delete = AsyncMock()
    fake_db.commit = AsyncMock()
    fake_db.refresh = AsyncMock()

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id_override

    client = TestClient(app)
    return client, fake_db


@pytest.fixture()
def client_and_db():
    profile = _profile()
    client, fake_db = _make_client(profile)
    yield client, fake_db, profile


def test_list_disliked_returns_empty(client_and_db) -> None:
    client, fake_db, _ = client_and_db
    fake_db.execute = AsyncMock(return_value=AsyncMock(scalar_one_or_none=lambda: _profile()))
    result = AsyncMock()
    result.all = lambda: []
    fake_db.execute = AsyncMock(
        side_effect=[
            AsyncMock(scalar_one_or_none=lambda: _profile()),
            result,
        ]
    )
    response = client.get("/api/disliked-exercises")
    assert response.status_code == 200


def test_add_disliked_calls_commit() -> None:
    profile = _profile()
    exercise = _exercise()
    client, fake_db = _make_client(profile)

    call_count = 0

    async def fake_execute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return AsyncMock(scalar_one_or_none=lambda: profile)
        if call_count == 2:
            return AsyncMock(scalar_one_or_none=lambda: None)
        return AsyncMock(scalar_one_or_none=lambda: None)

    fake_db.execute = fake_execute

    async def fake_get(model, pk):
        if model == Exercise:
            return exercise
        return None

    fake_db.get = fake_get

    def _set_id(obj):
        obj.id = 1

    fake_db.refresh = AsyncMock(side_effect=_set_id)

    response = client.post("/api/disliked-exercises", json={"exercise_id": 10})
    assert response.status_code == 201


def test_remove_disliked_returns_404_when_not_found() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    async def fake_execute(*args, **kwargs):
        return AsyncMock(scalar_one_or_none=lambda: None)

    fake_db.execute = fake_execute

    response = client.delete("/api/disliked-exercises/999")
    assert response.status_code == 404


def test_add_disliked_already_exists_returns_409() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    call_count = 0

    async def fake_execute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return AsyncMock(scalar_one_or_none=lambda: profile)
        if call_count == 2:
            return AsyncMock(scalar_one_or_none=lambda: _disliked())
        return AsyncMock(scalar_one_or_none=lambda: None)

    fake_db.execute = fake_execute

    async def fake_get(model, pk):
        if model == Exercise:
            return _exercise()
        return None

    fake_db.get = fake_get

    response = client.post("/api/disliked-exercises", json={"exercise_id": 10})
    assert response.status_code == 409
    assert response.json()["detail"] == "Already disliked"


def test_add_disliked_exercise_not_found_returns_404() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    async def fake_execute(*args, **kwargs):
        return AsyncMock(scalar_one_or_none=lambda: profile)

    fake_db.execute = fake_execute

    async def fake_get(model, pk):
        return None

    fake_db.get = fake_get

    response = client.post("/api/disliked-exercises", json={"exercise_id": 999})
    assert response.status_code == 404
    assert response.json()["detail"] == "Exercise not found"


def test_remove_disliked_success() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    call_count = 0

    async def fake_execute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return AsyncMock(scalar_one_or_none=lambda: profile)
        if call_count == 2:
            return AsyncMock(scalar_one_or_none=lambda: _disliked())
        return AsyncMock(scalar_one_or_none=lambda: None)

    fake_db.execute = fake_execute

    response = client.delete("/api/disliked-exercises/10")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    fake_db.delete.assert_called_once()
    fake_db.commit.assert_called_once()


def test_list_exercises_exclude_disliked() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    call_count = 0

    async def fake_execute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return AsyncMock(scalar_one_or_none=lambda: profile)

        mock_result = AsyncMock()
        mock_result.scalars = lambda: AsyncMock(all=lambda: [_exercise(10)])
        return mock_result

    fake_db.execute = fake_execute

    response = client.get("/api/exercises?exclude_disliked=true")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 10


def test_coach_plan_rejects_disliked_exercises() -> None:
    profile = _profile()
    client, fake_db = _make_client(profile)

    call_count = 0

    async def fake_execute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return AsyncMock(scalar_one_or_none=lambda: profile)
        if call_count == 2:
            # disliked check
            mock_result = AsyncMock()
            mock_result.scalars = lambda: AsyncMock(all=lambda: [10])
            return mock_result
        return AsyncMock()

    fake_db.execute = fake_execute

    payload = {
        "title": "Leg Day",
        "goal": "Hypertrophy",
        "exercises": [{"exercise_id": 10, "order": 0}],
    }
    response = client.post("/api/coach/plan", json=payload)
    assert response.status_code == 422
    assert "disliked by the athlete" in response.json()["detail"]
