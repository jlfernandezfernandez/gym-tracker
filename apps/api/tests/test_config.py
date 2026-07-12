import pytest
from pydantic import ValidationError

from app.core.config import Environment, Settings

BASE: dict[str, str] = {
    "database_url": "postgresql+asyncpg://user:pass@db/app",
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


def test_dataset_release_is_pinned() -> None:
    settings = Settings(**BASE, exercise_dataset_version="v2.0.0")
    assert settings.exercise_dataset_dir.name == "v2.0.0"
    assert settings.exercise_dataset_release_url.endswith("/releases/download/v2.0.0")
