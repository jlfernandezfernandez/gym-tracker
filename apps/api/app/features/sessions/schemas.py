from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SetTarget(BaseModel):
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, ge=-1)
    reps: int = Field(default=10, ge=1)


# ponytail: set_targets are sparse overrides — sets without a target fall back to
# target_reps/suggested_weight, so only uniqueness needs validating.
def _reject_duplicate_set_numbers(set_targets: list[SetTarget] | None) -> None:
    if set_targets is not None:
        set_numbers = [t.set_number for t in set_targets]
        if len(set_numbers) != len(set(set_numbers)):
            raise ValueError("set_targets contains duplicate set_number values")


class PlannedExerciseCreate(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int = Field(default=10, ge=1)
    suggested_weight: float | None = Field(default=None, ge=-1)
    notes: str = ""
    set_targets: list[SetTarget] | None = None

    @model_validator(mode="after")
    def validate_set_targets(self) -> "PlannedExerciseCreate":
        _reject_duplicate_set_numbers(self.set_targets)
        return self


class PerformedSetCreate(BaseModel):
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, ge=-1)
    reps: int = Field(ge=1)
    rpe: float | None = None
    sensation: str = ""
    notes: str = ""


class PlannedExerciseUpdate(BaseModel):
    status: Literal["pending", "in_progress", "completed", "skipped"] | None = None
    new_exercise_id: int | None = None
    target_sets: int | None = Field(default=None, ge=1, le=20)
    notes: str | None = None
    set_targets: list[SetTarget] | None = None

    @model_validator(mode="after")
    def validate_set_targets(self) -> "PlannedExerciseUpdate":
        _reject_duplicate_set_numbers(self.set_targets)
        return self


class AddExerciseRequest(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int | None = Field(default=None, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int = Field(default=10, ge=1)
    suggested_weight: float = Field(default=0.0, ge=-1)
    notes: str = ""
    set_targets: list[SetTarget] | None = None

    @model_validator(mode="after")
    def validate_set_targets(self) -> "AddExerciseRequest":
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
        orders = [ex.order for ex in self.exercises]
        if len(orders) != len(set(orders)):
            raise ValueError("exercise order values must be unique")
        return self


class ImportSet(BaseModel):
    weight: float | None = Field(default=None, ge=-1)
    reps: int = Field(ge=1)
    rpe: float | None = Field(default=None, ge=1, le=10)
    notes: str = ""


class ImportExercise(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    notes: str = ""
    sets: list[ImportSet] = Field(min_length=1)


class CoachImportRequest(BaseModel):
    session_date: date
    title: str = ""
    feedback: str = ""
    duration_actual: int = Field(default=0, ge=0)
    exercises: list[ImportExercise] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_orders(self) -> "CoachImportRequest":
        orders = [ex.order for ex in self.exercises]
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


class PerformedSetOut(BaseModel):
    id: int
    set_number: int
    weight: float | None
    weight_mode: Literal["bodyweight", "unloaded", "weighted"]
    reps: int
    rpe: float | None = None
    sensation: str
    notes: str
    timestamp: datetime


class PlannedExerciseOut(BaseModel):
    id: int
    exercise_id: int
    order: int
    target_sets: int
    target_reps: int
    suggested_weight: float | None
    weight_mode: Literal["bodyweight", "unloaded", "weighted"]
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
