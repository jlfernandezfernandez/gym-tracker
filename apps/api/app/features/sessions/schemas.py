from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SetTarget(BaseModel):
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, gt=0)
    reps: int | None = Field(default=None, ge=1)
    duration_minutes: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_metric(self) -> "SetTarget":
        if (self.reps is None) == (self.duration_minutes is None):
            raise ValueError("exactly one of reps or duration_minutes is required")
        return self


def _reject_duplicate_set_numbers(set_targets: list[SetTarget] | None) -> None:
    if set_targets is not None:
        set_numbers = [target.set_number for target in set_targets]
        if len(set_numbers) != len(set(set_numbers)):
            raise ValueError("set_targets contains duplicate set_number values")


def _require_one_metric(reps: int | None, duration_minutes: int | None) -> None:
    if (reps is None) == (duration_minutes is None):
        raise ValueError("exactly one of reps or duration_minutes is required")


class PlannedExerciseCreate(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int | None = Field(default=None, ge=1)
    target_duration_minutes: int | None = Field(default=None, ge=1)
    suggested_weight: float | None = Field(default=None, gt=0)
    unilateral: bool = False
    notes: str = ""
    set_targets: list[SetTarget] | None = None

    @model_validator(mode="after")
    def validate_metrics(self) -> "PlannedExerciseCreate":
        _reject_duplicate_set_numbers(self.set_targets)
        return self


class PerformedSetCreate(BaseModel):
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, gt=0)
    reps: int | None = Field(default=None, ge=1)
    duration_minutes: int | None = Field(default=None, ge=1)
    rpe: float | None = Field(default=None, ge=1, le=10)
    sensation: str = ""
    notes: str = ""

    @model_validator(mode="after")
    def validate_metric(self) -> "PerformedSetCreate":
        _require_one_metric(self.reps, self.duration_minutes)
        return self


class PerformedSetRestore(PerformedSetCreate):
    """Payload used by the short-lived undo action in the Mini App."""


class ExerciseReclassify(BaseModel):
    new_exercise_id: int = Field(gt=0)
    reason: str = Field(default="", max_length=500)


class SessionExerciseReorder(BaseModel):
    planned_exercise_ids: list[int] = Field(min_length=1)


class PlannedExerciseUpdate(BaseModel):
    status: Literal["pending", "in_progress", "completed", "skipped"] | None = None
    new_exercise_id: int | None = None
    target_sets: int | None = Field(default=None, ge=1, le=20)
    target_reps: int | None = Field(default=None, ge=1)
    target_duration_minutes: int | None = Field(default=None, ge=1)
    suggested_weight: float | None = Field(default=None, gt=0)
    notes: str | None = None
    set_targets: list[SetTarget] | None = None
    unilateral: bool | None = None

    @model_validator(mode="after")
    def validate_set_targets(self) -> "PlannedExerciseUpdate":
        _reject_duplicate_set_numbers(self.set_targets)
        return self


class AddExerciseRequest(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int | None = Field(default=None, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int | None = Field(default=None, ge=1)
    target_duration_minutes: int | None = Field(default=None, ge=1)
    suggested_weight: float | None = Field(default=None, gt=0)
    unilateral: bool = False
    notes: str = ""
    set_targets: list[SetTarget] | None = None

    @model_validator(mode="after")
    def validate_metrics(self) -> "AddExerciseRequest":
        _reject_duplicate_set_numbers(self.set_targets)
        return self


class SessionUpdate(BaseModel):
    session_date: date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    goal: str | None = None
    feedback: str | None = None
    coach_summary: str | None = None
    discomfort: str | None = None
    energy: int | None = Field(default=None, ge=1, le=10)
    duration_actual: int | None = Field(default=None, ge=0)


class SessionFinish(BaseModel):
    duration_actual: int | None = None
    feedback: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""


class CoachPlanRequest(BaseModel):
    title: str = ""
    goal: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""
    time_available: int = Field(default=45, ge=1, le=1440)
    exercises: list[PlannedExerciseCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_orders(self) -> "CoachPlanRequest":
        orders = [exercise.order for exercise in self.exercises]
        if len(orders) != len(set(orders)):
            raise ValueError("exercise order values must be unique")
        return self


class ImportSet(BaseModel):
    weight: float | None = Field(default=None, gt=0)
    reps: int | None = Field(default=None, ge=1)
    duration_minutes: int | None = Field(default=None, ge=1)
    rpe: float | None = Field(default=None, ge=1, le=10)
    notes: str = ""

    @model_validator(mode="after")
    def validate_metric(self) -> "ImportSet":
        _require_one_metric(self.reps, self.duration_minutes)
        return self


class ImportExercise(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    notes: str = ""
    unilateral: bool = False
    sets: list[ImportSet] = Field(min_length=1)


class CoachImportRequest(BaseModel):
    session_date: date
    title: str = ""
    feedback: str = ""
    duration_actual: int = Field(default=0, ge=0)
    exercises: list[ImportExercise] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_orders(self) -> "CoachImportRequest":
        orders = [exercise.order for exercise in self.exercises]
        if len(orders) != len(set(orders)):
            raise ValueError("exercise order values must be unique")
        return self


class ExerciseOut(BaseModel):
    id: int
    external_id: str = ""
    name: str
    name_en: str = ""
    name_es: str = ""
    muscle_group: str
    secondary_muscles: str = ""
    target: str = ""
    body_part: str = ""
    equipment: str = ""
    instructions: str = ""
    instructions_es: str = ""
    image_url: str = ""
    gif_url: str = ""
    activity_type: Literal["strength", "cardio"]


class PerformedSetOut(BaseModel):
    id: int
    set_number: int
    weight: float | None
    activity_type: Literal["strength", "cardio"]
    weight_mode: Literal["bodyweight", "unloaded", "weighted"] | None
    reps: int | None
    duration_minutes: int | None
    rpe: float | None = None
    sensation: str
    notes: str
    timestamp: datetime


class PlannedExerciseOut(BaseModel):
    id: int
    exercise_id: int
    order: int
    target_sets: int
    target_reps: int | None
    target_duration_minutes: int | None
    suggested_weight: float | None
    unilateral: bool
    activity_type: Literal["strength", "cardio"]
    weight_mode: Literal["bodyweight", "unloaded", "weighted"] | None
    notes: str
    status: str
    set_targets: list[SetTarget] | None = None
    exercise: ExerciseOut | None = None
    performed_sets: list[PerformedSetOut] = Field(default_factory=list)


class SessionOut(BaseModel):
    id: int
    session_date: date
    title: str
    goal: str
    status: str
    energy: int
    discomfort: str
    duration_estimated: int
    duration_actual: int
    feedback: str
    coach_summary: str
    share_token: str
    total_volume: float
    planned_exercises: list[PlannedExerciseOut] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: int
    session_date: date
    title: str
    status: str
    energy: int
    duration_actual: int
    exercise_count: int
    total_sets: int
