"""Per-set targets: schema validation and current_state derivation."""

from app.features.sessions.schemas import CoachPlanRequest, PlannedExerciseCreate, SetTarget
from app.features.sessions.service import current_state
from app.models import Exercise, PerformedSet, PlannedExercise, WorkoutSession


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
    """set_targets defaults to None for backward compatibility."""
    spec = PlannedExerciseCreate(exercise_id=1, order=0)
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
    """Without set_targets, next_set_target is None (backward compat)."""
    workout = _make_workout_with_set_targets(None)
    state = current_state(workout)
    assert state["next_set_target"] is None


def test_set_targets_can_be_sparse():
    """set_targets are sparse overrides; fewer targets than target_sets is valid."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        target_sets=3,
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
        set_targets=[SetTarget(set_number=4, weight=50, reps=8)],
    )
    assert spec.set_targets is not None
    assert spec.set_targets[0].set_number == 4


def test_set_targets_can_be_nullable():
    """Schemas and models allow None for weights."""
    spec = PlannedExerciseCreate(
        exercise_id=1,
        order=0,
        suggested_weight=None,
        set_targets=[
            SetTarget(set_number=1, weight=None, reps=10),
        ],
    )
    assert spec.suggested_weight is None
    assert spec.set_targets[0].weight is None

    pe = PlannedExercise(
        session_id=1,
        exercise_id=1,
        order=0,
        suggested_weight=None,
        set_targets=[{"set_number": 1, "weight": None, "reps": 10}],
    )
    assert pe.suggested_weight is None
    assert pe.weight_mode == "unloaded"
