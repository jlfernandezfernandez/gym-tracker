import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_is_liveness_only() -> None:
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}


def test_health_is_available_under_api_prefix_for_mcp() -> None:
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    response = TestClient(create_app()).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}


def test_ready_checks_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    async def dependencies_are_ready() -> None:
        return None

    monkeypatch.setattr("app.core.health.check_dependencies", dependencies_are_ready)
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    response = TestClient(create_app()).get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "version": "1.0.0"}


def test_ready_returns_503_without_dependency_details(monkeypatch: pytest.MonkeyPatch) -> None:
    async def dependencies_are_down() -> None:
        raise RuntimeError("database password must not leak")

    monkeypatch.setattr("app.core.health.check_dependencies", dependencies_are_down)
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    response = TestClient(create_app()).get("/api/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "not ready"}


def test_frontend_shell_serves_root_and_share_routes(monkeypatch, tmp_path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<main>Mini App</main>", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    client = TestClient(create_app())

    for path in ("/", "/session/share/token", "/session/share/token/exercise/1"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.text == "<main>Mini App</main>"
