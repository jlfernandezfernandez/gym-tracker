"""Weight is NULL or > 0; unloaded equipment takes no weight at all."""

import os

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")

from app.features.sessions.schemas import PerformedSetCreate, PlannedExerciseCreate
from app.features.sessions.service import validate_exercise_weight
from app.models import Exercise


def test_zero_and_negative_weights_are_rejected_by_schemas():
    for bad_weight in (0, -1):
        with pytest.raises(ValidationError):
            PerformedSetCreate(set_number=1, weight=bad_weight, reps=10)
        with pytest.raises(ValidationError):
            PlannedExerciseCreate(exercise_id=1, suggested_weight=bad_weight)


def test_null_weight_is_accepted():
    assert PerformedSetCreate(set_number=1, reps=10).weight is None
    assert PlannedExerciseCreate(exercise_id=1).suggested_weight is None


def test_unloaded_equipment_rejects_any_weight():
    band = Exercise(id=1, name="Curl con goma", muscle_group="biceps", equipment="band")
    with pytest.raises(HTTPException) as error:
        validate_exercise_weight(band, 20.0)
    assert error.value.status_code == 422
    validate_exercise_weight(band, None)


def test_loaded_equipment_accepts_weight_or_null():
    barbell = Exercise(id=2, name="Sentadilla", muscle_group="quads", equipment="barbell")
    validate_exercise_weight(barbell, 80.0)
    validate_exercise_weight(barbell, None)
