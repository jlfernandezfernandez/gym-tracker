# Telegram and link rules

- Gym Tracker does not receive Telegram messages by itself; the agent gateway does.
- `TELEGRAM_BOT_TOKEN` in Gym Tracker must be the same bot token the agent uses to open the Mini App.
- Owner Mini App URLs come from `session_web_url(...)` and resolve to `/session/<id>`.
- Read-only share URLs come from `share_web_url(...)` and resolve to `/session/share/<token>`.
- A normal browser link is acceptable for read-only share views, but owner session routes should open from a Telegram Web App button so Telegram can provide signed `initData`.