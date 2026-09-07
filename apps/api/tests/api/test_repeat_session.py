import os
from collections.abc import AsyncGenerator
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


def _source_session(status: str = "completed", user_id: int = 42) -> WorkoutSession:
    timed = Exercise(
        id=10,
        name="Farmer Carry",
        muscle_group="forearms",
        equipment="trap bar",
        activity_type="strength",
    )
    classic = Exercise(
        id=11,
        name="Bench Press",
        muscle_group="chest",
        equipment="barbell",
        activity_type="strength",
    )
    first = PlannedExercise(
        id=5,
        session_id=1,
        exercise_id=timed.id,
        order=0,
        target_sets=2,
        execution_metric="duration_seconds",
        target_duration_seconds=40,
        suggested_weight=32.5,
        unilateral=True,
        superset_group="A",
        notes="agarre firme",
        set_targets=[
            {"set_number": 1, "weight": 32.5, "duration_seconds": 40},
            {"set_number": 2, "weight": 32.5, "duration_seconds": 45},
        ],
        status="completed",
    )
    second = PlannedExercise(
        id=6,
        session_id=1,
        exercise_id=classic.id,
        order=1,
        target_sets=3,
        execution_metric="reps",
        target_reps=8,
        suggested_weight=80,
        notes="pausa abajo",
        status="completed",
    )
    first.exercise = timed
    second.exercise = classic
    first.performed_sets = [
        PerformedSet(id=1, planned_exercise_id=5, set_number=1, weight=32.5, duration_seconds=40)
    ]
    second.performed_sets = [
        PerformedSet(id=2, planned_exercise_id=6, set_number=1, weight=80, reps=8)
    ]
    session = WorkoutSession(
        id=1,
        session_date=date(2026, 9, 1),
        title="Empuje",
        goal="fuerza",
        status=status,
        energy=7,
        discomfort="",
        duration_estimated=55,
        duration_actual=48,
        feedback="sólida",
        coach_summary="buen bloque",
        share_token="source-token",
        telegram_user_id=user_id,
    )
    session.planned_exercises = [first, second]
    return session


def _client(workout: WorkoutSession, user_id: int = 42):
    fake_db = AsyncMock()
    fake_db.add = MagicMock()
    fake_db.flush = AsyncMock()
    fake_db.commit = AsyncMock()

    added_sessions: list[WorkoutSession] = []
    added_plans: list[PlannedExercise] = []

    def add(value: object) -> None:
        if isinstance(value, WorkoutSession):
            value.id = 99
            added_sessions.append(value)
        elif isinstance(value, PlannedExercise):
            value.id = 200 + len(added_plans)
            added_plans.append(value)

    fake_db.add.side_effect = add

    async def fake_load_session(session_id, db):
        if session_id == 1:
            return workout
        repeated = added_sessions[0]
        repeated.planned_exercises = added_plans
        for planned in repeated.planned_exercises:
            planned.exercise = next(
                source.exercise
                for source in workout.planned_exercises
                if source.exercise_id == planned.exercise_id
            )
            planned.performed_sets = []
        return repeated

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: user_id

    import app.features.sessions.routes as routes_mod

    original_load = routes_mod.load_session
    routes_mod.load_session = fake_load_session
    try:
        client = TestClient(app)
        yield client, fake_db, added_sessions, added_plans
    finally:
        routes_mod.load_session = original_load
        app.dependency_overrides.clear()


def test_repeat_completed_session_clones_prescriptions_for_today() -> None:
    gen = _client(_source_session())
    client, _, added_sessions, added_plans = next(gen)

    response = client.post("/api/sessions/1/repeat")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == 99
    assert body["session_date"] == date.today().isoformat()
    assert body["status"] == "planned"
    assert body["share_token"] != "source-token"
    assert len(body["planned_exercises"]) == 2
    assert all(item["performed_sets"] == [] for item in body["planned_exercises"])
    assert body["planned_exercises"][0]["execution_metric"] == "duration_seconds"
    assert body["planned_exercises"][0]["target_duration_seconds"] == 40
    assert body["planned_exercises"][0]["unilateral"] is True
    assert body["planned_exercises"][0]["superset_group"] == "A"
    assert body["planned_exercises"][0]["set_targets"][1]["duration_seconds"] == 45
    assert added_sessions[0].feedback == ""
    assert added_sessions[0].duration_actual == 0
    assert added_plans[0].status == "pending"


def test_repeat_requires_completed_source_session() -> None:
    gen = _client(_source_session(status="in_progress"))
    client, _, added_sessions, added_plans = next(gen)

    response = client.post("/api/sessions/1/repeat")

    assert response.status_code == 422
    assert added_sessions == []
    assert added_plans == []


def test_repeat_enforces_session_owner() -> None:
    gen = _client(_source_session(user_id=42), user_id=7)
    client, _, added_sessions, _ = next(gen)

    response = client.post("/api/sessions/1/repeat")

    assert response.status_code == 403
    assert added_sessions == []
