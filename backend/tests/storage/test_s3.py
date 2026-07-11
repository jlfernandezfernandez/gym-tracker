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
