import os

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
