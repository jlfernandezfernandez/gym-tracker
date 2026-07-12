from scripts.bootstrap import ensure_bucket


class EventuallyReadyClient:
    def __init__(self) -> None:
        self.attempts = 0

    def create_bucket(self, **kwargs) -> None:
        assert kwargs == {"Bucket": "media"}
        self.attempts += 1
        if self.attempts == 1:
            raise ConnectionError("not ready")


class UnavailableStorage:
    bucket = "media"

    def __init__(self) -> None:
        self.client = EventuallyReadyClient()

    def head_bucket(self) -> None:
        raise ConnectionError("not ready")


def test_ensure_bucket_retries_until_storage_is_ready() -> None:
    storage = UnavailableStorage()
    ensure_bucket(storage, attempts=2, delay=0)
    assert storage.client.attempts == 2
