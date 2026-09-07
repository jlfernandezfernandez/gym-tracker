# Docker local vs production

## Development from a local clone

- Command: `docker compose up -d --build`
- File: `docker-compose.yaml`
- Behavior: builds App and MCP from the checked-out source.
- Network: App listens on `127.0.0.1:8000`, MCP on `127.0.0.1:8001`, PostgreSQL stays private.
- Safe use: local development only. If `TELEGRAM_BOT_TOKEN` is empty, the Mini App does not validate Telegram identity.

## Production on a Docker host

- Command: `docker compose -f compose.production.yml up -d`
- File: `compose.production.yml`
- Behavior: pulls `ghcr.io/jlfernandezfernandez/gym-tracker` and `ghcr.io/jlfernandezfernandez/gym-tracker-mcp`.
- Network: keep `APP_BIND=127.0.0.1` and `MCP_BIND=127.0.0.1`, then publish only the App through an HTTPS reverse proxy.

## Host vs container routing

- Host browser or host-side agent: `http://127.0.0.1:8000` for the App and `http://127.0.0.1:8001/mcp` for MCP.
- Inside Compose: MCP reaches the API at `http://app:8000/api`.
- Do not tell an external agent to use `http://app:8000/api`.
- Do not tell a containerized service on another machine to use `localhost` unless it is the same host network namespace.

## Readiness checks

Run all four checks before debugging Telegram or the agent:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ready
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8001/ready
```

If App `/ready` is green, migrations and dataset bootstrap for that stack have completed.

## Safety reminders

- Same bot identity on both sides: `TELEGRAM_BOT_TOKEN` in Gym Tracker must match the bot configured in the agent.
- No public MCP: keep it on localhost or a private network/VPN.
- No destructive cleanup in routine diagnostics: avoid `down -v` unless the goal is explicit data deletion.