# Hermes provenance and usage

Provenance:

- Skills docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/
- Accessed: 2026-09-07

Capability-version caveat: this reference only states behaviors confirmed in the official skills docs above.

## What Hermes loads by default

- `~/.hermes/skills/` is the primary local skills directory.
- Extra directories can be added with `skills.external_dirs` in `~/.hermes/config.yaml`.
- Project-local discovery is limited to `.hermes/skills/` and `.agents/skills/` under a trusted repo.
- A repo root `skills/` directory is not loaded automatically by Hermes.

## Recommended ways to use this repo's skills with Hermes

Option 1: copy the whole skill directory into `~/.hermes/skills/`.

Option 2: if you already keep skills in this repo, add the repo `skills/` path to
`skills.external_dirs` in `~/.hermes/config.yaml`.

This reference does not modify your local config automatically. If you choose the
copy route, copy the whole directory rather than only `SKILL.md` so relative
references remain valid.

## Published installs

Once a skill is pushed to a GitHub repo with the expected layout, Hermes supports
direct installation with:

```bash
hermes skills install owner/repo/skills/name
```

Until then, local copy or `external_dirs` is the working path.

## Safety rules

- Register MCP against the host-visible endpoint, normally `http://127.0.0.1:8001/mcp` on the Docker host.
- Keep MCP private; do not publish it directly.
- Reuse the same Telegram bot identity in the agent and in Gym Tracker.
