"""A replay acknowledges the original write; it never recreates a deleted set."""

import json
from pathlib import Path
from uuid import uuid4

from test_session_corrections import _client, _workout


def test_replay_after_lost_response_returns_one_set_even_when_session_completed():
    gen = _client(_workout(sets=(), target_sets=1))
    client, db = next(gen)
    payload = {"request_id": str(uuid4()), "set_number": 1, "weight": 40, "reps": 10}
    first = client.post("/api/sessions/1/exercises/5/sets", json=payload)
    assert first.status_code == 200
    replay = client.post("/api/sessions/1/exercises/5/sets", json=payload)
    assert replay.status_code == 200
    assert len(replay.json()["planned_exercises"][0]["performed_sets"]) == 1


def test_replay_cannot_recreate_deleted_set_or_change_payload():
    gen = _client(_workout(sets=(), target_sets=2))
    client, db = next(gen)
    payload = {"request_id": str(uuid4()), "set_number": 1, "weight": 40, "reps": 10}
    first = client.post("/api/sessions/1/exercises/5/sets", json=payload)
    assert first.status_code == 200
    changed = client.post("/api/sessions/1/exercises/5/sets", json={**payload, "reps": 12})
    assert changed.status_code == 409
    set_id = first.json()["planned_exercises"][0]["performed_sets"][0]["id"]
    assert client.delete(f"/api/sessions/1/exercises/5/sets/{set_id}").status_code == 200
    replay = client.post("/api/sessions/1/exercises/5/sets", json=payload)
    assert replay.status_code == 409
    assert db.workout.planned_exercises[0].performed_sets == []


def test_replay_still_checks_owner():
    gen = _client(_workout(sets=(), target_sets=1), user_id=7)
    client, _ = next(gen)
    response = client.post(
        "/api/sessions/1/exercises/5/sets",
        json={
            "request_id": str(uuid4()),
            "set_number": 1,
            "reps": 10,
        },
    )
    assert response.status_code == 403


def test_miniapp_fixture_matches_real_session_response_contract():
    gen = _client(_workout(sets=(), target_sets=3))
    client, _ = next(gen)
    actual = client.get("/api/sessions/1").json()
    path = Path(__file__).parents[3] / "miniapp/src/lib/session-response.fixture.json"
    fixture = json.loads(path.read_text())
    assert actual.keys() == fixture.keys()
    assert "telegram_user_id" not in actual
    assert actual["planned_exercises"][0].keys() == fixture["planned_exercises"][0].keys()
