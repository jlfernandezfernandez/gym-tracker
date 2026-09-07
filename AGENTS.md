# Gym Tracker agent routes

Use this repo as API + MCP + Mini App infrastructure, not as a bundled agent runtime.

## Discover

- Start with [README.md](README.md).
- Installation and networking: [docs/install-docker.md](docs/install-docker.md).
- Telegram identity and Mini App links: [docs/setup-telegram.md](docs/setup-telegram.md).
- MCP endpoint and agent connection rules: [docs/agent-setup.md](docs/agent-setup.md).

## Install and operate

- Load [skills/gym-tracker-install/SKILL.md](skills/gym-tracker-install/SKILL.md) for Docker setup, localhost versus production, readiness checks, and safe diagnostics.
- That skill is self-contained: copy the whole directory if you need it in another workspace.

## Use the product

- Load [skills/gym-tracker/SKILL.md](skills/gym-tracker/SKILL.md) for onboarding, workout operation, owner-only session links, and read-only share links.
- That skill is also self-contained and copyable as a whole directory.

## Code and customization

- When editing agent files in this repo, keep requirements plain, portable, and readable without depending on VS Code-only workflows.
- Treat [templates/SKILL.md](templates/SKILL.md) and [templates/SOUL.md](templates/SOUL.md) as compatibility templates, not as authority to install, deploy, or replace an operator persona or workflow.