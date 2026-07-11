import pytest
from pydantic import ValidationError

from app.schemas.profile import AthleteMeasurementIn
from app.schemas.sessions import CoachPlanRequest, PlannedExerciseCreate


@pytest.mark.parametrize("field,value", [("weight_kg", -1), ("body_fat_pct", 101)])
def test_measurements_reject_invalid_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        AthleteMeasurementIn(**{field: value})


def test_plan_rejects_duplicate_orders() -> None:
    exercise = PlannedExerciseCreate(exercise_id=1, order=0)
    with pytest.raises(ValidationError):
        CoachPlanRequest(exercises=[exercise, exercise.model_copy(update={"exercise_id": 2})])
