import asyncio
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.features.exercises.catalog import parse_exercise
from app.features.exercises.routes import exercise_progress
from app.features.sessions.schemas import (
    ImportSet,
    PlannedExerciseCreate,
    SetTarget,
)
from app.features.sessions.service import current_state, validate_exercise_metrics
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


def cardio() -> Exercise:
    return Exercise(
        id=1,
        name="Bicicleta estática",
        muscle_group="cardiovascular",
        body_part="cardio",
        equipment="stationary bike",
        activity_type="cardio",
    )


def strength() -> Exercise:
    return Exercise(
        id=2,
        name="Press banca",
        muscle_group="chest",
        body_part="upper arms",
        equipment="barbell",
        activity_type="strength",
    )


def test_catalog_classifies_cardio_deterministically() -> None:
    records = (
        ({"id": "bike", "name": "Bike", "target": "quadriceps", "body_part": "cardio"}, "cardio"),
        ({"id": "run", "name": "Run", "target": "cardiovascular", "body_part": "waist"}, "cardio"),
        ({"id": "press", "name": "Press", "target": "chest", "body_part": "chest"}, "strength"),
    )
    for record, activity_type in records:
        assert parse_exercise(record)["activity_type"] == activity_type


def test_cardio_plan_can_omit_optional_target_minutes() -> None:
    plan = PlannedExerciseCreate(exercise_id=1, target_sets=1, target_duration_minutes=20)
    assert plan.target_duration_minutes == 20
    assert plan.target_reps is None
    assert PlannedExerciseCreate(exercise_id=1, target_sets=1).target_duration_minutes is None


def test_plan_schema_leaves_exercise_specific_metric_validation_to_api() -> None:
    assert PlannedExerciseCreate(exercise_id=2, target_sets=3, target_reps=10).target_reps == 10
    assert PlannedExerciseCreate(exercise_id=2, target_sets=3).target_reps is None


def test_set_targets_and_import_sets_use_exactly_one_metric() -> None:
    assert SetTarget(set_number=1, duration_minutes=12).duration_minutes == 12
    assert ImportSet(duration_minutes=30).reps is None
    with pytest.raises(ValidationError):
        SetTarget(set_number=1, reps=10, duration_minutes=10)
    with pytest.raises(ValidationError):
        ImportSet(weight=20, reps=10, duration_minutes=10)


def test_metric_validation_is_exercise_specific() -> None:
    validate_exercise_metrics(cardio(), reps=None, duration_minutes=15, weight=None)
    validate_exercise_metrics(strength(), reps=10, duration_minutes=None, weight=40)
    for exercise, reps, minutes, weight in (
        (cardio(), 15, None, None),
        (cardio(), None, 15, 5),
        (strength(), None, 15, None),
    ):
        with pytest.raises(HTTPException) as error:
            validate_exercise_metrics(
                exercise,
                reps=reps,
                duration_minutes=minutes,
                weight=weight,
            )
        assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        validate_exercise_metrics(
            cardio(),
            reps=None,
            duration_minutes=20,
            weight=None,
            unilateral=True,
        )


def test_strength_and_unilateral_contract_is_unchanged() -> None:
    exercise = strength()
    planned = PlannedExercise(
        id=11,
        session_id=8,
        exercise_id=exercise.id,
        target_sets=3,
        target_reps=10,
        suggested_weight=40,
        unilateral=True,
        status="pending",
    )
    planned.exercise = exercise
    planned.performed_sets = []
    workout = WorkoutSession(id=8, status="planned", planned_exercises=[planned])

    state = current_state(workout)

    assert state["activity_type"] == "strength"
    assert state["target_reps"] == 10
    assert state["target_duration_minutes"] is None
    assert state["weight_mode"] == "weighted"
    assert planned.unilateral is True


def test_cardio_current_state_and_history_do_not_emit_reps_or_weight_mode() -> None:
    exercise = cardio()
    planned = PlannedExercise(
        id=10,
        session_id=7,
        exercise_id=exercise.id,
        target_sets=1,
        target_reps=None,
        target_duration_minutes=20,
        suggested_weight=None,
        status="in_progress",
    )
    planned.exercise = exercise
    planned.performed_sets = []
    workout = WorkoutSession(id=7, status="in_progress", planned_exercises=[planned])

    state = current_state(workout)

    assert state["activity_type"] == "cardio"
    assert state["target_duration_minutes"] == 20
    assert state["target_reps"] is None
    assert state["weight_mode"] is None

    performed = PerformedSet(
        id=4,
        planned_exercise_id=planned.id,
        set_number=1,
        reps=None,
        duration_minutes=22,
    )
    performed.planned_exercise = planned
    assert performed.weight_mode is None


def test_cardio_progress_reports_minutes_only() -> None:
    exercise = cardio()
    exercise.id = 7
    db = AsyncMock()
    db.get.return_value = exercise
    result = MagicMock()
    result.all.return_value = [(3, date(2026, 8, 1), None, None, 25, 0, 1)]
    db.execute.return_value = result

    progress = asyncio.run(exercise_progress(7, limit=20, db=db, user_id=42))

    assert progress == [
        {
            "session_id": 3,
            "date": "2026-08-01",
            "top_weight": None,
            "top_reps": None,
            "top_duration_minutes": 25,
            "volume": 0.0,
            "activity_type": "cardio",
            "weight_mode": None,
            "sets": 1,
        }
    ]
