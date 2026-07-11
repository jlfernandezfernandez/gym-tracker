from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class AthleteProfileIn(BaseModel):
    name: str = "Athlete"
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    goal: str = ""
    experience_level: str = ""
    preferred_exercises: str = ""
    disliked_exercises: str = ""
    notes: str = ""
    onboarding_complete: bool = False


class AthleteProfilePatch(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0, le=120)
    height_cm: Optional[float] = Field(default=None, gt=0, le=300)
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)
    goal: Optional[str] = None
    experience_level: Optional[str] = None
    preferred_exercises: Optional[str] = None
    disliked_exercises: Optional[str] = None
    notes: Optional[str] = None
    onboarding_complete: Optional[bool] = None


class AthleteProfileOut(AthleteProfileIn):
    id: int
    updated_at: datetime


class AthleteMeasurementIn(BaseModel):
    measured_at: Optional[datetime] = None
    source: str = "manual"
    weight_kg: Optional[float] = Field(default=None, ge=0)
    muscle_kg: Optional[float] = Field(default=None, ge=0)
    fat_kg: Optional[float] = Field(default=None, ge=0)
    body_fat_pct: Optional[float] = Field(default=None, ge=0, le=100)
    visceral_fat: Optional[float] = Field(default=None, ge=0)
    notes: str = ""


class AthleteMeasurementOut(AthleteMeasurementIn):
    id: int
    measured_at: datetime
