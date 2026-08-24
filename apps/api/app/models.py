from datetime import UTC, date, datetime
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

# Equipment whose load cannot be expressed in kg: own body, elastics and balance
# tools. Cardio is a separate activity domain and never uses weight/repetitions.
# everything else takes an optional weight > 0. Neither 0 nor -1 exist.
UNLOADED_EQUIPMENT = {
    "body weight",
    "band",
    "resistance band",
    "rope",
    "roller",
    "wheel roller",
    "stability ball",
    "bosu ball",
}


def weight_mode(is_unloaded: bool, weight: float | None) -> str:
    if is_unloaded:
        return "bodyweight"
    if weight is not None and weight > 0:
        return "weighted"
    return "unloaded"


class Exercise(SQLModel, table=True):
    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint(
            "activity_type IN ('strength', 'cardio')", name="ck_exercise_activity_type"
        ),
    )

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
    activity_type: str = Field(default="strength", index=True)

    planned_exercises: list["PlannedExercise"] = Relationship(back_populates="exercise")

    @property
    def is_unloaded(self) -> bool:
        return self.equipment in UNLOADED_EQUIPMENT

    @property
    def is_cardio(self) -> bool:
        return self.activity_type == "cardio"


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

    planned_exercises: list["PlannedExercise"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"order_by": "PlannedExercise.order"},
    )

    @property
    def total_volume(self) -> float:
        return sum(
            max(performed_set.weight or 0, 0) * (performed_set.reps or 0)
            for planned_exercise in self.planned_exercises or []
            for performed_set in planned_exercise.performed_sets or []
            if not performed_set.is_warmup
        )


class PlannedExercise(SQLModel, table=True):
    __tablename__ = "planned_exercises"
    __table_args__ = (
        UniqueConstraint("session_id", "order", name="uq_planned_exercise_order"),
        CheckConstraint("target_sets > 0", name="ck_planned_target_sets"),
        CheckConstraint("target_reps IS NULL OR target_reps > 0", name="ck_planned_target_reps"),
        CheckConstraint(
            "target_duration_minutes IS NULL OR target_duration_minutes > 0",
            name="ck_planned_duration_positive",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'skipped')", name="ck_planned_status"
        ),
        CheckConstraint(
            "suggested_weight IS NULL OR suggested_weight > 0", name="ck_planned_weight_positive"
        ),
    )

    id: int = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="workout_sessions.id")
    exercise_id: int = Field(foreign_key="exercises.id")
    order: int = Field(default=0)
    target_sets: int = Field(default=3)
    target_reps: int | None = Field(default=None)
    target_duration_minutes: int | None = Field(default=None)
    suggested_weight: float | None = Field(default=None)
    unilateral: bool = Field(default=False)
    superset_group: str | None = Field(default=None)
    notes: str = Field(default="")
    status: str = Field(default="pending")
    set_targets: list | None = Field(default=None, sa_type=sa.JSON)

    session: "WorkoutSession" = Relationship(back_populates="planned_exercises")
    exercise: "Exercise" = Relationship(back_populates="planned_exercises")
    performed_sets: list["PerformedSet"] = Relationship(
        back_populates="planned_exercise",
        sa_relationship_kwargs={"order_by": "PerformedSet.set_number"},
    )

    @property
    def activity_type(self) -> str:
        return self.exercise.activity_type

    @property
    def weight_mode(self) -> str | None:
        if self.activity_type == "cardio":
            return None
        return weight_mode(self.exercise.is_unloaded, self.suggested_weight)


class PerformedSet(SQLModel, table=True):
    __tablename__ = "performed_sets"
    __table_args__ = (
        UniqueConstraint("planned_exercise_id", "set_number", name="uq_performed_set_number"),
        CheckConstraint("weight IS NULL OR weight > 0", name="ck_set_weight_positive"),
        CheckConstraint("reps IS NULL OR reps > 0", name="ck_set_reps_positive"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0", name="ck_set_duration_positive"
        ),
        CheckConstraint(
            "(reps IS NULL) <> (duration_minutes IS NULL)",
            name="ck_set_metric_exactly_one",
        ),
    )

    id: int = Field(default=None, primary_key=True)
    planned_exercise_id: int = Field(foreign_key="planned_exercises.id")
    set_number: int = Field(default=1)
    weight: float | None = Field(default=None)
    reps: int | None = Field(default=None)
    duration_minutes: int | None = Field(default=None)
    is_warmup: bool = Field(default=False)
    rpe: float | None = Field(default=None, ge=1.0, le=10.0)
    rir: float | None = Field(default=None, ge=0.0, le=10.0)
    sensation: str = Field(default="")
    notes: str = Field(default="")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))

    planned_exercise: "PlannedExercise" = Relationship(back_populates="performed_sets")

    @property
    def activity_type(self) -> str:
        return self.planned_exercise.exercise.activity_type

    @property
    def weight_mode(self) -> str | None:
        if self.activity_type == "cardio":
            return None
        return weight_mode(self.planned_exercise.exercise.is_unloaded, self.weight)


class WebhookEvent(SQLModel, table=True):
    """Durable, agent-agnostic outbox entry for a future domain event."""

    __tablename__ = "webhook_events"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'delivered', 'failed')",
            name="ck_webhook_event_status",
        ),
    )

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    event_type: str = Field(default="", index=True)
    source: str = Field(default="gym-tracker")
    subject: str = Field(default="")
    event_time: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))
    payload: dict = Field(default_factory=dict, sa_type=sa.JSON)
    status: str = Field(default="pending", index=True)
    attempts: int = Field(default=0)
    next_attempt_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC).replace(tzinfo=None), index=True
    )
    last_error: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))
    delivered_at: datetime | None = Field(default=None)


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


class AthleteDislikedExercise(SQLModel, table=True):
    __tablename__ = "athlete_disliked_exercises"
    __table_args__ = (
        UniqueConstraint("athlete_id", "exercise_id", name="uq_disliked_athlete_exercise"),
    )

    id: int = Field(default=None, primary_key=True)
    athlete_id: int = Field(foreign_key="athlete_profiles.id", index=True)
    exercise_id: int = Field(foreign_key="exercises.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))


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
    notes: str = Field(default="")
    onboarding_complete: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))
