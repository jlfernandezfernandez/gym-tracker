# Simple Self-Hosted Deployment Design

## Goal

Make Gym Tracker predictable to install and operate for someone who already
runs Hermes, OpenClaw, or another MCP-capable agent on a Docker host or in
Coolify. Supporting non-technical users without an existing agent is outside
this phase because it would require managed agent, bot, DNS, TLS, backup, and
upgrade services.

## Supported paths

Gym Tracker will present two official production paths:

1. Docker Compose on the same machine as the agent.
2. One Docker Compose stack in Coolify.

The existing source-build Compose remains the development path. Native
installation, Kubernetes, Helm, cloud-specific manifests, and platform-specific
packages for Portainer, Unraid, CasaOS, Synology, or similar systems are not
maintained. Compatible platforms may consume the production Compose without a
separate guide.

## Production topology

The production stack contains PostgreSQL, MinIO, a one-shot bootstrap job, the
App, and the MCP server. PostgreSQL and MinIO use named persistent volumes. The
App and MCP remain stateless.

Only the App is intended for public HTTPS access. The MCP binds to localhost on
a standalone Docker host or remains on Coolify's private network. PostgreSQL and
MinIO do not publish host ports. Remote MCP access is unsupported until inbound
MCP authentication is implemented; `COACH_API_KEY` authenticates MCP-to-API
traffic and must not be described as client authentication.

The production Compose consumes versioned App and MCP images from GHCR. Image
tags follow project releases and can be overridden through one documented
variable for controlled upgrades. Development continues to build local source.

## Release and startup behavior

The App exposes separate liveness and readiness endpoints:

- `GET /health` reports that the HTTP process is alive.
- `GET /ready` reports HTTP 200 only when PostgreSQL and object storage are
  usable; dependency failures return HTTP 503 without leaking secrets.

The MCP readiness endpoint continues to depend on the App readiness endpoint.
The Compose bootstrap job applies migrations, creates the bucket, and syncs the
exercise catalog before the App starts. The operation remains idempotent and
aborts startup on failure.

CI must fail when readiness is never reached. Its retry loop records success
explicitly and exits non-zero after the final failed attempt. CI builds both
images; release automation publishes immutable version tags and a moving
`latest` tag only for stable releases.

## Docker installation experience

The production quick start is limited to these conceptual actions:

1. Download or clone the release configuration.
2. Copy `.env.production.example` to `.env` and fill the required values.
3. Run `docker compose -f compose.production.yml up -d`.
4. Verify the App and MCP readiness checks.
5. configure HTTPS and Telegram using the dedicated guide.

The production environment example contains no usable default secrets. It
groups values by App, Telegram, database, storage, and agent connection, and
states which paired values must match. The development `.env.example` remains
safe and convenient for local development.

The production Compose avoids fixed `container_name` and globally fixed volume
names so multiple projects and Coolify environments cannot collide. It does not
publish the MinIO console.

## Coolify installation experience

The recommended Coolify path imports the repository as one Docker Compose
resource. Coolify provides the shared network, reverse proxy, TLS, environment
variables, and persistent storage. The App receives the public domain; MCP,
PostgreSQL, and MinIO stay internal.

The current four-resource procedure is retained only as an advanced topology
for operators who deliberately use managed PostgreSQL or shared object storage.
It must not be the first path shown.

## Telegram setup contract

The Telegram guide covers the complete boundary between Gym Tracker and the
agent gateway:

- create or select the bot;
- use the same bot token for the gateway and Mini App validation;
- configure the public HTTPS App URL;
- configure the bot menu button through BotFather;
- ensure session actions are sent as Telegram `web_app` buttons rather than
  ordinary URL buttons;
- verify that the Mini App receives signed `Telegram.WebApp.initData`;
- run one end-to-end test in which the agent creates a session and the athlete
  opens it with write access.

Agent-specific commands belong in focused Hermes and OpenClaw sections. Generic
MCP clients receive the endpoint and security contract without pretending they
support Telegram Web App buttons.

## Documentation structure

The README becomes a product entry point with a short architecture explanation,
an installation chooser, and links to focused guides:

- `docs/install-docker.md`
- `docs/install-coolify.md`
- `docs/setup-telegram.md`
- `docs/agent-setup.md`
- `docs/backup-and-update.md`
- `CONTRIBUTING.md` for development

Each installation guide ends with observable checks for readiness, MCP tool
discovery, Telegram identity, a real write, and persistence after restart. Terms
remain consistent: App, MCP, agent, Mini App, and athlete.

## Testing

Backend tests cover readiness success and dependency failure independently from
liveness. Compose is validated syntactically in CI. The smoke job starts the
development stack, waits for both readiness endpoints, performs health checks,
and fails deterministically on timeout.

Release validation builds `linux/amd64` and `linux/arm64`, starts the production
Compose with test secrets, verifies bootstrap completion, performs one API/MCP
operation, restarts the stack, and confirms persisted data. Documentation
commands must be copied from the tested Compose and workflow rather than
maintained as parallel variants.

## Deferred work

MCP Apps are a separate follow-up. The existing Telegram Mini App and API remain
the canonical UI and data contracts. A future MCP Apps adapter may render a
focused workout view inside compatible MCP hosts without replacing Telegram or
duplicating business logic.

Inbound authentication for a public MCP endpoint is also deferred. Until it is
designed and tested, all official instructions keep MCP access private.
