from pydantic import BaseModel


class ExerciseFacets(BaseModel):
    muscle_groups: list[str]
    body_parts: list[str]
    equipment: list[str]
