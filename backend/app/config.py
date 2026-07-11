from enum import StrEnum
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Environment = Environment.PRODUCTION
    database_url: str
    cors_origins: str = ""
    telegram_bot_token: str = ""
    coach_api_key: str = ""
    auth_ttl: int = 86_400
    log_level: str = "INFO"
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "gym-tracker-media"
    s3_region: str = "us-east-1"
    exercise_dataset_repository: str = "jlfernandezfernandez/exercises-dataset-es"

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.environment is Environment.PRODUCTION:
            required = (
                "database_url",
                "cors_origins",
                "telegram_bot_token",
                "coach_api_key",
                "s3_endpoint",
                "s3_access_key",
                "s3_secret_key",
            )
            missing = [name for name in required if not getattr(self, name)]
            if missing:
                raise ValueError(f"Missing production settings: {', '.join(missing)}")
            if "*" in self.cors_origin_list:
                raise ValueError("CORS wildcard is not allowed in production")
        return self

    @property
    def auth_disabled(self) -> bool:
        return self.environment is Environment.DEVELOPMENT and not self.telegram_bot_token

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def exercise_dataset_raw_base(self) -> str:
        return f"https://raw.githubusercontent.com/{self.exercise_dataset_repository}/main"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]
