import os
from collections.abc import AsyncGenerator
from types import SimpleNamespace

from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class ImportMemorySession:
    def __init__(self, exercises: list[Exercise]):
        self.exercises = exercises
        self.added: list[object] = []
        self.flush_count = 0
        self.committed = False

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.flush_count += 1
        for index, value in enumerate(self.added, start=1):
            if isinstance(value, WorkoutSession) and value.id is None:
                value.id = 1000 + index
            if isinstance(value, PlannedExercise) and value.id is None:
                value.id = 2000 + index

    async def commit(self) -> None:
        self.committed = True

    async def execute(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Exercise:
            return SimpleNamespace(scalars=lambda: _ScalarResult(self.exercises))
        raise AssertionError(f"Unexpected statement entity: {entity}")


def _client(exercises: list[Exercise], user_id: int | None = 42):
    memory = ImportMemorySession(exercises)

    async def fake_get_session() -> AsyncGenerator:
        yield memory

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id
    try:
        yield TestClient(app), memory
    finally:
        app.dependency_overrides.clear()


def test_import_csv_rejects_unknown_and_ambiguous_exercises_before_writes() -> None:
    gen = _client(
        [
            Exercise(id=1, name="Bench Press", muscle_group="chest"),
            Exercise(id=2, name="Bench Press", muscle_group="chest"),
        ]
    )
    client, memory = next(gen)

    csv_body = (
        "Date,Workout Name,Exercise_Title,Weight (kg),Reps\n"
        "2026-08-20 18:00:00,Upper Body,Bench Press,80,8\n"
        "2026-08-20 18:00:00,Upper Body,Mystery Lift,40,10\n"
    )
    response = client.post(
        "/api/coach/import-csv",
        content=csv_body,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["ambiguous_exercises"] == ["Bench Press"]
    assert response.json()["detail"]["unknown_exercises"] == ["Mystery Lift"]
    assert memory.added == []
    assert memory.flush_count == 0
    assert memory.committed is False


def test_import_csv_rejects_metric_mismatch_before_writes() -> None:
    gen = _client(
        [
            Exercise(
                id=20,
                name="Bike",
                muscle_group="cardiovascular",
                body_part="cardio",
                equipment="stationary bike",
                activity_type="cardio",
            )
        ]
    )
    client, memory = next(gen)

    csv_body = "Date,Workout Name,Exercise_Title,Reps\n2026-08-20 18:00:00,Cardio,Bike,10\n"
    response = client.post(
        "/api/coach/import-csv",
        content=csv_body,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422
    assert "Bike" in " ".join(response.json()["detail"]["errors"])
    assert memory.added == []
    assert memory.flush_count == 0


def test_import_csv_preserves_success_response_for_valid_rows() -> None:
    gen = _client([Exercise(id=10, name="Bench Press", muscle_group="chest")])
    client, memory = next(gen)

    csv_body = (
        "Date,Workout Name,Exercise_Title,Weight (kg),Reps,RPE\n"
        "2026-08-20 18:00:00,Upper Body,Bench Press,80,8,8\n"
    )
    response = client.post(
        "/api/coach/import-csv",
        content=csv_body,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "imported_sessions": 1, "total_sets": 1}
    assert any(isinstance(item, WorkoutSession) for item in memory.added)
    assert any(isinstance(item, PlannedExercise) for item in memory.added)
    assert any(isinstance(item, PerformedSet) for item in memory.added)
    assert memory.committed is True


def test_import_csv_normalizes_zero_weight_to_none_and_accepts_zero_rir() -> None:
    gen = _client(
        [
            Exercise(
                id=30,
                name="Pull Up",
                muscle_group="back",
                equipment="body weight",
            )
        ]
    )
    client, memory = next(gen)

    csv_body = (
        "Date,Workout Name,Exercise_Title,Weight (kg),Reps,RIR\n"
        "2026-08-20 18:00:00,Upper Body,Pull Up,0,8,0\n"
    )
    response = client.post(
        "/api/coach/import-csv",
        content=csv_body,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 200
    planned = next(item for item in memory.added if isinstance(item, PlannedExercise))
    performed = next(item for item in memory.added if isinstance(item, PerformedSet))
    assert planned.suggested_weight is None
    assert performed.weight is None
    assert performed.rir == 0.0


def test_import_csv_rejects_explicit_timed_strength_seconds_with_load() -> None:
    gen = _client([Exercise(id=40, name="Farmer Carry", muscle_group="forearms")])
    client, memory = next(gen)

    csv_body = (
        "Date,Workout Name,Exercise_Title,Weight (kg),Seconds\n"
        "2026-08-20 18:00:00,Carry,Farmer Carry,32.5,45\n"
    )
    response = client.post(
        "/api/coach/import-csv",
        content=csv_body,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 422
    assert "JSON import contract for timed strength" in " ".join(
        response.json()["detail"]["errors"]
    )
    assert memory.added == []
