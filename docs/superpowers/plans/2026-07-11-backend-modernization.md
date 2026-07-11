# Backend Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the FastAPI backend into a small conventional Python package, provision the remote exercise dataset into PostgreSQL and S3 without local fallbacks, and close the audited security and integrity gaps.

**Architecture:** `app.main` only assembles FastAPI; route modules own HTTP translation, focused services own state transitions and catalog synchronization, and `storage.s3` owns object storage. `scripts/bootstrap.py` is the single prestart command for Alembic and the idempotent remote catalog seed.

**Tech Stack:** Python 3.13, FastAPI, SQLModel/SQLAlchemy asyncio, PostgreSQL 18, Alembic, Pydantic Settings, boto3/MinIO, uv, Pytest, Ruff, Pyright, GitHub Actions.

## Global Constraints

- Use `uv` as the only dependency manager and commit `uv.lock`.
- Consume the configured dataset repository's `main` branch.
- Never persist the catalog JSON or exercise media on local disk.
- Never overwrite existing S3 objects or delete database exercises missing upstream.
- Production must fail fast; insecure development behavior requires `ENVIRONMENT=development`.
- Preserve successful endpoint paths and response payloads.
- Do not add repositories, Unit of Work, event buses, CQRS, caches, task runners, or dependency-injection containers.
- Keep all related SQLModel tables together in `app/models.py`.

---

### Task 1: Establish the Python package and locked toolchain

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/routes/__init__.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/storage/__init__.py`
- Create: `backend/scripts/__init__.py`
- Create: `backend/tests/test_package.py`
- Delete: `backend/requirements.txt`
- Generate: `backend/uv.lock`

**Interfaces:**
- Consumes: existing dependencies from `backend/requirements.txt`.
- Produces: installable package `gym-tracker-backend`; commands `uv run pytest`, `uv run ruff check .`, and `uv run pyright`.

- [ ] **Step 1: Write the package smoke test**

```python
# backend/tests/test_package.py
from importlib import import_module


def test_app_package_is_importable() -> None:
    assert import_module("app").__name__ == "app"
```

- [ ] **Step 2: Create `pyproject.toml`**

```toml
[project]
name = "gym-tracker-backend"
version = "1.0.0"
requires-python = ">=3.13"
dependencies = [
  "alembic>=1.14",
  "asyncpg>=0.30",
  "boto3>=1.35",
  "fastapi>=0.115",
  "pydantic-settings>=2.7",
  "psycopg2-binary>=2.9",
  "sqlmodel>=0.0.24",
  "uvicorn[standard]>=0.34",
]

[dependency-groups]
dev = ["httpx>=0.28", "pyright>=1.1.400", "pytest>=8.3", "pytest-asyncio>=0.25", "ruff>=0.11"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
target-version = "py313"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.pyright]
pythonVersion = "3.13"
typeCheckingMode = "standard"
include = ["app", "scripts", "tests"]
```

- [ ] **Step 3: Create package marker files and remove `requirements.txt`**

Each marker file is empty. Delete `backend/requirements.txt`; do not retain a generated compatibility file.

- [ ] **Step 4: Lock and verify dependencies**

Run: `cd backend && uv lock && uv sync --locked`

Expected: `uv.lock` is created and installation exits 0.

Run: `cd backend && uv run pytest tests/test_package.py -v`

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app backend/scripts backend/tests backend/requirements.txt
git commit -m "build(backend): adopt uv package"
```

### Task 2: Centralize typed fail-fast configuration

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/tests/test_config.py`
- Modify: `.env.example`

**Interfaces:**
- Consumes: environment variables currently read in `database.py`, `main.py`, `telegram_auth.py`, and `seed/exercises.py`.
- Produces: `Environment`, `Settings`, and cached `get_settings() -> Settings`.

- [ ] **Step 1: Write failing configuration tests**

```python
# backend/tests/test_config.py
import pytest
from pydantic import ValidationError

from app.config import Environment, Settings


BASE = {
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
        Settings(environment=Environment.PRODUCTION)


def test_development_explicitly_allows_disabled_auth() -> None:
    settings = Settings(environment=Environment.DEVELOPMENT, database_url=BASE["database_url"])
    assert settings.auth_disabled is True


def test_dataset_repository_is_configurable() -> None:
    settings = Settings(**BASE, exercise_dataset_repository="owner/fork")
    assert settings.exercise_dataset_raw_base == "https://raw.githubusercontent.com/owner/fork/main"
```

- [ ] **Step 2: Run tests and confirm the missing module failure**

Run: `cd backend && uv run pytest tests/test_config.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`.

- [ ] **Step 3: Implement settings**

```python
# backend/app/config.py
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
                "database_url", "cors_origins", "telegram_bot_token", "coach_api_key",
                "s3_endpoint", "s3_access_key", "s3_secret_key",
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
```

- [ ] **Step 4: Update `.env.example`**

Add `ENVIRONMENT=development` and `EXERCISE_DATASET_REPOSITORY=jlfernandezfernandez/exercises-dataset-es`. Clarify that production values are mandatory and development defaults come from Compose, not application code.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && uv run pytest tests/test_config.py -v`

Expected: `3 passed`.

```bash
git add backend/app/config.py backend/tests/test_config.py .env.example
git commit -m "feat(backend): centralize settings"
```

### Task 3: Extract database, models, schemas, and routers into `app`

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models.py`
- Create: `backend/app/schemas/sessions.py`
- Create: `backend/app/schemas/exercises.py`
- Create: `backend/app/schemas/profile.py`
- Create: `backend/app/api/routes/sessions.py`
- Create: `backend/app/api/routes/exercises.py`
- Create: `backend/app/api/routes/profile.py`
- Create: `backend/app/api/routes/coach.py`
- Create: `backend/app/api/router.py`
- Create by moving: `backend/alembic/env.py`
- Create by moving: `backend/alembic/script.py.mako`
- Create by moving: `backend/alembic/versions/*.py`
- Delete: `backend/migrations/`
- Delete: old `backend/database.py`, `backend/models.py`, `backend/schemas.py`, and `backend/routers/`
- Test: `backend/tests/test_imports.py`

**Interfaces:**
- Consumes: `get_settings()`, existing SQLModel classes, Pydantic schemas, and route behavior.
- Produces: `app.database.get_session`, `app.models`, feature schema modules, and `app.api.router.api_router`.

- [ ] **Step 1: Write an import-contract test**

```python
# backend/tests/test_imports.py
from app.api.router import api_router
from app.database import get_session
from app.models import Exercise, WorkoutSession
from app.schemas.sessions import SessionOut


def test_backend_modules_have_stable_package_imports() -> None:
    assert api_router.prefix == "/api"
    assert callable(get_session)
    assert Exercise.__tablename__ == "exercises"
    assert WorkoutSession.__tablename__ == "workout_sessions"
    assert "total_volume" in SessionOut.model_fields
```

- [ ] **Step 2: Move code without changing behavior**

Use `apply_patch` moves. Change imports to absolute package imports such as:

```python
from app.auth import current_user_id
from app.database import get_session
from app.models import Exercise, WorkoutSession
from app.schemas.sessions import SessionOut
```

Split schemas by feature; shared nested session schemas stay in `schemas/sessions.py`. Keep every SQLModel table in `app/models.py`.

- [ ] **Step 3: Build the aggregate API router**

```python
# backend/app/api/router.py
from fastapi import APIRouter

from app.api.routes import coach, exercises, profile, sessions

api_router = APIRouter(prefix="/api")
api_router.include_router(sessions.router)
api_router.include_router(exercises.router)
api_router.include_router(coach.router)
api_router.include_router(profile.router)
```

Remove `/api` from each child router prefix so public paths remain unchanged.

- [ ] **Step 4: Point Alembic at package models**

In `backend/alembic/env.py`, replace the old import with:

```python
from app.config import get_settings
from app.models import SQLModel

config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("+asyncpg", ""))
target_metadata = SQLModel.metadata
```

- [ ] **Step 5: Verify imports and migrations**

Run: `cd backend && ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run pytest tests/test_imports.py -v`

Expected: PASS.

Run: `cd backend && ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run alembic heads`

Expected: one head, `f6a7b8c9d0e1` before the new integrity migration.

- [ ] **Step 6: Commit**

```bash
git add backend/app backend/alembic backend/migrations backend/database.py backend/models.py backend/schemas.py backend/routers
git commit -m "refactor(backend): package application modules"
```

### Task 4: Make S3 the only media storage

**Files:**
- Create: `backend/app/storage/s3.py`
- Create: `backend/app/api/routes/media.py`
- Create: `backend/tests/storage/test_s3.py`
- Modify: `backend/app/api/router.py`

**Interfaces:**
- Consumes: `Settings` and boto3.
- Produces: `S3Storage`, `get_storage()`, `S3Storage.list_keys()`, `upload()`, `open()`, `head_bucket()`, and the S3-only `/exercise-media/{path}` route.

- [ ] **Step 1: Write failing storage tests with a fake boto3 client**

```python
# backend/tests/storage/test_s3.py
from app.config import Environment, Settings
from app.storage.s3 import S3Storage


class FakeClient:
    def __init__(self) -> None:
        self.uploads: list[str] = []

    def get_paginator(self, name: str):
        assert name == "list_objects_v2"
        return self

    def paginate(self, **kwargs):
        return [{"Contents": [{"Key": "images/existing.jpg"}]}]

    def put_object(self, **kwargs):
        self.uploads.append(kwargs["Key"])


def test_storage_lists_and_uploads_bucket_objects() -> None:
    client = FakeClient()
    settings = Settings(
        environment=Environment.DEVELOPMENT,
        database_url="postgresql+asyncpg://user:pass@db/app",
        s3_endpoint="http://minio:9000",
    )
    storage = S3Storage(settings, client=client)
    assert storage.list_keys() == {"images/existing.jpg"}
    storage.upload("videos/new.gif", b"gif", "image/gif")
    assert client.uploads == ["videos/new.gif"]
```

- [ ] **Step 2: Implement focused S3 storage**

```python
# backend/app/storage/s3.py
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config as BotoConfig

from app.config import Settings, get_settings


class S3Storage:
    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.bucket = settings.s3_bucket
        self.client = client or boto3.client(
            "s3", endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def list_keys(self) -> set[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        return {
            item["Key"]
            for page in paginator.paginate(Bucket=self.bucket)
            for item in page.get("Contents", [])
        }

    def upload(self, key: str, content: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content,
                               ContentType=content_type,
                               CacheControl="public, max-age=31536000, immutable")

    def open(self, key: str) -> dict[str, Any]:
        return self.client.get_object(Bucket=self.bucket, Key=key)

    def head_bucket(self) -> None:
        self.client.head_bucket(Bucket=self.bucket)


@lru_cache
def get_storage() -> S3Storage:
    return S3Storage(get_settings())
```

- [ ] **Step 3: Move the media endpoint**

`media.py` calls `get_storage().open(path)` and returns `StreamingResponse`. Catch `botocore.exceptions.ClientError`; map only `NoSuchKey`/`404` to 404 and other storage failures to 502. Do not import `FileResponse`, `Path`, `os.path`, or reference `exercise_data`.

- [ ] **Step 4: Verify and commit**

Run: `cd backend && uv run pytest tests/storage/test_s3.py -v`

Expected: PASS.

Run: `rg -n "exercise_data|FileResponse\(file_path|_media_dir" backend/app`

Expected: no matches.

```bash
git add backend/app/storage backend/app/api/routes/media.py backend/app/api/router.py backend/tests/storage
git commit -m "refactor(storage): make media S3-only"
```

### Task 5: Replace the vendored dataset with one idempotent remote seed

**Files:**
- Create: `backend/app/services/exercise_catalog.py`
- Create: `backend/tests/services/test_exercise_catalog.py`
- Delete: `backend/seed/exercises.py`
- Delete: `backend/exercise_data/`

**Interfaces:**
- Consumes: `AsyncSession`, `Settings.exercise_dataset_raw_base`, and `S3Storage`.
- Produces: `fetch_catalog(settings) -> list[dict[str, Any]]`, `seed_catalog(db, entries) -> SeedResult`, `seed_missing_media(storage, settings, entries) -> int`, and `sync_exercise_catalog(...) -> SeedResult`.

- [ ] **Step 1: Write parsing and missing-media tests**

```python
# backend/tests/services/test_exercise_catalog.py
from app.services.exercise_catalog import media_paths, parse_exercise


ENTRY = {
    "id": "0001", "name": "Sit-up", "name_es": "Abdominal",
    "target": "abs", "body_part": "waist", "equipment": "body weight",
    "secondary_muscles": ["hip flexors"],
    "instructions": {"en": "Lift.", "es": "Sube."},
    "image": "images/0001.jpg", "gif_url": "videos/0001.gif",
}


def test_parse_exercise_maps_remote_metadata() -> None:
    parsed = parse_exercise(ENTRY)
    assert parsed["external_id"] == "0001"
    assert parsed["name"] == "Abdominal"
    assert parsed["image_url"] == "/exercise-media/images/0001.jpg"


def test_media_paths_returns_only_missing_unique_paths() -> None:
    assert media_paths([ENTRY, ENTRY], {"images/0001.jpg"}) == ["videos/0001.gif"]
```

- [ ] **Step 2: Implement in-memory catalog fetching and mapping**

Use `urllib.request.urlopen(f"{settings.exercise_dataset_raw_base}/exercises.json", timeout=30)` and `json.load(response)`. Never call `open()`, `Path.write_*`, `mkdir`, or create a temporary file.

`media_paths()` returns sorted unique image/GIF paths absent from the single `storage.list_keys()` snapshot.

- [ ] **Step 3: Implement transactional metadata upsert**

Load all existing exercises once:

```python
existing = {
    exercise.external_id: exercise
    for exercise in (await db.execute(select(Exercise))).scalars()
}
```

Add new rows, update every mapped field on existing rows, call `await db.flush()`, and leave commit/rollback to the bootstrap coordinator. Do not delete absent rows.

- [ ] **Step 4: Implement bounded media upload**

Download each missing path from `settings.exercise_dataset_raw_base` with the existing concurrency limit of 8, using `asyncio.to_thread`. Upload bytes directly to S3 and allow any final download/upload failure to abort the bootstrap.

- [ ] **Step 5: Verify local fallback removal**

Run: `cd backend && uv run pytest tests/services/test_exercise_catalog.py -v`

Expected: PASS.

Run: `git ls-files backend/exercise_data backend/seed`

Expected: no output.

Run: `rg -n "write_bytes|mkdir|DATA_DIR|download_to_disk" backend/app`

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/exercise_catalog.py backend/tests/services backend/seed backend/exercise_data
git commit -m "refactor(seed): sync remote catalog to S3"
```

### Task 6: Create the single bootstrap command and thin FastAPI assembly

**Files:**
- Create: `backend/scripts/bootstrap.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/api/test_health.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/alembic.ini`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Delete: `backend/operations.py`
- Delete: old `backend/main.py`

**Interfaces:**
- Consumes: `get_settings`, Alembic config, `async_session`, `get_storage`, and `sync_exercise_catalog`.
- Produces: `scripts.bootstrap.run()`, `app.main.create_app()`, and `app.main.app`.

- [ ] **Step 1: Write health/readiness tests**

```python
# backend/tests/api/test_health.py
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_is_liveness_only() -> None:
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}
```

- [ ] **Step 2: Implement bootstrap orchestration**

`run()` performs exactly: `alembic upgrade head`; ensure/head-or-create bucket; open one async DB session; fetch the dataset once; upsert metadata; upload missing media; commit. On any exception, rollback and exit non-zero.

Do not put retries or bootstrap calls in `app.main`.

- [ ] **Step 3: Implement thin app assembly**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Gym Tracker API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()
```

Keep static frontend mounting in one small private function in `main.py`; media and health endpoints stay in route modules.

- [ ] **Step 4: Update deployment commands**

Set Alembic `script_location = alembic`. Update Docker to install uv, run `uv sync --frozen --no-dev`, execute `uv run uvicorn app.main:app`, and copy `backend/` without `exercise_data`. Change Compose `app-init` to `uv run python -m scripts.bootstrap` and add `ENVIRONMENT=development` plus the dataset repository setting.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run pytest tests/api/test_health.py -v`

Expected: PASS.

Run: `wc -l backend/app/main.py`

Expected: fewer than 80 lines.

```bash
git add backend/app/main.py backend/app/api backend/scripts backend/tests/api backend/alembic.ini backend/operations.py backend/main.py Dockerfile docker-compose.yml
git commit -m "refactor(backend): add bootstrap and app factory"
```

### Task 7: Harden Telegram authentication and session ownership

**Files:**
- Create: `backend/app/auth.py`
- Create: `backend/tests/test_auth.py`
- Create: `backend/tests/services/test_session_access.py`
- Modify: `backend/app/api/routes/sessions.py`
- Modify: `backend/app/api/routes/exercises.py`
- Modify: `backend/app/api/routes/profile.py`
- Modify: `backend/app/api/routes/coach.py`
- Delete: `backend/telegram_auth.py`

**Interfaces:**
- Consumes: `Settings`, Telegram init data, coach headers, and `WorkoutSession.telegram_user_id`.
- Produces: `validate_init_data`, `current_user_id`, and `check_session_owner(workout, user_id, auth_disabled)`.

- [ ] **Step 1: Write timestamp tests**

```python
# backend/tests/test_auth.py
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
```

- [ ] **Step 2: Write ownership tests**

```python
# backend/tests/services/test_session_access.py
import pytest
from fastapi import HTTPException

from app.models import WorkoutSession
from app.services.sessions import check_session_owner


def test_authenticated_user_cannot_claim_unowned_session() -> None:
    with pytest.raises(HTTPException) as error:
        check_session_owner(WorkoutSession(telegram_user_id=None), 42, auth_disabled=False)
    assert error.value.status_code == 403


def test_explicit_development_mode_allows_unscoped_session() -> None:
    check_session_owner(WorkoutSession(telegram_user_id=None), None, auth_disabled=True)
```

- [ ] **Step 3: Implement strict auth**

Require `auth_date`; reject non-integers, ages greater than TTL, and timestamps more than 30 seconds in the future. Catch invalid user JSON and return 401. Derive the HMAC key from `get_settings().telegram_bot_token`.

Only return the development user when `settings.auth_disabled` is true. A missing production header returns 401.

- [ ] **Step 4: Implement strict ownership and update callers**

```python
def check_session_owner(workout: WorkoutSession, user_id: int | None, auth_disabled: bool) -> None:
    if auth_disabled and user_id is None:
        return
    if user_id is None or workout.telegram_user_id != user_id:
        raise HTTPException(status_code=403, detail="This session belongs to another user")
```

Use the same identity filtering rule for records, progress, profiles, measurements, coach snapshot, and session lists.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && uv run pytest tests/test_auth.py tests/services/test_session_access.py -v`

Expected: PASS.

```bash
git add backend/app/auth.py backend/app/services/sessions.py backend/app/api/routes backend/tests/test_auth.py backend/tests/services/test_session_access.py backend/telegram_auth.py
git commit -m "fix(auth): enforce identity boundaries"
```

### Task 8: Enforce database integrity and controlled conflicts

**Files:**
- Create: `backend/alembic/versions/g7b8c9d0e1f2_profile_identity.py`
- Create: `backend/tests/test_schemas.py`
- Create: `backend/tests/services/test_session_integrity.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas/profile.py`
- Modify: `backend/app/schemas/sessions.py`
- Modify: `backend/app/api/routes/coach.py`
- Modify: `backend/app/api/routes/sessions.py`

**Interfaces:**
- Consumes: PostgreSQL unique constraints and SQLAlchemy `IntegrityError`.
- Produces: unique non-null profile identity, bounded measurements, duplicate-order validation, and 409 set conflicts.

- [ ] **Step 1: Write schema tests**

```python
# backend/tests/test_schemas.py
import pytest
from pydantic import ValidationError

from app.schemas.profile import AthleteMeasurementIn
from app.schemas.sessions import CoachPlanRequest, PlannedExerciseCreate


@pytest.mark.parametrize("field,value", [("weight_kg", -1), ("body_fat_pct", 101)])
def test_measurements_reject_invalid_values(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        AthleteMeasurementIn(**{field: value})


def test_plan_rejects_duplicate_orders() -> None:
    exercise = PlannedExerciseCreate(exercise_id=1, order=0)
    with pytest.raises(ValidationError):
        CoachPlanRequest(exercises=[exercise, exercise.model_copy(update={"exercise_id": 2})])
```

Add a focused conflict-translation test:

```python
# backend/tests/services/test_session_integrity.py
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.services.sessions import set_conflict_error


def test_unique_set_conflict_maps_to_http_409() -> None:
    error = IntegrityError("insert", {}, Exception("uq_performed_set_number"))
    translated = set_conflict_error(error)
    assert isinstance(translated, HTTPException)
    assert translated.status_code == 409
    assert translated.detail == "Set was already logged by another request"
```

- [ ] **Step 2: Add exact validation**

Use `ge=0` for mass values, `ge=0, le=100` for body-fat percentage, and a model validator on plan/import requests that rejects duplicate `order` values with `ValueError("exercise order values must be unique")`.

- [ ] **Step 3: Add profile uniqueness migration**

Before creating the unique index, deterministically retain the lowest profile ID per non-null Telegram user and delete later duplicates only after confirming they are not referenced (profiles currently have no foreign-key consumers). Create:

```python
op.create_index(
    "uq_athlete_profiles_telegram_user_id",
    "athlete_profiles",
    ["telegram_user_id"],
    unique=True,
    postgresql_where=sa.text("telegram_user_id IS NOT NULL"),
)
```

Mirror it in `AthleteProfile.__table_args__` with a PostgreSQL partial unique index.

- [ ] **Step 4: Translate concurrency conflicts**

Add `set_conflict_error(error: IntegrityError) -> HTTPException`, verifying that the violated constraint is `uq_performed_set_number`; otherwise re-raise the original error. Wrap only the `log_set` commit in `try/except IntegrityError`; rollback and raise the translated HTTP 409 with `"Set was already logged by another request"`. Let unrelated database failures propagate.

For profile creation, catch the unique race, rollback, then reselect the profile.

- [ ] **Step 5: Verify and commit**

Run: `cd backend && uv run pytest tests/test_schemas.py tests/services/test_session_integrity.py -v`

Expected: PASS.

Run: `cd backend && ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run alembic heads`

Expected: one head, `g7b8c9d0e1f2`.

```bash
git add backend/app backend/alembic/versions backend/tests
git commit -m "fix(backend): enforce data integrity"
```

### Task 9: Extract session use cases and remove router duplication

**Files:**
- Modify: `backend/app/services/sessions.py`
- Modify: `backend/app/api/routes/sessions.py`
- Modify: `backend/app/api/routes/coach.py`
- Create: `backend/tests/services/test_sessions.py`

**Interfaces:**
- Consumes: `AsyncSession`, models, schemas, and strict ownership.
- Produces: `load_session`, `find_planned_exercise`, `start_session`, `current_state`, and mutation functions called by thin routes.

- [ ] **Step 1: Write pure helper tests**

```python
# backend/tests/services/test_sessions.py
import pytest
from fastapi import HTTPException

from app.models import PlannedExercise, WorkoutSession
from app.services.sessions import find_planned_exercise, start_session


def test_find_planned_exercise_is_scoped_to_session() -> None:
    workout = WorkoutSession(planned_exercises=[PlannedExercise(id=1), PlannedExercise(id=2)])
    assert find_planned_exercise(workout, 2).id == 2
    with pytest.raises(HTTPException) as error:
        find_planned_exercise(workout, 3)
    assert error.value.status_code == 404


def test_start_session_is_idempotent() -> None:
    workout = WorkoutSession(status="planned")
    start_session(workout)
    started_at = workout.started_at
    start_session(workout)
    assert workout.status == "in_progress"
    assert workout.started_at == started_at
```

- [ ] **Step 2: Extract shared helpers without changing behavior**

Move the existing `_load_session`, `_current_state`, `_start_session`, and planned-exercise generator into named service functions. Preserve eager-loading options and response fields exactly.

- [ ] **Step 3: Extract mutation use cases**

Each service function accepts `db`, IDs, body, and acting user; performs load/ownership/mutation/commit/reload. Routes become dependency declarations plus a single service call. Keep public response models on routes.

- [ ] **Step 4: Remove duplication and verify**

Run: `cd backend && uv run pytest tests/services/test_sessions.py -v`

Expected: PASS.

Run: `rg -n "next\(\s*\(planned" backend/app/api/routes`

Expected: no matches.

Run: `wc -l backend/app/api/routes/sessions.py`

Expected: materially below the original 453 lines, target under 260.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/sessions.py backend/app/api/routes backend/tests/services/test_sessions.py
git commit -m "refactor(sessions): extract use cases"
```

### Task 10: Add CI, complete documentation, and run the release gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/deploy-coolify.md`
- Modify: `docs/agent-setup.md`
- Preserve or relocate: exercise media attribution notice without media files.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: one documented local/CI/release workflow.

- [ ] **Step 1: Configure backend CI**

Add a backend job using official checkout and uv setup actions. Run from `backend/`:

```yaml
- run: uv sync --locked
- run: uv run ruff format --check .
- run: uv run ruff check .
- run: uv run pyright
- run: uv run pytest -v
- run: ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run alembic heads
```

Keep existing frontend/landing jobs intact.

- [ ] **Step 2: Update documentation**

Document:

- `cd backend && uv sync --locked` for setup;
- `uv run uvicorn app.main:app --reload` for API development;
- `uv run python -m scripts.bootstrap` as the only migration/seed command;
- remote `main` dataset → in-memory parse → PostgreSQL metadata + missing S3 media;
- no local catalog/media fallback;
- mandatory production configuration and explicit `ENVIRONMENT=development`;
- Ruff, Pyright, Pytest, and Alembic commands.

Keep the Gym Visual attribution/terms text in documentation after deleting `exercise_data`.

- [ ] **Step 3: Run the complete local gate**

Run:

```bash
cd backend
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest -v
ENVIRONMENT=development DATABASE_URL=postgresql+asyncpg://x:x@localhost/x uv run alembic heads
```

Expected: every command exits 0; pytest reports all tests passed; Alembic reports one head.

- [ ] **Step 4: Validate repository constraints**

Run: `git ls-files backend | rg "requirements.txt|exercise_data|operations.py"`

Expected: no output.

Run: `rg -n "os\.getenv|load_dotenv|download_to_disk|DATA_DIR" backend/app backend/scripts`

Expected: no output.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Build the production image**

Run: `docker build -t gym-tracker:backend-modernization .`

Expected: build exits 0 and uses the locked uv environment.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md CONTRIBUTING.md docs Dockerfile docker-compose.yml
git commit -m "ci: verify modernized backend"
```

### Task 11: Final diff review

**Files:**
- Review: all files changed since `be785bf`/`147210f` design commits.

**Interfaces:**
- Consumes: complete implementation.
- Produces: verified handoff with no uncommitted fixes.

- [ ] **Step 1: Inspect the full change**

Run: `git diff --stat 147210f..HEAD && git diff --check 147210f..HEAD`

Expected: intended backend/config/docs/CI files only; no whitespace errors.

- [ ] **Step 2: Review security boundaries**

Confirm from code and tests that production cannot start with disabled auth, wildcard CORS, absent S3, or absent database configuration; authenticated users cannot access null-owned sessions; and media reads never touch local disk.

- [ ] **Step 3: Review simplicity boundaries**

Run: `find backend/app -type f -maxdepth 4 | sort`.

Confirm there are no generic repository/interface/factory layers, duplicated configuration sources, or wrappers that only delegate.

- [ ] **Step 4: Re-run the complete gate after review fixes**

Run the Task 10 Step 3 command block again.

Expected: all commands exit 0.

- [ ] **Step 5: Commit review fixes only if needed**

```bash
git add backend .github README.md CONTRIBUTING.md docs Dockerfile docker-compose.yml
git commit -m "fix(backend): address final review"
```

If no fixes are needed, do not create an empty commit.
