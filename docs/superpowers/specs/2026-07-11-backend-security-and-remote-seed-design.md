# Backend security and remote exercise seed

## Goal

Harden the backend without changing successful API responses, and make exercise provisioning a single coherent remote-to-PostgreSQL-and-S3 operation. The application must not store or serve a local copy of the exercise catalog or media.

## Exercise seed architecture

`operations.py` remains the only release command. It applies migrations, ensures the S3 bucket exists, and invokes one exercise seed workflow.

The exercise seed downloads `exercises.json` once from the `main` branch of `jlfernandezfernandez/exercises-dataset-es`. The downloaded data stays in memory. The workflow then:

1. Parses and validates the remote catalog.
2. Inserts new exercises in PostgreSQL and updates metadata for existing exercises, matched by `external_id`.
3. Leaves database exercises that disappeared from the source untouched so historical sessions keep valid references.
4. Lists the existing S3 keys once.
5. Downloads and uploads only referenced images and GIFs that are absent from S3.

Existing S3 objects are not overwritten. A later seed therefore adds new catalog entries and missing media with minimal network work. Metadata changes are applied to PostgreSQL on every run.

There is no local fallback. `backend/exercise_data`, the local media-serving branch, and local download functions are removed. If the remote dataset or S3 is unavailable, the release command fails rather than starting with a partially provisioned catalog.

## API and storage boundaries

The API reads exercise metadata from PostgreSQL and media from the dedicated S3 bucket. The existing `/exercise-media/{path}` URL may remain as an S3-only proxy so stored database URLs and clients do not need to change, but it must never read from disk.

S3 configuration is mandatory for release provisioning. The API readiness check continues to verify PostgreSQL and S3.

## Security changes

- An authenticated Telegram user may access only sessions whose `telegram_user_id` equals their identity. Unowned sessions remain accessible only in explicit authentication-disabled development mode.
- Telegram `auth_date` is required, must be an integer, must not be expired, and must not be unreasonably far in the future.
- Expected integrity conflicts are translated into controlled HTTP errors instead of leaking database errors.
- PostgreSQL remains the final authority for uniqueness and concurrent writes.
- Athlete profiles gain a uniqueness guarantee for non-null `telegram_user_id` values.

## Session refactor

Routers and models remain in their current structure. No repository or generic service layer is introduced.

`sessions.py` gains only focused private helpers for finding a planned exercise within an already loaded session and for handling known integrity conflicts. Session mutations retain this flow:

1. Validate input and authenticate.
2. Load the session and relationships.
3. Verify ownership.
4. Apply the state transition.
5. Commit the transaction.
6. Reload and serialize the session.

Duplicate exercise order values are rejected before plan/import persistence. Concurrent set logging relies on the database uniqueness constraint and returns a controlled conflict response if another request wins the race.

## Validation and errors

Measurement schemas reject clearly invalid negative values and percentages outside their valid range. Existing successful response formats and endpoint paths remain unchanged.

Remote dataset, PostgreSQL, migration, or S3 failures make `operations.py` exit unsuccessfully. Errors identify the failed provisioning stage without exposing credentials.

## Verification

Add the smallest useful backend test suite covering:

- remote dataset parsing and metadata mapping;
- selection and upload of missing S3 media;
- absence of local media fallback;
- strict session ownership;
- Telegram timestamp validation;
- duplicate plan ordering;
- controlled handling of concurrent set conflicts;
- profile uniqueness and measurement validation.

Update README, Compose configuration, contributor documentation, and attribution text to describe the single remote seed workflow accurately.

## Non-goals

- Pinning a dataset revision; deployments intentionally consume `main`.
- Deleting database exercises removed upstream.
- Overwriting existing S3 media.
- Adding a generic repository/service architecture.
- Running seed work inside API startup.
