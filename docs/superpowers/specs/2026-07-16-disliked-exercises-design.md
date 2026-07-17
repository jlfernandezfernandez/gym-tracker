# Disliked exercises: mark and filter

Issue: [#25](https://github.com/jlfernandezfernandez/gym-tracker/issues/25)

## Goal

Let the athlete (or coach) mark exercises they don't like so the system
excludes them from future plans. The athlete can view and manage their
disliked list from the Mini App Catalog screen.

## Scope

- New table `athlete_disliked_exercises` (athlete_id, exercise_id, created_at).
- Drop the existing `disliked_exercises` text column from `athlete_profiles`.
- API: `GET/POST/DELETE /api/disliked-exercises`, plus `exclude_disliked` query
  param on `GET /api/exercises`.
- MCP: `dislike_exercise`, `undislike_exercise`, `list_disliked_exercises`
  tools; `exclude_disliked` param on `list_exercises`.
- Planifier: `POST /coach/plan` rejects plans containing disliked exercises
  with HTTP 422.
- Mini App: disliked section inside the Catalog screen with toggle between
  "All exercises" and "Disliked" views.

## DB

New table `athlete_disliked_exercises`:

| Column | Type | Notes |
|--------|------|-------|
| id | int PK | auto-increment |
| athlete_id | int FK → athlete_profiles.id | |
| exercise_id | int FK → exercises.id | |
| created_at | timestamp | default now |

Unique constraint on `(athlete_id, exercise_id)`.

Migration also drops `disliked_exercises` text column from `athlete_profiles`.

## API

New router `app/features/disliked/routes.py` with prefix `/disliked-exercises`:

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/api/disliked-exercises` | — | list of disliked exercises with exercise detail |
| POST | `/api/disliked-exercises` | `{exercise_id}` | created row |
| DELETE | `/api/disliked-exercises/{exercise_id}` | — | `{ok: true}` |

All endpoints scoped by `current_user_id` (telegram user from auth header).

Modify existing `GET /api/exercises`:

- Add query param `exclude_disliked: bool = False`.
- When true, filter out exercises in the athlete's disliked list.

## MCP

Three new tools in `gym_tracker_mcp.py`:

| Tool | Params | Calls |
|------|--------|-------|
| `dislike_exercise` | exercise_id, telegram_user_id | POST `/disliked-exercises` |
| `undislike_exercise` | exercise_id, telegram_user_id | DELETE `/disliked-exercises/{exercise_id}` |
| `list_disliked_exercises` | telegram_user_id | GET `/disliked-exercises` |

Modify `list_exercises` MCP tool: add `exclude_disliked: bool = False` param,
pass as query string.

## Planifier

In `coach_plan` (POST `/coach/plan`):

After validating exercises exist, check if any are in the athlete's disliked
list. If so, raise HTTP 422 with the disliked exercise ids so the coach knows
to pick alternatives.

No auto-substitution — the coach (LLM) decides what to pick instead.

## Mini App

Inside the Catalog screen:

1. Add "No me gusta" as a category pill in the horizontal body_part filter
   row (next to "Todos", "chest", "back", etc.).
2. When "No me gusta" is selected, fetch and display the disliked exercises
   list instead of filtering the catalog by body_part.
3. Each exercise card in the catalog gets a small dislike button (thumbs down
   or heart-off icon) to mark it as disliked.
4. Each exercise card in the disliked view gets an undislike button to remove
   it from the list.
5. Tapping dislike/undislike calls the API and updates the list optimistically.

No new screen, no new nav tab — just a category within Catalog.

## Bug fix: dark mode pill contrast

The active category pill uses `bg-ink text-white`. In dark mode, `--color-ink`
is `#f5f5f7` (near white), causing white text on white background.

Fix: change `text-white` to `text-canvas` on the active pill. This ensures
contrast in both modes:
- Light: dark ink background + light canvas text
- Dark: light ink background + dark canvas text

## Verification

- Backend tests for the disliked routes: create, list, delete, unique
  constraint, user scoping.
- Backend test for `exclude_disliked` filter on exercises list.
- Backend test for planifier rejecting disliked exercises.
- MCP tools are thin wrappers; no duplicate transport tests needed.

## Explicitly excluded

- `created_by` audit field (who marked it as disliked).
- Auto-substitution of disliked exercises in plans.
- Bulk dislike/undislike operations.
- Disliked count badges or notifications.
