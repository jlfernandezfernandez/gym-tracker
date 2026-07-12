from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import Settings, get_settings


class S3Storage:
    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.bucket = settings.s3_bucket
        self.client = client or boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
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
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )

    def open(self, key: str) -> dict[str, Any]:
        return self.client.get_object(Bucket=self.bucket, Key=key)

    def head_bucket(self) -> None:
        self.client.head_bucket(Bucket=self.bucket)


@lru_cache
def get_storage() -> S3Storage:
    return S3Storage(get_settings())
