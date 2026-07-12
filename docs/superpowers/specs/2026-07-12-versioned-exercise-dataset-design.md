# Versioned exercise dataset distribution

## Goal

Make first install and upgrades deterministic, fast, and suitable for Docker, Coolify, and offline self-hosting. Gym Tracker must never depend on a mutable Git branch or thousands of individual GitHub requests during startup.

## Producer

The separate `exercises-dataset-es` repository remains the source of truth. It publishes an immutable GitHub Release for each dataset version with two assets:

```text
manifest.json
exercise-dataset.tar.gz
```

Use `tar.gz` because Python's standard library reads it without a system binary or new application dependency. The archive contains `data/exercises.json`, `images/`, `videos/`, `LICENSE`, and `NOTICE.md` under stable relative paths.

The producer workflow validates the JSON schema, checks that every referenced media file exists, creates the archive, computes SHA-256, and writes this manifest shape:

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

Release tags and assets are immutable. `latest` may exist for humans but consumers never use it.

## Consumer configuration

Replace the mutable repository setting with:

```text
EXERCISE_DATASET_VERSION=v1.0.0
EXERCISE_DATASET_RELEASE_BASE=https://github.com/jlfernandezfernandez/exercises-dataset-es/releases/download
EXERCISE_DATASET_ARCHIVE=
```

`EXERCISE_DATASET_ARCHIVE` is an optional local archive path for offline installs and tests. When it is set, the manifest lives beside the archive as `manifest.json`; no network request is made.

The application image includes CA certificates for HTTPS downloads. It does not contain the dataset itself.

## Installed state

Add a singleton `CatalogState` SQLModel table and Alembic migration with `dataset_version`, `sha256`, and `installed_at`. If stored version and checksum match the configured manifest, bootstrap skips the download and import entirely.

Add `active: bool = true` to `Exercise`. A successful sync marks records present in the release active and records absent from the release inactive. Historical sessions retain their foreign keys and continue to render inactive exercises; new searches, facets, records selection, and coach planning exclude them.

## Import flow

1. Resolve the configured release or local files.
2. Parse and validate the manifest before downloading the archive.
3. Download the archive once to a named temporary file while calculating SHA-256.
4. Reject a checksum mismatch, unsupported manifest schema, unsafe archive member, missing dataset, or mismatched counts.
5. Read archive members without extracting them to the filesystem.
6. Parse and upsert catalog metadata in one database transaction.
7. Upload only media keys absent from S3, with bounded concurrency of four uploads.
8. Update `CatalogState` only after metadata and media finish successfully, then commit.

Archive members are accepted only when their normalized names are explicitly listed in the manifest-derived dataset/media set. Absolute paths, `..`, symlinks, devices, and unexpected files are rejected or ignored according to type; nothing is extracted.

The existing per-file raw downloader and repository-base setting are removed. The uncommitted semaphore override becomes obsolete.

## Failure behavior

- First install fails clearly if the configured release cannot be verified; the API must not start with an empty partial catalog.
- An upgrade failure rolls back database changes and leaves the previous `CatalogState` unchanged. Already uploaded immutable media may remain safely in S3.
- Existing installations already on the configured version make no network requests.
- A rerun after interruption is idempotent.

## Operations

Dataset updates happen only by changing the pinned version in a Gym Tracker release or explicitly overriding the environment variable. Document release creation, offline mounting, version inspection, and rollback.

Do not delete unreferenced S3 media automatically. Storage cleanup is a separate, explicit maintenance operation because deletion offers little value and raises rollback risk.

## Verification

- Unit tests cover manifest parsing, checksum failure, archive safety, local mode, release URL construction, version skip, upsert/activation, and retry behavior.
- Integration tests use a tiny in-memory fixture archive and fake S3.
- Bootstrap tests prove a matching version performs zero network and S3 writes.
- Docker and Coolify first-install documentation uses the pinned version and explains upgrade behavior.

