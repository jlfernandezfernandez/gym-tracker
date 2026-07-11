import pytest
from fastapi import HTTPException

from app.auth import validate_auth_date


@pytest.mark.parametrize("value", [None, "", "invalid"])
def test_auth_date_is_required_and_numeric(value) -> None:
    with pytest.raises(HTTPException) as error:
        validate_auth_date(value, now=1_000, ttl=100)
    assert error.value.status_code == 401


def test_auth_date_rejects_expired_and_future_values() -> None:
    with pytest.raises(HTTPException):
        validate_auth_date("899", now=1_000, ttl=100)
    with pytest.raises(HTTPException):
        validate_auth_date("1031", now=1_000, ttl=100)
