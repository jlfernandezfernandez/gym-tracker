# Versioned exercise dataset distribution

## Goal

Make first install and upgrades deterministic and fast. Gym Tracker must not depend on a mutable branch, thousands of GitHub requests, MinIO, or fallback distribution modes.

## Producer

The separate `exercises-dataset-es` repository remains the source of truth. Each immutable GitHub Release publishes:

```text
manifest.json
exercise-dataset.tar.gz
```

The archive contains `data/exercises.json`, `images/`, `videos/`, `LICENSE`, and `NOTICE.md`. `tar.gz` works with Python's standard library and needs no application or system compression dependency.

The release workflow validates the JSON schema, verifies every referenced media file, creates the archive, and writes:

```json
{
  "schema_version": 1,
  "dataset_version": "v1.0.0",
  "archive": "exercise-dataset.tar.gz",
  "sha256": "<64 lowercase hex characters>",
  "exercise_count": 1324,
  "media_count": 2648,
  "license": "MIT data; media terms in NOTICE.md"
}
```

Consumers always request an explicit tag. They never use a branch or `latest`.

## Consumer configuration

The only dataset setting is:

```text
EXERCISE_DATASET_VERSION=v1.0.0
```

The release repository and asset names are constants owned by the application. The URL is derived as:

```text
https://github.com/jlfernandezfernandez/exercises-dataset-es/releases/download/{version}/{asset}
```

The application image includes CA certificates. There is no local archive fallback, alternate base URL, or embedded copy.

## Storage

Remove MinIO and S3 entirely. Exercise media is immutable application data, so `app-init` extracts the verified release into a named Docker volume:

```text
/data/exercise-datasets/v1.0.0/
  images/
  videos/
  LICENSE
  NOTICE.md
  .installed
```

FastAPI serves the configured version directory at `/exercise-media`. PostgreSQL remains the only stateful service requiring backup; the dataset volume is reproducible from its pinned release.

Add a singleton `CatalogState` table containing `dataset_version`, `sha256`, and `installed_at`. If the database state and `.installed` marker match the configured version and checksum, bootstrap performs no download or import.

Exercises missing from a newer release are left unchanged. Removing or deactivating historical catalog rows is unnecessary until a real product requirement exists.

## Import flow

1. Download and parse the version's `manifest.json`.
2. If database state and the installed marker match, exit successfully.
3. Download `exercise-dataset.tar.gz` once to a temporary file while calculating SHA-256.
4. Reject an unsupported manifest, checksum mismatch, wrong counts, absolute path, `..`, symlink, device, or unexpected top-level path.
5. Parse `data/exercises.json` and verify its media references exist in the archive.
6. Extract only referenced images/videos plus license files into the version directory.
7. Upsert catalog metadata in one database transaction.
8. Write `.installed`, update `CatalogState`, and commit.

Extraction uses a temporary version directory and renames it only after verification, so the API never sees a partial dataset. Rerunning the same version is idempotent.

The existing raw downloader, S3 storage class, bucket bootstrap, S3 health check, S3 configuration, boto3 dependency, MinIO Compose service, and semaphore override are removed.

## Failure behavior

- First install fails clearly if the pinned release cannot be downloaded or verified.
- An upgrade failure rolls back database changes and removes its temporary directory.
- The previous version directory and catalog state remain available for rollback.
- There is no automatic fallback to stale, mutable, or partial data.

## Operations

Dataset updates happen only by changing `EXERCISE_DATASET_VERSION` in a Gym Tracker release. Rollback means restoring the previous version value and redeploying. Old version directories are not automatically deleted.

Documentation covers release creation, first install, version inspection, upgrade, rollback, and why the dataset volume does not need backup.

## Verification

- Producer tests validate schema, references, counts, archive contents, and checksum.
- Consumer tests cover manifest parsing, release URLs, checksum failure, archive safety, version skip, extraction, upsert, rollback, and idempotency.
- Compose tests confirm MinIO and all S3 variables are gone.
- Docker and Coolify documentation use the pinned version and one persistent PostgreSQL volume plus the reproducible dataset volume.

