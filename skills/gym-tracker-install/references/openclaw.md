# OpenClaw provenance and usage

Provenance:

- Install docs: https://docs.openclaw.ai/install
- Skills CLI docs: https://docs.openclaw.ai/cli/skills
- Telegram docs: https://docs.openclaw.ai/channels/telegram
- Accessed: 2026-09-07

Capability-version caveat: command names, onboarding screens, and Telegram settings can change across OpenClaw releases. Prefer the official docs above if your build differs.

Use this reference to attach Gym Tracker skills to an existing OpenClaw setup.
If you need a separate OpenClaw runtime, follow the official install docs above,
but this repo does not require installing a new agent runtime by default.

## Manual local install

OpenClaw documents local installation from a directory whose root contains `SKILL.md`:

```bash
openclaw skills install ./path/to/skill --as skill-name
```

Example for this repo:

```bash
openclaw skills install ./skills/gym-tracker-install --as gym-tracker-install
openclaw skills install ./skills/gym-tracker --as gym-tracker
```

Copy or install the whole skill directory so `references/`, `scripts/`, and
`tests/` stay aligned with `SKILL.md`.

## Telegram notes

- Configure the Telegram channel with OpenClaw's current local setup flow from its official docs or editor UI, and enter the bot token there instead of passing secrets on the command line or in chat.
- The Dashboard Mini App in OpenClaw is its own product surface; Gym Tracker owner session URLs still require Telegram-authenticated Mini App opens from the same bot identity.