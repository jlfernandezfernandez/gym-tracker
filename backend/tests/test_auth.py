import pytest
from fastapi import HTTPException

from app.auth import coach_acting_user_id, validate_auth_date


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


def test_coach_must_act_on_behalf_of_one_user() -> None:
    assert coach_acting_user_id("42") == 42
    for value in (None, "", "abc", "-1"):
        with pytest.raises(HTTPException) as error:
            coach_acting_user_id(value)
        assert error.value.status_code == 401
