# Delete a planned exercise without sets

Issue: [#37](https://github.com/jlfernandezfernandez/gym-tracker/issues/37)

## Goal

Let the coach remove one planned exercise through MCP when the athlete asks to
drop it completely. The exercise may belong to a `planned`, `in_progress`, or
`completed` session, but it must have no performed sets.

## Scope

- Add `DELETE /sessions/{session_id}/exercises/{planned_id}`.
- Add the MCP tool `delete_planned_exercise` with `telegram_user_id` scoping.
- Tell the MCP coach to delete, rather than skip, when the athlete asks to
  remove an exercise completely.
- Return the updated session so subsequent session and current-state reads use
  the remaining exercises immediately.

The Mini App gets no new delete control. It shows the updated plan on its next
session read or when reopened; an already-open screen does not receive live
external updates.

## API behavior

The endpoint reuses the existing session flow:

1. Load the session and its planned exercises and performed sets.
2. Check that the authenticated user owns the session.
3. Find `planned_id` inside that session.
4. Reject the request with `422` if the exercise has any performed set.
5. Delete the planned exercise, commit, and return the reloaded `SessionOut`.

Existing helpers provide the error behavior:

- `404` when the session does not exist.
- `403` when it belongs to another user.
- `404` when the planned exercise is not part of the session.
- `422` when at least one performed set exists.

Session status does not restrict deletion. Orders are not renumbered: current
code sorts by `order`, tolerates gaps, and exposes no endpoint for appending a
new exercise to an existing session.

## Derived state

No current-state mutation is required. `current_state()` derives the current
exercise and all counts from `workout.planned_exercises` on every call. After
deletion, the next remaining `pending` or `in_progress` exercise becomes
current naturally. Completed sessions continue to report no current exercise.

## MCP behavior

`delete_planned_exercise(session_id, planned_exercise_id,
telegram_user_id=None)` sends the nested `DELETE` request and returns the
updated session. Its description states that deletion is only for exercises
without logged sets and that `telegram_user_id` is required on multi-user
instances.

## Verification

One focused backend test module exercises the route with the existing models
and a minimal fake async database boundary. It verifies:

- an owner can delete a zero-set exercise from `planned`, `in_progress`, and
  `completed` sessions;
- another user cannot delete it;
- an exercise with any performed set returns `422` and is not deleted;
- the successful response no longer contains the exercise, so derived counts
  and current selection use the remaining plan.

The MCP function is a direct request wrapper, matching existing tools such as
`delete_set`; no duplicate transport test is needed.

## Explicitly excluded

- Soft deletion or a new `removed` status.
- Database migrations or cascade changes.
- Reordering the remaining exercises.
- A Mini App delete button.
- Polling, WebSockets, or cache synchronization for MCP-originated changes.
