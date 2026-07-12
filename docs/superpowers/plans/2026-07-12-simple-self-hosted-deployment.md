# Simple Self-Hosted Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Docker-host and Coolify production installs deterministic for existing self-hosted agent users.

**Architecture:** Keep the development source-build Compose, add a separate production Compose that consumes versioned GHCR images, and keep the App as the only public service. Add API readiness checks for PostgreSQL and S3, then make MCP, Docker healthchecks, CI, and docs use the same contract.

**Tech Stack:** FastAPI, SQLAlchemy async engine, boto3/MinIO, Docker Compose, GitHub Actions Buildx, GHCR, Telegram Mini Apps, Coolify.

## Global Constraints

- Official production paths are Docker Compose on an agent host and one Docker Compose resource in Coolify.
- MCP remains private; `COACH_API_KEY` is only MCP-to-API authentication.
- PostgreSQL and MinIO never publish host ports in the production Compose.
- Production images target `linux/amd64` and `linux/arm64`.
- `/health` is liveness; `/ready` is dependency readiness and returns 503 without secret details.
- MCP Apps and public inbound MCP authentication remain deferred.

### Task 1: Implement API readiness

**Files:**
- Modify: `backend/app/api/routes/health.py`
- Modify: `backend/tests/api/test_health.py`
- Modify: `Dockerfile`

**Interfaces:**
- Produce `GET /ready` and `/api/ready` with `{"status":"ready","version":"1.0.0"}`.
- A dependency failure returns HTTP 503 and `{"status":"not ready"}`.

- [ ] Add an async dependency checker that executes `SELECT 1` through the cached async session factory and calls `get_storage().head_bucket()`.
- [ ] Add `/ready` to the existing health router; catch dependency exceptions and return a stable 503 response without the exception text.
- [ ] Add tests for ready success, dependency failure, root `/api/ready`, and unchanged liveness behavior. Monkeypatch the checker so tests never need PostgreSQL or MinIO.
- [ ] Change the App Docker healthcheck to `/ready` and update the Coolify healthcheck instructions.
- [ ] Run `cd backend && uv run pytest tests/api/test_health.py -q` and expect all tests to pass.

### Task 2: Add the production Compose contract

**Files:**
- Create: `compose.production.yml`
- Create: `.env.production.example`
- Modify: `Dockerfile.mcp`
- Modify: `docker-compose.yml`

**Interfaces:**
- `compose.production.yml` uses `ghcr.io/jlfernandezfernandez/gym-tracker:${GYM_TRACKER_VERSION:-latest}` and `ghcr.io/jlfernandezfernandez/gym-tracker-mcp:${GYM_TRACKER_VERSION:-latest}`.
- The production stack exposes App on `${APP_PORT:-8000}` and MCP on `127.0.0.1:${MCP_PORT:-8001}` only.

- [ ] Copy the five-service topology into `compose.production.yml` using image references, no `container_name`, no fixed volume `name`, no MinIO host ports, and no PostgreSQL host ports.
- [ ] Reuse one YAML environment anchor for App and bootstrap so database, storage, Telegram, CORS, and agent secrets cannot drift.
- [ ] Tie MinIO root credentials to the documented S3 credentials and require production variables with Compose `${VAR:?message}` checks where appropriate.
- [ ] Set the production MCP endpoint to the internal App hostname and keep `GYM_TRACKER_APP_BASE` public.
- [ ] Add `.env.production.example` with placeholders, no working secrets, and explicit matching-key notes.
- [ ] Improve the development Compose comments and MinIO health/startup notes without changing its convenient local defaults.
- [ ] Change the MCP image healthcheck to `/ready`, then run `docker compose -f compose.production.yml config` with placeholder values and expect valid output.

### Task 3: Make CI and releases verify the contract

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- CI readiness polling must exit non-zero after 30 failed attempts.
- A tag `vX.Y.Z` publishes multi-arch App and MCP images to GHCR with semver tags and `latest`.

- [ ] Replace the smoke-test loop with a boolean success flag and `test "$ready" = true` after the retry limit.
- [ ] Add explicit `/ready` and `/health` checks for both services after startup.
- [ ] Add a release workflow triggered by `v*` tags with `packages: write`, QEMU, Buildx, GHCR login, metadata tags, and `linux/amd64,linux/arm64` builds for both Dockerfiles.
- [ ] Keep pull requests from publishing images; verify YAML syntax and action inputs in the diff.
- [ ] Run the backend test/lint commands and a local Compose config check where Docker is available.

### Task 4: Document the two supported install journeys

**Files:**
- Create: `docs/install-docker.md`
- Create: `docs/install-coolify.md`
- Create: `docs/setup-telegram.md`
- Create: `docs/backup-and-update.md`
- Modify: `docs/agent-setup.md`
- Modify: `README.md`

**Interfaces:**
- Every guide ends with concrete checks: App ready, MCP ready, tool discovery, Telegram identity/write, and persistence.

- [ ] Write the Docker guide for an existing Hermes/OpenClaw host: release Compose, production env, `up -d`, HTTPS through the operator's proxy/tunnel, localhost MCP, and verification.
- [ ] Write the Coolify guide for one Compose resource, App domain, internal services, persistent storage, and `/ready`.
- [ ] Write Telegram setup from BotFather and bot token through HTTPS URL, menu button, `web_app` action buttons, signed `initData`, and one end-to-end write test.
- [ ] Add backup/update instructions for PostgreSQL, MinIO, image version pinning, redeploy, restore verification, and the danger of `down -v`.
- [ ] Update agent setup to distinguish local/private MCP from unsupported public MCP and to avoid implying that `COACH_API_KEY` authenticates MCP clients.
- [ ] Make README a short chooser with links to these focused guides and a clear statement that MCP Apps are deferred.

### Task 5: Verify, self-review, and hand off

**Files:**
- Review all modified files and generated workflow/config files.

- [ ] Run `cd backend && uv run ruff format --check .`, `uv run ruff check .`, `uv run pyright`, and `uv run pytest -q`.
- [ ] Run `docker compose config` and `docker compose -f compose.production.yml config` with safe placeholder values if the Docker daemon is available.
- [ ] Run `rtk git diff --check` and inspect the final diff for secret defaults, public MinIO/PostgreSQL ports, fixed container names, stale `/health` readiness claims, and broken relative links.
- [ ] Update the implementation plan status and report any validation blocked by the local Docker daemon.
