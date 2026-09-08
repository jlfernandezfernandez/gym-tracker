"""Per-set targets: schema validation and current_state derivation."""

import pytest

from app.features.sessions.schemas import CoachPlanRequest, PlannedExerciseCreate, SetTarget
from app.features.sessions.service import current_state
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


@pytest.mark.parametrize("mode", ["validation", "serialization"])
def test_set_target_json_schema_keeps_optional_nullable_weight_contract(mode):
    schema = SetTarget.model_json_schema(mode=mode)
    assert "weight" not in schema["required"]
    assert schema["properties"]["weight"]["anyOf"] == [
        {"exclusiveMinimum": 0, "type": "number"},
        {"type": "null"},
    ]
    assert "null or omitted" in schema["properties"]["weight"]["description"]
    assert schema["properties"]["unloaded"]["default"] is False
    assert "unloaded" not in schema["required"]


def test_current_state_inherits_previous_null_weight_and_ignores_later_sets():
    workout = _make_workout_with_set_targets(
        [{"set_number": 2, "reps": 12}],
        [
            PerformedSet(id=3, planned_exercise_id=1, set_number=3, weight=60, reps=8),
            PerformedSet(id=1, planned_exercise_id=1, set_number=1, weight=None, reps=10),
        ],
    )
    assert current_state(workout)["next_set_target"]["weight"] is None
    assert current_state(workout)["next_set_target"]["unloaded"] is True


@pytest.mark.parametrize(
    "weight_fields",
    [{}, {"weight": None}, {"weight": 35}, {"unloaded": True}, {"weight": None, "unloaded": True}],
)
def test_set_target_serialization_preserves_weight_presence_and_other_defaults(weight_fields):
    target = SetTarget(set_number=1, reps=12, rpe=8, **weight_fields)
    expected = {
        "set_number": 1,
        "reps": 12,
        "duration_minutes": None,
        "duration_seconds": None,
        "is_warmup": False,
        "rpe": 8,
        "rir": 2,
        **weight_fields,
    }
    assert target.model_dump() == expected
    spec = PlannedExerciseCreate(exercise_id=1, target_reps=10, set_targets=[target])
    assert spec.model_dump(mode="json")["set_targets"] == [expected]


@pytest.mark.parametrize(
    "weight_fields",
    [
        {},
        {"weight": None},
        {"weight": None, "unloaded": False},
        {"weight": 35},
        {"weight": None, "unloaded": True},
        {"unloaded": True},
    ],
)
@pytest.mark.parametrize("previous", [False, True])
def test_current_state_resolves_target_weight_without_mutating_storage(weight_fields, previous):
    target = {"set_number": 2 if previous else 1, "reps": 12, **weight_fields}
    performed = (
        [PerformedSet(id=1, planned_exercise_id=1, set_number=1, weight=40, reps=10)]
        if previous
        else []
    )
    workout = _make_workout_with_set_targets([target], performed)
    workout.planned_exercises[0].suggested_weight = 50
    expected = (
        None
        if weight_fields.get("unloaded")
        else weight_fields.get("weight") or (40 if previous else 50)
    )
    assert current_state(workout)["next_set_target"] == {**target, "weight": expected}
    assert workout.planned_exercises[0].set_targets == [target]


def test_unloaded_target_rejects_positive_weight():
    with pytest.raises(ValueError, match="unloaded"):
        SetTarget(set_number=1, reps=10, weight=35, unloaded=True)


def test_unloaded_false_is_omitted_from_serialization():
    assert "unloaded" not in SetTarget(set_number=1, reps=10, unloaded=False).model_dump()


def test_cardio_target_rejects_unloaded_marker():
    with pytest.raises(ValueError, match="unloaded"):
        SetTarget(set_number=1, duration_minutes=20, unloaded=True)


def test_unloaded_marker_survives_exclude_none_serialization():
    target = SetTarget(set_number=1, reps=10, weight=None, unloaded=True)
    payload = target.model_dump(exclude_none=True)
    assert "weight" not in payload
    assert payload["unloaded"] is True
    assert SetTarget.model_validate(payload).unloaded is True


def test_planned_exercise_create_with_set_targets():
    """PlannedExerciseCreate accepts optional set_targets."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        target_sets=3,
        target_reps=10,
        suggested_weight=40.0,
        set_targets=[
            SetTarget(set_number=1, weight=40, reps=12),
            SetTarget(set_number=2, weight=45, reps=10),
            SetTarget(set_number=3, weight=50, reps=8),
        ],
    )
    assert spec.set_targets is not None
    assert len(spec.set_targets) == 3
    assert spec.set_targets[2].weight == 50


def test_planned_exercise_create_without_set_targets():
    """set_targets remain optional when the strength metric is explicit."""
    spec = PlannedExerciseCreate(exercise_id=1, order=0, target_reps=10)
    assert spec.set_targets is None


def test_coach_plan_request_with_set_targets():
    """CoachPlanRequest serializes set_targets through."""
    request = CoachPlanRequest(
        title="Test",
        exercises=[
            PlannedExerciseCreate(
                exercise_id=1,
                order=0,
                target_sets=2,
                target_reps=10,
                set_targets=[
                    SetTarget(set_number=1, weight=30, reps=15),
                    SetTarget(set_number=2, weight=35, reps=12),
                ],
            )
        ],
    )
    assert request.exercises[0].set_targets is not None
    assert len(request.exercises[0].set_targets) == 2


def _make_workout_with_set_targets(set_targets, performed_sets=None):
    """Build a minimal in-memory workout for current_state testing."""
    exercise = Exercise(id=1, name="Test", muscle_group="chest")
    planned = PlannedExercise(
        id=1,
        session_id=1,
        exercise_id=1,
        order=0,
        target_sets=3,
        target_reps=10,
        suggested_weight=40.0,
        status="in_progress",
        set_targets=set_targets,
    )
    planned.exercise = exercise
    planned.performed_sets = performed_sets or []
    workout = WorkoutSession(id=1, status="in_progress")
    workout.planned_exercises = [planned]
    return workout


def test_current_state_includes_next_set_target():
    """current_state returns the matching set target for the next set."""
    targets = [
        {"set_number": 1, "weight": 40, "reps": 12},
        {"set_number": 2, "weight": 45, "reps": 10},
        {"set_number": 3, "weight": 50, "reps": 8},
    ]
    workout = _make_workout_with_set_targets(targets)
    state = current_state(workout)
    assert state["next_set_target"] == {"set_number": 1, "weight": 40, "reps": 12}


def test_current_state_next_set_target_after_logged():
    """After logging set 1, next_set_target points to set 2."""
    targets = [
        {"set_number": 1, "weight": 40, "reps": 12},
        {"set_number": 2, "weight": 45, "reps": 10},
        {"set_number": 3, "weight": 50, "reps": 8},
    ]
    performed = [
        PerformedSet(id=1, planned_exercise_id=1, set_number=1, weight=35, reps=15),
    ]
    workout = _make_workout_with_set_targets(targets, performed)
    state = current_state(workout)
    assert state["current_set_number"] == 2
    assert state["next_set_target"] == {"set_number": 2, "weight": 45, "reps": 10}


def test_current_state_no_set_targets():
    """Without per-set overrides, current state has no next_set_target."""
    workout = _make_workout_with_set_targets(None)
    state = current_state(workout)
    assert state["next_set_target"] is None


def test_current_state_completed_session_keeps_full_contract_shape():
    """Completed sessions still emit every current_state key with null-safe values."""
    exercise = Exercise(id=1, name="Test", muscle_group="chest")
    planned = PlannedExercise(
        id=1,
        session_id=1,
        exercise_id=1,
        order=0,
        target_sets=1,
        target_reps=10,
        suggested_weight=40.0,
        status="completed",
    )
    planned.exercise = exercise
    planned.performed_sets = [
        PerformedSet(id=1, planned_exercise_id=1, set_number=1, weight=40, reps=10)
    ]
    workout = WorkoutSession(id=1, status="completed", planned_exercises=[planned])

    state = current_state(workout)

    assert set(state) == {
        "session_id",
        "session_status",
        "current_planned_exercise_id",
        "current_exercise_id",
        "current_exercise_name",
        "current_set_number",
        "target_sets",
        "execution_metric",
        "target_reps",
        "target_duration_minutes",
        "target_duration_seconds",
        "suggested_weight",
        "weight_mode",
        "activity_type",
        "next_set_target",
        "exercise_order",
        "exercise_count",
        "completed_exercises",
        "completed_sets",
        "total_sets",
        "is_complete",
    }
    assert state["session_status"] == "completed"
    assert state["current_planned_exercise_id"] is None
    assert state["current_exercise_id"] is None
    assert state["current_exercise_name"] in (None, "")
    assert state["current_set_number"] is None
    assert state["target_sets"] is None
    assert state["execution_metric"] is None
    assert state["target_reps"] is None
    assert state["target_duration_minutes"] is None
    assert state["target_duration_seconds"] is None
    assert state["suggested_weight"] is None
    assert state["weight_mode"] is None
    assert state["activity_type"] is None
    assert state["next_set_target"] is None
    assert state["exercise_order"] is None
    assert state["exercise_count"] == 1
    assert state["completed_exercises"] == 1
    assert state["completed_sets"] == 1
    assert state["total_sets"] == 1
    assert state["is_complete"] is True


def test_set_targets_can_be_sparse():
    """set_targets are sparse overrides; fewer targets than target_sets is valid."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        target_sets=3,
        target_reps=10,
        set_targets=[
            SetTarget(set_number=1, weight=40, reps=12),
            SetTarget(set_number=2, weight=45, reps=10),
        ],
    )
    assert len(spec.set_targets) == 2


def test_set_targets_no_duplicate_set_numbers():
    """set_targets cannot have duplicate set_number values."""
    import pytest

    with pytest.raises(ValueError, match="duplicate set_number"):
        PlannedExerciseCreate(
            exercise_id=1,
            order=0,
            target_sets=3,
            target_reps=10,
            set_targets=[
                SetTarget(set_number=1, weight=40, reps=12),
                SetTarget(set_number=1, weight=45, reps=10),
                SetTarget(set_number=2, weight=50, reps=8),
            ],
        )


def test_set_targets_beyond_target_sets_trimmed_by_update_route():
    """Schema accepts set_number > target_sets (sparse); the update route trims orphans."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        target_sets=3,
        target_reps=10,
        set_targets=[SetTarget(set_number=4, weight=50, reps=8)],
    )
    assert spec.set_targets is not None
    assert spec.set_targets[0].set_number == 4


def test_set_targets_can_be_nullable():
    """Schemas and models allow None for weights."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        target_reps=10,
        suggested_weight=None,
        set_targets=[
            SetTarget(set_number=1, weight=None, reps=10),
        ],
    )
    assert spec.suggested_weight is None
    assert spec.set_targets is not None
    assert spec.set_targets[0].weight is None

    pe = PlannedExercise(
        session_id=1,
        exercise_id=1,
        order=0,
        target_reps=10,
        suggested_weight=None,
        set_targets=[{"set_number": 1, "weight": None, "reps": 10}],
    )
    pe.exercise = Exercise(id=1, name="Machine row", muscle_group="back", equipment="machine")
    assert pe.suggested_weight is None
    assert pe.weight_mode == "unloaded"
