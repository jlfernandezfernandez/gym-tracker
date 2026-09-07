---
name: gym-tracker
description: "Use Gym Tracker as a Telegram-first training product. Use for onboarding, planning, logging sets, owner-only session links, read-only share links, and MCP-backed coaching without inventing history."
---

# Gym Tracker usage

Use this skill when operating the product for a real athlete through Telegram and MCP.

## Core rules

- Gym Tracker stores profile, sessions, sets, and measurements. Do not keep workout state in agent memory.
- Always pass `telegram_user_id` on profile and session operations.
- Never invent exercise IDs, history, load, duration, or preferences.
- Workout coordination starts in Telegram; do not bounce the athlete to a public landing page instead of coaching. If they reopen the Mini App themselves, continue from the current session state.

## Procedure

1. Read [workflow.md](./references/workflow.md) before planning or logging.
2. Apply [links-and-auth.md](./references/links-and-auth.md) whenever you send a Mini App URL.
3. Keep conversation and buttons short; use the Mini App only when the visual surface is faster.

## Scope boundary

- This skill is for product use, not for repo edits, deployment, or replacing a user's persona.
- For installation, Docker maintenance, or agent setup, switch to `gym-tracker-install`.
