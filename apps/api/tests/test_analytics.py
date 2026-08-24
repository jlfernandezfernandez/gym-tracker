from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.features.coach.importer import parse_tracker_csv
from app.features.coach.onerm import calculate_1rm
from app.features.coach.progression import recommend_progression
from app.features.coach.recovery import calculate_muscle_readiness


def test_onerm_calculations():
    # 1 rep is exact measurement
    assert calculate_1rm(100.0, 1) == 100.0
    # Epley: 100 * (1 + 10/30) = 133.3
    assert calculate_1rm(100.0, 10) == 133.3
    # Above REP_CAP (12) returns None
    assert calculate_1rm(100.0, 13) is None
    # 0 or negative weight / reps
    assert calculate_1rm(0.0, 5) is None
    assert calculate_1rm(100.0, 0) is None
    assert calculate_1rm(None, 5) is None


def test_muscle_recovery_exponential_decay():
    now = datetime.now(UTC).replace(tzinfo=None)
    ex = SimpleNamespace(
        muscle_group="chest",
        secondary_muscles="triceps,shoulders",
        target="pectorals",
        body_part="chest",
        is_cardio=False,
    )
    set1 = SimpleNamespace(weight=100.0, reps=10, is_warmup=False, duration_minutes=None)
    pe = SimpleNamespace(exercise=ex, performed_sets=[set1])

    # 1 day ago session (24h ago vs 36h half-life)
    session_recent = SimpleNamespace(
        status="completed",
        started_at=now - timedelta(hours=24),
        session_date=(now - timedelta(hours=24)).date(),
        planned_exercises=[pe],
    )

    res = calculate_muscle_readiness([session_recent], now=now)
    assert "chest" in res["muscles"]
    chest_state = res["muscles"]["chest"]
    assert chest_state["status"] in ("recovering", "fatigued")
    assert chest_state["readiness_pct"] < 100
    assert "triceps" in res["muscles"]


def test_progression_recommendations():
    # Linear: all hit -> +2.5kg for upper body
    hist = [
        {
            "date": "2026-08-01",
            "top_weight": 80.0,
            "sets": [{"weight": 80.0, "reps": 10, "is_warmup": False}],
        }
    ]
    rec = recommend_progression(
        exercise_id=1,
        exercise_name="Bench Press",
        body_part="chest",
        activity_type="strength",
        history=hist,
        policy="linear",
        target_reps=10,
    )
    assert rec["suggested_weight"] == 82.5
    assert rec["kind"] == "increase"

    # Greyskull: 20 reps on AMRAP (2x target) -> double jump (+5.0kg)
    hist_amrap = [
        {
            "date": "2026-08-01",
            "top_weight": 80.0,
            "sets": [
                {"weight": 80.0, "reps": 10, "is_warmup": False},
                {"weight": 80.0, "reps": 10, "is_warmup": False},
                {"weight": 80.0, "reps": 20, "is_warmup": False},
            ],
        }
    ]
    rec_gs = recommend_progression(
        exercise_id=1,
        exercise_name="Bench Press",
        body_part="chest",
        activity_type="strength",
        history=hist_amrap,
        policy="greyskull",
        target_reps=10,
    )
    assert rec_gs["suggested_weight"] == 85.0
    assert rec_gs["kind"] == "double_jump"


def test_hevy_csv_parsing():
    sample_hevy_csv = (
        "Date,Workout Name,Exercise_Title,Set Order,Weight (kg),Reps,Distance,Duration,RPE,"
        "Set Type,Notes\n"
        "2026-08-20 18:00:00,Upper Body,Bench Press (Barbell),1,80,10,,,8,normal,Smooth\n"
        "2026-08-20 18:00:00,Upper Body,Bench Press (Barbell),2,80,8,,,9,normal,\n"
        "2026-08-20 18:00:00,Upper Body,Incline Dumbbell Press,1,28,10,,,8,normal,\n"
    )
    workouts = parse_tracker_csv(sample_hevy_csv)
    assert len(workouts) == 1
    assert workouts[0]["session_date"] == "2026-08-20"
    assert workouts[0]["title"] == "Upper Body"
    assert len(workouts[0]["exercises"]) == 2
    bench = workouts[0]["exercises"][0]
    assert len(bench["sets"]) == 2
    assert bench["sets"][0]["weight"] == 80.0
    assert bench["sets"][0]["reps"] == 10
