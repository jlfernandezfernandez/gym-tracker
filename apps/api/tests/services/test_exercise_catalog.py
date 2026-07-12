from app.features.exercises.catalog import media_paths, parse_exercise

ENTRY = {
    "id": "0001",
    "name": "Sit-up",
    "name_es": "Abdominal",
    "target": "abs",
    "body_part": "waist",
    "equipment": "body weight",
    "secondary_muscles": ["hip flexors"],
    "instructions": {"en": "Lift.", "es": "Sube."},
    "image": "images/0001.jpg",
    "gif_url": "videos/0001.gif",
}


def test_parse_exercise_maps_remote_metadata() -> None:
    parsed = parse_exercise(ENTRY)
    assert parsed["external_id"] == "0001"
    assert parsed["name"] == "Abdominal"
    assert parsed["image_url"] == "/exercise-media/images/0001.jpg"


def test_media_paths_returns_only_missing_unique_paths() -> None:
    assert media_paths([ENTRY, ENTRY], {"images/0001.jpg"}) == ["videos/0001.gif"]
