"""HTTP regression tests for reversible workout corrections.

The routes run through the real FastAPI application.  The persistence seam is a
small in-memory async double so every assertion is about endpoint semantics,
not a mocked route function.
"""

import os
from collections.abc import AsyncGenerator
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, SetLogReceipt, WorkoutSession


class MemorySession:
    def __init__(self, workout: WorkoutSession):
        self.workout = workout
        self.added: list[object] = []
        self.receipts: dict[str, SetLogReceipt] = {}
        self.expire_all = MagicMock()
        self.flush = AsyncMock(side_effect=self.assign_ids)
        self.rollback = AsyncMock()

    async def assign_ids(self) -> None:
        for value in self.added:
            if isinstance(value, PerformedSet):
                value.id = value.id or 100 + value.set_number

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
        if model is SetLogReceipt:
            return self.receipts.get(primary_key)
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
            if isinstance(value, SetLogReceipt):
                self.receipts[value.request_id] = value
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


def _timed_strength_workout() -> WorkoutSession:
    exercise = Exercise(
        id=30,
        name="Farmer Carry",
        muscle_group="forearms",
        body_part="upper arms",
        equipment="trap bar",
        activity_type="strength",
    )
    planned = PlannedExercise(
        id=7,
        session_id=3,
        exercise_id=exercise.id,
        target_sets=2,
        target_reps=None,
        target_duration_minutes=None,
        status="pending",
        suggested_weight=32.5,
        set_targets=[
            {"set_number": 1, "weight": 32.5, "duration_seconds": 40},
            {"set_number": 2, "weight": 32.5, "duration_seconds": 40},
        ],
        execution_metric="duration_seconds",
        target_duration_seconds=40,
    )
    planned.exercise = exercise
    planned.performed_sets = []
    workout = WorkoutSession(id=3, status="planned", telegram_user_id=42)
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


@pytest.mark.parametrize(
    "changes,expected_rpe,expected_rir",
    [
        ({"reps": 12}, 8, 2),
        ({"weight": None}, 8, 2),
        ({"notes": "corrected"}, 8, 2),
        ({"rpe": None}, None, 2),
        ({"rir": None}, 8, None),
        ({"rpe": None, "rir": None}, None, None),
        ({"rpe": 9}, 9, 1),
        ({"rir": 3}, 7, 3),
        ({"rpe": 9, "rir": None}, 9, None),
        ({"rpe": None, "rir": 3}, None, 3),
        ({"rpe": 9, "rir": 3}, 9, 3),
        ({"rir": 0}, 10, 0),
        ({"rir": 10}, 1, 10),
        ({"rpe": 1}, 1, 9),
        ({"rpe": 10}, 10, 0),
        ({"rpe": 8.7}, 8.7, 1.3),
        ({"rir": 1.3}, 8.7, 1.3),
    ],
)
def test_patch_set_effort_preserves_omission_and_explicit_null(
    changes, expected_rpe, expected_rir
) -> None:
    workout = _workout()
    performed = workout.planned_exercises[0].performed_sets[0]
    performed.rir = 2
    gen = _client(workout)
    client, _ = next(gen)

    response = client.patch("/api/sessions/1/exercises/5/sets/1", json=changes)

    assert response.status_code == 200, response.text
    updated = response.json()["planned_exercises"][0]["performed_sets"][0]
    assert (updated["rpe"], updated["rir"]) == (expected_rpe, expected_rir)
    assert (performed.rpe, performed.rir) == (expected_rpe, expected_rir)
    assert updated["reps"] == changes.get("reps", 10)
    assert updated["weight"] == changes.get("weight", 40)
    saved = client.get("/api/sessions/1").json()["planned_exercises"][0]["performed_sets"][0]
    assert saved == updated


@pytest.mark.parametrize(
    "effort,expected_rpe,expected_rir",
    [
        ({}, None, None),
        ({"rpe": None}, None, None),
        ({"rir": None}, None, None),
        ({"rpe": None, "rir": None}, None, None),
        ({"rpe": 9}, 9, 1),
        ({"rir": 3}, 7, 3),
        ({"rpe": 9, "rir": None}, 9, 1),
        ({"rpe": None, "rir": 3}, 7, 3),
        ({"rpe": 9, "rir": 3}, 9, 3),
        ({"rir": 0}, 10, 0),
        ({"rir": 10}, 1, 10),
    ],
)
def test_log_set_keeps_creation_effort_derivation(effort, expected_rpe, expected_rir) -> None:
    workout = _workout(sets=())
    gen = _client(workout)
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets",
        json={"set_number": 1, "weight": 40, "reps": 10, **effort},
    )

    assert response.status_code == 200, response.text
    created = response.json()["planned_exercises"][0]["performed_sets"][0]
    assert (created["rpe"], created["rir"]) == (expected_rpe, expected_rir)
    saved = client.get("/api/sessions/1").json()["planned_exercises"][0]["performed_sets"][0]
    assert saved == created


@pytest.mark.parametrize("timed", [False, True])
def test_planned_metric_change_rejects_logged_sets_without_mutating_history(timed: bool) -> None:
    workout = _timed_strength_workout() if timed else _workout()
    planned = workout.planned_exercises[0]
    if timed:
        performed = _performed(planned.id, 1, weight=32.5)
        performed.reps = None
        performed.duration_seconds = 40
        planned.performed_sets = [performed]
    gen = _client(workout)
    client, _ = next(gen)
    path = f"/api/sessions/{workout.id}"
    before = client.get(path).json()

    response = client.put(
        f"{path}/exercises/{planned.id}",
        json={
            "execution_metric": "reps" if timed else "duration_seconds",
            **({"target_reps": 12} if timed else {"target_duration_seconds": 35}),
            "notes": "must not persist",
        },
    )

    assert response.status_code == 422
    assert "logged sets" in response.json()["detail"]
    assert client.get(path).json() == before


@pytest.mark.parametrize("prescription", [{}, {"set_targets": None}, {"set_targets": []}])
def test_replace_uses_new_global_targets_instead_of_previous_set_targets(prescription) -> None:
    workout = _workout(sets=())
    planned = workout.planned_exercises[0]
    planned.suggested_weight = 62.5
    planned.set_targets = [
        {"set_number": number, "weight": 62.5, "reps": 10} for number in range(1, 4)
    ]
    gen = _client(workout, catalog={20: _exercise(20, "dumbbell")})
    client, _ = next(gen)

    response = client.put(
        "/api/sessions/1/exercises/5",
        json={
            "new_exercise_id": 20,
            "suggested_weight": 15,
            "target_reps": 12,
            **prescription,
        },
    )

    assert response.status_code == 200
    updated = response.json()["planned_exercises"][0]
    assert updated["exercise_id"] == 20
    assert updated["suggested_weight"] == 15
    assert updated["target_reps"] == 12
    for target in updated["set_targets"] or []:
        assert target["weight"] == 15
        assert target["reps"] == 12
    current = client.get("/api/sessions/1/current").json()
    target = current["next_set_target"]
    assert (target["weight"] if target else current["suggested_weight"]) == 15
    assert (target["reps"] if target else current["target_reps"]) == 12
    assert client.get("/api/sessions/1").json()["planned_exercises"][0] == updated


def test_replace_preserves_explicit_set_targets_over_new_globals() -> None:
    workout = _workout(sets=())
    workout.planned_exercises[0].set_targets = [{"set_number": 1, "weight": 62.5, "reps": 10}]
    gen = _client(workout, catalog={20: _exercise(20, "dumbbell")})
    client, _ = next(gen)

    response = client.put(
        "/api/sessions/1/exercises/5",
        json={
            "new_exercise_id": 20,
            "suggested_weight": 15,
            "target_reps": 12,
            "set_targets": [{"set_number": 1, "weight": 10, "reps": 8, "is_warmup": True}],
        },
    )

    assert response.status_code == 200
    current = client.get("/api/sessions/1/current").json()
    assert current["suggested_weight"] == 15
    assert current["target_reps"] == 12
    assert current["next_set_target"]["weight"] == 10
    assert current["next_set_target"]["reps"] == 8
    assert current["next_set_target"]["is_warmup"] is True


def test_replace_only_id_preserves_global_prescription_and_plan_fields() -> None:
    workout = _workout(sets=())
    planned = workout.planned_exercises[0]
    planned.notes = "keep notes"
    planned.superset_group = "A"
    planned.unilateral = True
    planned.set_targets = [{"set_number": 1, "weight": 30, "reps": 15}]
    gen = _client(workout, catalog={20: _exercise(20, "dumbbell")})
    client, _ = next(gen)

    response = client.put("/api/sessions/1/exercises/5", json={"new_exercise_id": 20})

    assert response.status_code == 200
    updated = response.json()["planned_exercises"][0]
    assert updated["exercise_id"] == 20
    assert updated["target_sets"] == 3
    assert updated["suggested_weight"] == 40
    assert updated["target_reps"] == 10
    assert updated["notes"] == "keep notes"
    assert updated["superset_group"] == "A"
    assert updated["unilateral"] is True
    assert not updated["set_targets"]


def test_same_metric_update_preserves_logged_sets_and_per_set_targets() -> None:
    workout = _workout()
    workout.planned_exercises[0].set_targets = [{"set_number": 2, "weight": 45, "reps": 8}]
    gen = _client(workout)
    client, _ = next(gen)
    before = client.get("/api/sessions/1").json()["planned_exercises"][0]

    response = client.put(
        "/api/sessions/1/exercises/5",
        json={"execution_metric": "reps", "target_reps": 12, "suggested_weight": 42.5},
    )

    assert response.status_code == 200
    updated = response.json()["planned_exercises"][0]
    assert updated["target_reps"] == 12
    assert updated["suggested_weight"] == 42.5
    assert updated["performed_sets"] == before["performed_sets"]
    assert updated["set_targets"] == before["set_targets"]


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


def test_restore_middle_set_preserves_historical_completed_duration_and_clock() -> None:
    workout = _workout(status="completed", sets=(1, 3), target_sets=3)
    workout.started_at = None
    workout.duration_actual = 0
    gen = _client(workout)
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/1/exercises/5/sets/restore",
        json={"set_number": 2, "weight": 40, "reps": 10},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["duration_actual"] == 0
    assert body["planned_exercises"][0]["status"] == "completed"
    assert workout.started_at is None
    assert workout.duration_actual == 0


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


def test_patch_set_updates_values_without_recreating_or_reopening_completed_session() -> None:
    workout = _workout(status="completed", sets=(1, 2, 3), target_sets=3)
    workout.duration_actual = 47
    original_timestamp = datetime(2026, 9, 1, 12, 0)
    target_set = workout.planned_exercises[0].performed_sets[1]
    target_set.timestamp = original_timestamp
    gen = _client(workout)
    client, _ = next(gen)

    response = client.patch(
        "/api/sessions/1/exercises/5/sets/2",
        json={"weight": 42, "reps": 12, "rpe": 9},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["duration_actual"] == 47
    corrected = body["planned_exercises"][0]["performed_sets"][1]
    assert corrected["id"] == 2
    assert corrected["weight"] == 42
    assert corrected["reps"] == 12
    assert corrected["rpe"] == 9
    assert corrected["timestamp"] == "2026-09-01T12:00:00"
    assert workout.planned_exercises[0].performed_sets[1].timestamp == original_timestamp


def test_patch_set_rejects_switching_execution_metric() -> None:
    gen = _client(_workout(sets=(1,), target_sets=3))
    client, _ = next(gen)

    response = client.patch(
        "/api/sessions/1/exercises/5/sets/1",
        json={"duration_seconds": 45},
    )

    assert response.status_code == 422
    assert "Strength requires reps" in response.json()["detail"]


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


def test_log_timed_strength_set_uses_duration_seconds_and_optional_weight() -> None:
    gen = _client(_timed_strength_workout())
    client, _ = next(gen)

    response = client.post(
        "/api/sessions/3/exercises/7/sets",
        json={"set_number": 1, "duration_seconds": 45, "weight": 36},
    )

    assert response.status_code == 200
    body = response.json()
    logged = body["planned_exercises"][0]["performed_sets"][0]
    assert logged["duration_seconds"] == 45
    assert logged["reps"] is None
    assert logged["weight"] == 36
    assert body["planned_exercises"][0]["execution_metric"] == "duration_seconds"


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


def test_failed_swap_does_not_mutate_planned_exercise_before_validation() -> None:
    workout = _workout(sets=(), target_sets=3)
    replacement = _exercise(20, "band", activity_type="strength")
    original = workout.planned_exercises[0]
    gen = _client(workout, catalog={20: replacement})
    client, _ = next(gen)

    response = client.put(
        "/api/sessions/1/exercises/5",
        json={"status": "completed", "new_exercise_id": 20},
    )

    assert response.status_code == 422
    assert original.status == "in_progress"
    assert original.exercise_id == 10
    assert original.exercise.name == "Exercise 10"
    assert original.target_reps == 10
    assert original.target_duration_minutes is None
    assert original.target_duration_seconds is None


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
