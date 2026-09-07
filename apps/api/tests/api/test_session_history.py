import os
from collections.abc import AsyncGenerator
from datetime import date
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.features.sessions.routes import list_session_activity
from app.main import create_app
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeDb:
    def __init__(self):
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        if self.calls == 1:
            return FakeResult(
                [
                    SimpleNamespace(
                        id=10,
                        session_date="2026-09-07",
                        workout_count=2,
                        duration_actual=95,
                        total_volume=4200.0,
                    )
                ]
            )
        return FakeResult(
            [
                SimpleNamespace(
                    id=9,
                    session_date="2026-09-06",
                    title="Empuje",
                    status="completed",
                    energy=7,
                    duration_actual=48,
                    exercise_count=5,
                    total_sets=16,
                )
            ]
        )


def _client():
    fake_db = FakeDb()

    async def fake_get_session() -> AsyncGenerator:
        yield fake_db

    app = create_app()
    app.dependency_overrides[get_db_session] = fake_get_session
    app.dependency_overrides[current_user_id] = lambda: 42
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_activity_route_returns_aggregated_completed_days() -> None:
    gen = _client()
    client = next(gen)

    response = client.get("/api/sessions/activity?days=365")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 10,
            "session_date": "2026-09-07",
            "workout_count": 2,
            "duration_actual": 95,
            "total_volume": 4200.0,
        }
    ]


def test_list_sessions_accepts_offset_and_completed_filter() -> None:
    gen = _client()
    client = next(gen)

    client.get("/api/sessions/activity?days=365")
    response = client.get("/api/sessions?limit=20&offset=20&completed_only=true")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 9,
            "session_date": "2026-09-06",
            "title": "Empuje",
            "status": "completed",
            "energy": 7,
            "duration_actual": 48,
            "exercise_count": 5,
            "total_sets": 16,
        }
    ]


async def _fetch_real_activity_rows() -> list:
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(
        engine,
        tables=[
            Exercise.__table__,
            WorkoutSession.__table__,
            PlannedExercise.__table__,
            PerformedSet.__table__,
        ],
    )

    class AsyncSessionAdapter:
        def __init__(self, session: Session):
            self.session = session

        async def execute(self, statement):
            return self.session.execute(statement)

    training_day = date.today()
    with Session(engine) as db:
        press = Exercise(
            external_id="press-flat",
            name="Press banca",
            name_en="Bench Press",
            name_es="Press banca",
            muscle_group="chest",
            target="pectorals",
            body_part="chest",
            equipment="barbell",
            activity_type="strength",
        )
        row = Exercise(
            external_id="row-bar",
            name="Remo",
            name_en="Barbell row",
            name_es="Remo",
            muscle_group="back",
            target="lats",
            body_part="back",
            equipment="barbell",
            activity_type="strength",
        )
        db.add_all([press, row])
        db.flush()

        first = WorkoutSession(
            session_date=training_day,
            title="Empuje",
            status="completed",
            duration_actual=48,
            telegram_user_id=42,
        )
        second = WorkoutSession(
            session_date=training_day,
            title="Tiron",
            status="completed",
            duration_actual=30,
            telegram_user_id=42,
        )
        db.add_all([first, second])
        db.flush()

        first_planned = PlannedExercise(
            session_id=first.id,
            exercise_id=press.id,
            order=1,
            target_sets=3,
            target_reps=8,
            execution_metric="reps",
            status="completed",
        )
        second_planned = PlannedExercise(
            session_id=second.id,
            exercise_id=row.id,
            order=1,
            target_sets=2,
            target_reps=10,
            execution_metric="reps",
            status="completed",
        )
        db.add_all([first_planned, second_planned])
        db.flush()

        db.add_all(
            [
                PerformedSet(planned_exercise_id=first_planned.id, set_number=1, weight=80, reps=8),
                PerformedSet(planned_exercise_id=first_planned.id, set_number=2, weight=80, reps=8),
                PerformedSet(planned_exercise_id=first_planned.id, set_number=3, weight=80, reps=8),
                PerformedSet(
                    planned_exercise_id=second_planned.id,
                    set_number=1,
                    weight=60,
                    reps=10,
                ),
                PerformedSet(
                    planned_exercise_id=second_planned.id,
                    set_number=2,
                    weight=60,
                    reps=10,
                ),
            ]
        )
        db.commit()

    with Session(engine) as db:
        rows = await list_session_activity(days=365, db=AsyncSessionAdapter(db), user_id=42)

    return rows


def test_activity_route_uses_real_sql_without_duplicating_session_duration() -> None:
    rows = __import__("asyncio").run(_fetch_real_activity_rows())

    assert len(rows) == 1
    assert rows[0].session_date == date.today()
    assert rows[0].workout_count == 2
    assert rows[0].duration_actual == 78
    assert rows[0].total_volume == 3120.0
