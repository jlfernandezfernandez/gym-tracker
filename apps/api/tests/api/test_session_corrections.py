"""HTTP regression tests for reversible workout corrections.

The routes run through the real FastAPI application.  The persistence seam is a
small in-memory async double so every assertion is about endpoint semantics,
not a mocked route function.
"""

import os
from collections.abc import AsyncGenerator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


class MemorySession:
    def __init__(self, workout: WorkoutSession):
        self.workout = workout
        self.added: list[object] = []
        self.expire_all = MagicMock()
        self.flush = AsyncMock()
        self.rollback = AsyncMock()

    def add(self, value: object) -> None:
        self.added.append(value)

    async def delete(self, value: object) -> None:
        return None

    async def execute(self, statement):
        self.workout.planned_exercises.sort(key=lambda planned: planned.order)
        for planned in self.workout.planned_exercises:
            planned.performed_sets.sort(key=lambda performed: performed.set_number)
        return SimpleNamespace(scalar_one_or_none=lambda: self.workout)

    async def get(self, model, primary_key):
        if model is Exercise:
            return next(
                (
                    planned.exercise
                    for planned in self.workout.planned_exercises
                    if planned.exercise.id == primary_key
                ),
                None,
            )
        return next(
            (
                performed
                for planned in self.workout.planned_exercises
                for performed in planned.performed_sets
                if isinstance(performed, PerformedSet) and performed.id == primary_key
            ),
            None,
        )

    async def commit(self) -> None:
        for value in self.added:
            if isinstance(value, PerformedSet):
                planned = next(
                    item
                    for item in self.workout.planned_exercises
                    if item.id == value.planned_exercise_id
                )
                if all(item.set_number != value.set_number for item in planned.performed_sets):
                    value.id = value.id or 100 + value.set_number
                    value.planned_exercise = planned
                    planned.performed_sets.sort(key=lambda item: item.set_number)
        self.added.clear()


def _exercise(
    exercise_id: int, equipment: str = "barbell", activity_type: str = "strength"
) -> Exercise:
    return Exercise(
        id=exercise_id,
        name=f"Exercise {exercise_id}",
        muscle_group="chest",
        equipment=equipment,
        activity_type=activity_type,
    )


def _performed(planned_id: int, number: int, weight: float | None = 40) -> PerformedSet:
    return PerformedSet(
        id=number,
        planned_exercise_id=planned_id,
        set_number=number,
        weight=weight,
        reps=10,
        rpe=8,
    )


def _workout(
    *,
    status: str = "in_progress",
    sets: tuple[int, ...] = (1,),
    target_sets: int = 3,
    equipment: str = "barbell",
) -> WorkoutSession:
    exercise = _exercise(10, equipment)
    planned = PlannedExercise(
        id=5,
        session_id=1,
        exercise_id=exercise.id,
        order=0,
        target_sets=target_sets,
        target_reps=10,
        suggested_weight=40,
        status="completed" if set(sets) == set(range(1, target_sets + 1)) else "in_progress",
    )
    planned.exercise = exercise
    planned.performed_sets = [_performed(planned.id, number) for number in sets]
    for performed in planned.performed_sets:
        performed.planned_exercise = planned
    workout = WorkoutSession(id=1, status=status, telegram_user_id=42)
    workout.planned_exercises = [planned]
    return workout


def _cardio_workout() -> WorkoutSession:
    exercise = Exercise(
        id=20,
        name="Bicicleta",
        muscle_group="cardiovascular",
        body_part="cardio",
        equipment="stationary bike",
        activity_type="cardio",
    )
    planned = PlannedExercise(
        id=6,
        session_id=2,
        exercise_id=exercise.id,
        target_sets=1,
        target_duration_minutes=20,
        status="pending",
    )
    planned.exercise = exercise
    planned.performed_sets = []
    workout = WorkoutSession(id=2, status="planned", telegram_user_id=42)
    workout.planned_exercises = [planned]
    return workout


def _client(workout: WorkoutSession, user_id: int = 42, catalog: dict[int, Exercise] | None = None):
    memory = MemorySession(workout)
    original_get = memory.get

    async def get_catalog(model, primary_key):
        if model is Exercise and catalog:
            return catalog.get(primary_key)
        return await original_get(model, primary_key)

    memory.get = get_catalog  # type: ignore[method-assign]

    async def fake_get_session() -> AsyncGenerator:
        yield memory

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id
    try:
        yield TestClient(app), memory
    finally:
        app.dependency_overrides.clear()


def test_restore_middle_set_returns_fresh_completed_session() -> None:
    workout = _workout(sets=(1, 3), target_sets=3)
    gen = _client(workout)
    client, db = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets/restore",
        json={"set_number": 2, "weight": 40, "reps": 10, "rpe": 8},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    restored = response.json()["planned_exercises"][0]
    assert restored["status"] == "completed"
    assert [item["set_number"] for item in restored["performed_sets"]] == [1, 2, 3]
    db.expire_all.assert_called_once()


def test_delete_middle_set_reopens_completed_session_and_exercise() -> None:
    workout = _workout(status="completed", sets=(1, 2, 3), target_sets=3)
    gen = _client(workout)
    client, _ = next(gen)

    response = client.delete("/api/sessions/1/exercises/5/sets/2")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "in_progress"
    assert body["planned_exercises"][0]["status"] == "in_progress"
    assert [item["set_number"] for item in body["planned_exercises"][0]["performed_sets"]] == [1, 3]


def test_correction_endpoints_enforce_session_ownership() -> None:
    workout = _workout(sets=(1,))
    gen = _client(workout, user_id=7)
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets/restore",
        json={"set_number": 2, "weight": 40, "reps": 10},
    )

    assert response.status_code == 403


def test_log_set_refills_the_earliest_missing_middle_number() -> None:
    workout = _workout(sets=(1, 3), target_sets=3)
    gen = _client(workout)
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets",
        json={"set_number": 2, "weight": 40, "reps": 10},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert [item["set_number"] for item in body["planned_exercises"][0]["performed_sets"]] == [
        1,
        2,
        3,
    ]


def test_log_cardio_set_uses_duration_minutes() -> None:
    gen = _client(_cardio_workout())
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/2/exercises/6/sets",
        json={"set_number": 1, "duration_minutes": 24},
    )

    assert response.status_code == 200
    performed = response.json()["planned_exercises"][0]["performed_sets"][0]
    assert performed["duration_minutes"] == 24
    assert performed["reps"] is None
    assert performed["weight_mode"] is None


def test_log_cardio_set_rejects_reps_contract() -> None:
    gen = _client(_cardio_workout())
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/2/exercises/6/sets",
        json={"set_number": 1, "reps": 24},
    )

    assert response.status_code == 422
    assert "Cardio requires duration_minutes" in response.json()["detail"]


def test_swap_strength_to_cardio_in_single_update() -> None:
    workout = _workout(sets=(), target_sets=3)
    replacement = _exercise(20, "stationary bike", activity_type="cardio")
    gen = _client(workout, catalog={20: replacement})
    client, _ = next(gen)

    response = client.put(
        "/api/sessions/1/exercises/5",
        json={"new_exercise_id": 20, "target_duration_minutes": 20},
    )

    assert response.status_code == 200
    planned = response.json()["planned_exercises"][0]
    assert planned["exercise_id"] == 20
    assert planned["target_duration_minutes"] == 20
    assert planned["target_reps"] is None
    assert planned["suggested_weight"] is None


def test_swap_cardio_to_strength_in_single_update() -> None:
    workout = _cardio_workout()
    replacement = _exercise(10, "barbell", activity_type="strength")
    gen = _client(workout, catalog={10: replacement})
    client, _ = next(gen)

    response = client.put(
        "/api/sessions/2/exercises/6",
        json={"new_exercise_id": 10, "target_reps": 12, "suggested_weight": 40},
    )

    assert response.status_code == 200
    planned = response.json()["planned_exercises"][0]
    assert planned["exercise_id"] == 10
    assert planned["target_reps"] == 12
    assert planned["suggested_weight"] == 40
    assert planned["target_duration_minutes"] is None


def test_reclassify_rejects_weighted_history_for_unloaded_exercise() -> None:
    workout = _workout(sets=(1,))
    replacement = _exercise(99, "band")
    gen = _client(workout, catalog={99: replacement})
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/reclassify",
        json={"new_exercise_id": 99, "reason": "corrección"},
    )

    assert response.status_code == 422
    assert "take no weight" in response.json()["detail"]
    assert workout.planned_exercises[0].exercise_id == 10


def test_reclassify_expires_and_returns_the_reloaded_exercise_relation() -> None:
    workout = _workout(sets=(1,))
    replacement = _exercise(99, "machine")
    gen = _client(workout, catalog={99: replacement})
    client, db = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/reclassify",
        json={"new_exercise_id": 99, "reason": "nombre correcto"},
    )

    assert response.status_code == 200
    planned = response.json()["planned_exercises"][0]
    assert planned["exercise_id"] == 99
    assert planned["exercise"]["name"] == "Exercise 99"
    db.expire_all.assert_called_once()


def test_reorder_expires_stale_relationships_before_returning_response() -> None:
    first = _workout().planned_exercises[0]
    second = PlannedExercise(
        id=6,
        session_id=1,
        exercise_id=11,
        order=1,
        target_sets=3,
        target_reps=10,
        status="pending",
    )
    second.exercise = _exercise(11)
    second.performed_sets = []
    workout = WorkoutSession(id=1, status="in_progress", telegram_user_id=42)
    workout.planned_exercises = [first, second]
    gen = _client(workout)
    client, db = next(gen)

    response = client.put(
        "/api/sessions/1/exercises/reorder",
        json={"planned_exercise_ids": [6, 5]},
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["planned_exercises"]] == [6, 5]
    db.expire_all.assert_called_once()


def test_restore_unique_race_rolls_back_and_returns_409() -> None:
    workout = _workout(sets=(1,), target_sets=3)
    gen = _client(workout)
    client, db = next(gen)
    from sqlalchemy.exc import IntegrityError

    db.commit = AsyncMock(
        side_effect=IntegrityError("insert", {}, Exception("uq_performed_set_number"))
    )
    response = client.post(
        "/api/sessions/1/exercises/5/sets/restore",
        json={"set_number": 2, "weight": 40, "reps": 10},
    )

    assert response.status_code == 409
    db.rollback.assert_awaited_once()


@pytest.mark.parametrize("rpe", [0, 10.1])
def test_set_endpoints_reject_rpe_outside_one_to_ten(rpe: float) -> None:
    workout = _workout()
    gen = _client(workout)
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets/restore",
        json={"set_number": 2, "weight": 40, "reps": 10, "rpe": rpe},
    )

    assert response.status_code == 422
