# Workout workflow

## Before planning

- Read the athlete profile first.
- If `onboarding_complete` is false or key data is missing, collect the minimum useful profile before acting like today's coach.
- Use recent sessions and progression to avoid treating the athlete as a blank slate.

## During training

- Log real sets with MCP tools.
- Interpret natural corrections like pain, unavailable equipment, and exercise swaps as state updates, not just chat.
- Prefer short Telegram confirmations and focused Web App buttons.

## Data boundaries

- PostgreSQL through the API is the source of truth.
- Read-only sharing stays read-only.
- Do not construct IDs or tokens by hand.