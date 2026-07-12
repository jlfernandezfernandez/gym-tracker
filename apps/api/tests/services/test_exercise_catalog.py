import asyncio
import io
import json
import tarfile
from pathlib import Path

import pytest

from app.core.config import Environment, Settings
from app.features.exercises.catalog import (
    DatasetManifest,
    extract_archive,
    install_dataset,
    manifest_url,
    parse_exercise,
)
from app.models import CatalogState

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


def settings(root: Path) -> Settings:
    return Settings(
        environment=Environment.DEVELOPMENT,
        database_url="postgresql+asyncpg://x:x@localhost/x",
        exercise_dataset_root=root,
    )


def add_file(archive: tarfile.TarFile, name: str, content: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(content)
    archive.addfile(info, io.BytesIO(content))


def fixture_archive(path: Path, extra_name: str | None = None) -> None:
    with tarfile.open(path, "w:gz") as archive:
        add_file(archive, "data/exercises.json", json.dumps([ENTRY]).encode())
        add_file(archive, "images/0001.jpg", b"jpg")
        add_file(archive, "videos/0001.gif", b"gif")
        add_file(archive, "LICENSE", b"MIT")
        add_file(archive, "NOTICE.md", b"terms")
        if extra_name:
            add_file(archive, extra_name, b"bad")


def test_parse_exercise_maps_release_metadata() -> None:
    parsed = parse_exercise(ENTRY)
    assert parsed["external_id"] == "0001"
    assert parsed["name"] == "Abdominal"
    assert parsed["image_url"] == "/exercise-media/images/0001.jpg"


def test_manifest_requires_exact_version_and_checksum() -> None:
    payload = {
        "schema_version": 1,
        "dataset_version": "v1.0.0",
        "archive": "exercise-dataset.tar.gz",
        "sha256": "a" * 64,
        "exercise_count": 1,
        "media_count": 2,
    }
    assert DatasetManifest.parse(payload, "v1.0.0").media_count == 2
    with pytest.raises(ValueError, match="version"):
        DatasetManifest.parse(payload, "v2.0.0")


def test_release_url_is_pinned() -> None:
    assert manifest_url(settings(Path("/tmp/data"))).endswith(
        "/releases/download/v1.0.0/manifest.json"
    )


def test_extracts_only_verified_contents(tmp_path: Path) -> None:
    archive = tmp_path / "dataset.tar.gz"
    destination = tmp_path / "out"
    fixture_archive(archive)
    entries, media_count = extract_archive(
        archive, destination, DatasetManifest("v1.0.0", "a" * 64, 1, 2)
    )
    assert entries == [ENTRY]
    assert media_count == 2
    assert (destination / "videos/0001.gif").read_bytes() == b"gif"


def test_rejects_unexpected_or_unsafe_contents(tmp_path: Path) -> None:
    archive = tmp_path / "dataset.tar.gz"
    fixture_archive(archive, "../escape")
    with pytest.raises(ValueError, match="Unsafe"):
        extract_archive(archive, tmp_path / "out", DatasetManifest("v1.0.0", "a" * 64, 1, 2))


def test_matching_install_skips_network(tmp_path: Path) -> None:
    configured = settings(tmp_path)
    configured.exercise_dataset_dir.mkdir(parents=True)
    (configured.exercise_dataset_dir / ".installed").write_text("a" * 64)

    class FakeSession:
        async def get(self, model, key):
            assert key == 1
            return CatalogState(dataset_version="v1.0.0", sha256="a" * 64)

    result = asyncio.run(install_dataset(FakeSession(), configured))  # type: ignore[arg-type]
    assert result.skipped is True
