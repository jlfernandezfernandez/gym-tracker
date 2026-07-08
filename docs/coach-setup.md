# Coach Setup Guide

This guide explains how to connect a Hermes Agent profile as the gym coach for your gym-tracker instance.

## Prerequisites

- A running gym-tracker instance (API + Postgres + Mini App)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Hermes Agent installed and configured

## 1. Create a Hermes profile

```bash
hermes profile create gym-coach
```

This creates an isolated profile at `~/.hermes/profiles/gym-coach/` with its own config, memory, skills, and MCPs.

## 2. Configure the Telegram bot

Edit `~/.hermes/profiles/gym-coach/config.yaml` and set the Telegram bot token:

```yaml
telegram:
  bot_token: "YOUR_BOT_TOKEN"
```

Or put it in `~/.hermes/profiles/gym-coach/.env`:

```
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
```

## 3. Copy the MCP server

```bash
cp mcp/gym_tracker_mcp.py ~/.hermes/profiles/gym-coach/mcps/gym_tracker_mcp.py
```

## 4. Register the MCP

```bash
gym-coach mcp add gym_tracker -- ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/profiles/gym-coach/mcps/gym_tracker_mcp.py
```

Set the API base URL for your instance:

```bash
# In ~/.hermes/profiles/gym-coach/.env or config.yaml
GYM_TRACKER_API_BASE=https://your-domain.com/api
GYM_TRACKER_APP_BASE=https://your-domain.com
```

Test it:

```bash
gym-coach mcp test gym_tracker
```

## 5. Set up the coach personality

Create `~/.hermes/profiles/gym-coach/SOUL.md`:

```markdown
You are a personal gym coach inside Telegram.
Spanish casual, direct, practical.
Short messages. No hype.
The chat is the main product. The Mini App is a visual tool.
Learn the athlete, store profile, adapt plans live.
```

## 6. Create the coach skill

Create `~/.hermes/profiles/gym-coach/skills/gym-coach/SKILL.md`.

See the `templates/` directory in this repo for a starting point.

Key points the skill should cover:

- Read athlete profile before training (`get_athlete_profile`)
- Onboarding conversation if profile is incomplete
- Quick check-in before each session
- Create plan via MCP, send Mini App URL
- Log sets, change exercises, handle pain/equipment issues
- Save gym constraints to profile (`patch_athlete_profile`)
- Builder mode for app improvements

## 7. Configure the Telegram bot

```bash
# Set bot description
curl -s "https://api.telegram.org/bot<TOKEN>/setMyDescription" -d "description=Tu entrenador personal en Telegram"

# Set menu button to open Mini App
curl -s "https://api.telegram.org/bot<TOKEN>/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{"menu_button":{"type":"web_app","text":"🏋️ Gym","web_app":{"url":"https://your-domain.com/"}}}'

# Set commands
curl -s "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[
    {"command":"start","description":"Empezar"},
    {"command":"entrenar","description":"Voy a entrenar"},
    {"command":"plan","description":"Ver plan actual"},
    {"command":"historial","description":"Ver historial"},
    {"command":"ayuda","description":"Ayuda"}
  ]}'
```

## 8. Start the gateway

```bash
gym-coach gateway run
```

Or as a systemd service (recommended for production):

```ini
# ~/.config/systemd/user/hermes-gateway-gym-coach.service
[Unit]
Description=Hermes Gateway - Gym Coach
After=network.target

[Service]
Type=simple
ExecStart=/home/%u/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main --profile gym-coach gateway run
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user enable hermes-gateway-gym-coach
systemctl --user start hermes-gateway-gym-coach
```

## 9. Verify

```bash
gym-coach doctor                    # profile health check
gym-coach mcp test gym_tracker      # MCP connectivity
gym-coach gateway status            # gateway running?
```

Send a message to your bot in Telegram. It should respond as the coach.

## Environment variables for the MCP

| Variable | Default | Description |
|---|---|---|
| `GYM_TRACKER_API_BASE` | `https://gym.jordixlab.com/api` | API base URL |
| `GYM_TRACKER_APP_BASE` | `https://gym.jordixlab.com` | Mini App base URL |

Set these in the Hermes profile's `.env` file or `config.yaml`.