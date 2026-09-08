# Links and authentication

- `session_web_url(session_id)` returns an owner route at `/session/<id>`.
- `session_web_url(session_id, planned_exercise_id)` returns `/session/<id>/exercise/<planned_id>`.
- `share_web_url(share_token)` returns `/session/share/<token>` and is read-only.
- Owner session links should be sent as Telegram Web App buttons from the same bot identity configured in Gym Tracker.
- Read-only share links can be shared as ordinary links, but they must not be presented as writable owner sessions.
