---
name: gym-tracker-install
description: 'Install, maintain, or troubleshoot Gym Tracker with Docker, Telegram, MCP, OpenClaw, or Hermes. Use for localhost vs production routing, safe health checks, skill copy/install, and agent setup without leaking secrets.'
---

# Gym Tracker install and operations

Use this skill when you need to install Gym Tracker, update it safely, validate a local stack, or explain how an agent should connect without exposing secrets.

## Guardrails

- Never print secret values from `.env`, Docker config, agent config, or environment variables.
- Never read the database directly for diagnostics.
- Never rewrite `.env` automatically.
- Never run `sudo` automatically.
- Never run `docker compose down -v` unless the user explicitly asks to delete data.
- Never recommend exposing PostgreSQL or MCP publicly.

## Procedure

1. Pick the mode using [docker-local-vs-production.md](./references/docker-local-vs-production.md).
2. Validate the local stack with [diagnose-local.sh](./scripts/diagnose-local.sh) when the repo is available.
3. Check App and MCP `health` and `ready` before troubleshooting the agent layer.
4. Use [openclaw.md](./references/openclaw.md) for OpenClaw install and skill loading.
5. Use [hermes.md](./references/hermes.md) for Hermes provenance and version caveats.
6. Use [telegram-and-links.md](./references/telegram-and-links.md) when setup crosses Mini App authentication, owner links, or share links.

## Notes

- OpenClaw supports explicit local install from a directory containing `SKILL.md`; see [openclaw.md](./references/openclaw.md).
- Hermes uses `~/.hermes/skills/` as its primary directory and can scan additional paths through `skills.external_dirs`; project-local loading is limited to `.hermes/skills/` and `.agents/skills/` after trust.
- When copying this skill elsewhere, copy the whole directory so the relative references, script, and tests stay valid.
- For Gym Tracker product usage after install, switch to `gym-tracker`.