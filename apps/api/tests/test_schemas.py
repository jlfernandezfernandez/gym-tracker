import pytest
from pydantic import ValidationError

from app.features.profile.schemas import AthleteMeasurementIn
from app.features.sessions.schemas import (
    CoachPlanRequest,
    ImportExercise,
    ImportSet,
    PlannedExerciseCreate,
)


@pytest.mark.parametrize("field,value", [("weight_kg", -1), ("body_fat_pct", 101)])
def test_measurements_reject_invalid_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        AthleteMeasurementIn(**{field: value})


def test_plan_rejects_duplicate_orders() -> None:
    exercise = PlannedExerciseCreate(exercise_id=1, order=0, target_reps=10)
    with pytest.raises(ValidationError):
        CoachPlanRequest(exercises=[exercise, exercise.model_copy(update={"exercise_id": 2})])


def test_plan_accepts_explicit_timed_strength_contract() -> None:
    exercise = PlannedExerciseCreate(
        exercise_id=3,
        order=0,
        target_sets=2,
        execution_metric="duration_seconds",
        target_duration_seconds=40,
        suggested_weight=32.5,
    )

    request = CoachPlanRequest(exercises=[exercise])

    assert request.exercises[0].execution_metric == "duration_seconds"
    assert request.exercises[0].target_duration_seconds == 40


def test_import_exercise_accepts_duration_seconds_sets() -> None:
    exercise = ImportExercise(
        exercise_id=3,
        execution_metric="duration_seconds",
        sets=[ImportSet(duration_seconds=45, weight=32.5)],
    )

    assert exercise.execution_metric == "duration_seconds"
    assert exercise.sets[0].duration_seconds == 45
