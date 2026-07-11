import os
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_is_liveness_only() -> None:
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}
