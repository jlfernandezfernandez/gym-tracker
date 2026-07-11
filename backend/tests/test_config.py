import pytest
from pydantic import ValidationError

from app.config import Environment, Settings

BASE: dict[str, str] = {
    "database_url": "postgresql+asyncpg://user:pass@db/app",
    "s3_endpoint": "http://minio:9000",
    "s3_access_key": "access",
    "s3_secret_key": "secret",
    "telegram_bot_token": "bot-token",
    "coach_api_key": "coach-key",
    "cors_origins": "https://gym.example.com",
}


def test_production_requires_all_external_services() -> None:
    with pytest.raises(ValidationError):
        Settings(environment=Environment.PRODUCTION)  # pyright: ignore[reportCallIssue]


def test_development_explicitly_allows_disabled_auth() -> None:
    settings = Settings(environment=Environment.DEVELOPMENT, database_url=BASE["database_url"])
    assert settings.auth_disabled is True


def test_dataset_repository_is_configurable() -> None:
    settings = Settings(**BASE, exercise_dataset_repository="owner/fork")  # pyright: ignore[reportArgumentType]
    assert settings.exercise_dataset_raw_base == "https://raw.githubusercontent.com/owner/fork/main"
