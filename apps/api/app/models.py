from datetime import UTC, date, datetime
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

BODYWEIGHT_WEIGHT = -1.0


def weight_mode(weight: float | None) -> str:
    if weight == BODYWEIGHT_WEIGHT:
        return "bodyweight"
    if weight is not None and weight > 0:
        return "weighted"
    return "unloaded"


class Exercise(SQLModel, table=True):
    __tablename__ = "exercises"

    id: int = Field(default=None, primary_key=True)
    external_id: str = Field(default="", index=True, unique=True)
    name: str = Field(index=True)
    name_en: str = Field(default="", index=True)
    name_es: str = Field(default="", index=True)
    muscle_group: str = Field(index=True)
    secondary_muscles: str = Field(default="")
    target: str = Field(default="", index=True)
    body_part: str = Field(default="", index=True)
    equipment: str = Field(default="", index=True)
    instructions: str = Field(default="")
    instructions_es: str = Field(default="")
    image_url: str = Field(default="")
    gif_url: str = Field(default="")

    planned_exercises: list["PlannedExercise"] = Relationship(back_populates="exercise")

    @property
    def is_bodyweight(self) -> bool:
        return self.equipment == "body weight"


class CatalogState(SQLModel, table=True):
    __tablename__ = "catalog_state"

    id: int = Field(default=1, primary_key=True)
    dataset_version: str
    sha256: str
    installed_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))


class WorkoutSession(SQLModel, table=True):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('planned', 'in_progress', 'completed', 'cancelled')",
            name="ck_session_status",
        ),
    )

    id: int = Field(default=None, primary_key=True)
    session_date: date = Field(default_factory=lambda: date.today(), index=True)
    title: str = Field(default="")
    goal: str = Field(default="")
    status: str = Field(default="planned")
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = Field(default="")
    duration_estimated: int = Field(default=0)
    duration_actual: int = Field(default=0)
    feedback: str = Field(default="")
    coach_summary: str = Field(default="")
    share_token: str = Field(default_factory=lambda: uuid4().hex)
    telegram_user_id: int | None = Field(default=None, index=True)
    started_at: datetime | None = Field(default=None)

    planned_exercises: list["PlannedExercise"] = Relationship(back_populates="session")

    @property
    def total_volume(self) -> float:
        return sum(
            max(performed_set.weight or 0, 0) * performed_set.reps
            for planned_exercise in self.planned_exercises or []
            for performed_set in planned_exercise.performed_sets or []
        )


class PlannedExercise(SQLModel, table=True):
    __tablename__ = "planned_exercises"
    __table_args__ = (
        UniqueConstraint("session_id", "order", name="uq_planned_exercise_order"),
        CheckConstraint("target_sets > 0", name="ck_planned_target_sets"),
        CheckConstraint("target_reps > 0", name="ck_planned_target_reps"),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'skipped')", name="ck_planned_status"
        ),
    )

    id: int = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="workout_sessions.id")
    exercise_id: int = Field(foreign_key="exercises.id")
    order: int = Field(default=0)
    target_sets: int = Field(default=3)
    target_reps: int = Field(default=10)
    suggested_weight: float | None = Field(default=None)
    notes: str = Field(default="")
    status: str = Field(default="pending")
    set_targets: list | None = Field(default=None, sa_type=sa.JSON)

    session: "WorkoutSession" = Relationship(back_populates="planned_exercises")
    exercise: "Exercise" = Relationship(back_populates="planned_exercises")
    performed_sets: list["PerformedSet"] = Relationship(back_populates="planned_exercise")

    @property
    def weight_mode(self) -> str:
        return weight_mode(self.suggested_weight)


class PerformedSet(SQLModel, table=True):
    __tablename__ = "performed_sets"
    __table_args__ = (
        UniqueConstraint("planned_exercise_id", "set_number", name="uq_performed_set_number"),
    )

    id: int = Field(default=None, primary_key=True)
    planned_exercise_id: int = Field(foreign_key="planned_exercises.id")
    set_number: int = Field(default=1)
    weight: float | None = Field(default=None)
    reps: int = Field(default=0)
    rpe: float | None = Field(default=None, ge=1.0, le=10.0)
    sensation: str = Field(default="")
    notes: str = Field(default="")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))

    planned_exercise: "PlannedExercise" = Relationship(back_populates="performed_sets")

    @property
    def weight_mode(self) -> str:
        return weight_mode(self.weight)


class AthleteMeasurement(SQLModel, table=True):
    __tablename__ = "athlete_measurements"

    id: int = Field(default=None, primary_key=True)
    telegram_user_id: int | None = Field(default=None, index=True)
    measured_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None), index=True
    )
    source: str = Field(default="manual", index=True)
    weight_kg: float | None = Field(default=None)
    muscle_kg: float | None = Field(default=None)
    fat_kg: float | None = Field(default=None)
    body_fat_pct: float | None = Field(default=None)
    visceral_fat: float | None = Field(default=None)
    notes: str = Field(default="")


class AthleteProfile(SQLModel, table=True):
    __tablename__ = "athlete_profiles"
    __table_args__ = (
        sa.Index(
            "uq_athlete_profiles_telegram_user_id",
            "telegram_user_id",
            unique=True,
            postgresql_where=sa.text("telegram_user_id IS NOT NULL"),
        ),
    )

    id: int = Field(default=None, primary_key=True)
    name: str = Field(default="Athlete")
    telegram_user_id: int | None = Field(default=None, index=True)
    age: int | None = Field(default=None)
    height_cm: float | None = Field(default=None)
    weight_kg: float | None = Field(default=None)
    goal: str = Field(default="")
    experience_level: str = Field(default="")
    preferred_exercises: str = Field(default="")
    disliked_exercises: str = Field(default="")
    notes: str = Field(default="")
    onboarding_complete: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))
