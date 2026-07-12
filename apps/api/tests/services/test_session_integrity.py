from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.features.sessions.service import set_conflict_error


def test_unique_set_conflict_maps_to_http_409() -> None:
    error = IntegrityError("insert", {}, Exception("uq_performed_set_number"))
    translated = set_conflict_error(error)
    assert isinstance(translated, HTTPException)
    assert translated.status_code == 409
    assert translated.detail == "Set was already logged by another request"
