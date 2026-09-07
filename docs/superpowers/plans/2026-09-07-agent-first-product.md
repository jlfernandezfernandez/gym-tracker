# Agent-first product implementation

Approved direction: improve the existing Telegram miniapp, API and MCP without a rewrite. Agents plan and interpret; people can execute and correct ordinary actions directly. Work is incremental in the current workspace. User authorized local commits after each reviewed, passing task on 2026-09-07; no pushes or production writes.

## Global constraints

- Preserve user ownership, read-only sharing, existing history and the durable set journal.
- Use the API as the source of truth. Reuse existing mutation endpoints.
- Add regression tests before behavior changes; run the focused check immediately after the first edit.
- Do not reinterpret historical reps as seconds or infer assisted loads from names.
- No additional agent runtime, generic repository framework or new service.
- Secrets never go through chat, logs or copied skills. Do not overwrite an agent's configuration or persona.
- Do not claim Hermes/OpenClaw/Telegram integration tested unless actually exercised.

## Tasks

### Task 1: Data and MCP correctness

Fix snapshot completed exercise counts and per-set next targets, preserve identifiers needed for corrections, remove unreachable duplicate code, and avoid requiring the full snapshot before each logged set. Expose optional stable request_id for MCP set retries. Preserve compatibility where possible. Make CSV import reject unknown/ambiguous exercises before writing, convert units explicitly, distinguish RIR/RPE and never invent metrics. Tests must exercise the real parser and API state shape. Owner/share link behavior must be explicit; do not make public share tokens writable.

Status: complete; reviewed with Task 2. API 143, MCP 44, miniapp 122 tests passed; miniapp TypeScript clean. First commit groups Tasks 1 and 2 because their metric contracts overlap.

### Task 2: Explicit timed exercise contract

Introduce explicit execution metric for timed strength sets using duration_seconds, distinct from cardio duration_minutes and strength reps. Maintain existing catalog activity_type compatibility where possible by representing timed execution on the planned exercise; clients must not infer units from names. Update API schemas/DB constraints, migrations, MCP, frontend normalization/editor/journal, progression and volume handling consistently. Existing history stays unchanged. Tests cover strength, timed unloaded/loaded, cardio, mutually exclusive metrics and warmups. Assisted loading and side-by-side unilateral logs are deferred until they have an explicit catalog contract; do not present them as supported.

Status: reviewed/fixed on 2026-09-07; pending main validation.

### Task 3: Everyday autonomy and shared state

Expose skip, replace, add/remove and reorder exercise controls using existing endpoints; require confirmation for destructive actions and preserve logged sets. Offer repeat completed session through a small atomic endpoint which copies prescriptions, not performed sets, on today's date. Allow correction of set values through an atomic API endpoint, including completed sessions, without delete-then-create. Add direct dated measurement entry. Keep read-only/demo isolation. Add paginated history and an activity date-range summary instead of claiming a full year from ten sessions. Refresh active open session while visible without overwriting unsaved inputs or pending journal entries. Fix Profile's missing import and Home next-set targets.

Status: pending.

### Task 4: Portable installation and operating skills

Ship exactly two self-contained, copyable skills: installation/maintenance and tracker usage. Reuse existing Docker and setup docs, with a small safe diagnostic script only if useful. Explain host/container/remote networking and dev versus production. Verify prerequisites, app and MCP readiness, dataset/bootstrap, and MCP protocol usage. Include Hermes/OpenClaw installation instructions grounded in current official docs; distinguish automatic skill discovery from manual registration. No installation of another agent, no overwrites, no secrets in command arguments or logs. Remove builder/deployment authority from the coach template and distinguish owner Web App navigation from share URLs.

Status: pending.

### Task 5: Product polish, demo and quality gates

Polish existing app with restrained Apple-like hierarchy, accessible controls, consistent sheets, primary action placement and pending/error feedback. Reuse styles and avoid a redesign framework. Make public demo mutable in memory, resettable and completely isolated from real API/auth/journal writes; demonstrate a full set/finish flow. Fix landing base link and naming, show real product rather than a misleading mockup, clarify external agent prerequisite. Add frontend typecheck and tests to CI; resolve relevant type errors without weakening compiler rules. Check desktop/mobile with Playwright and start a local preview for user review.

Status: pending.

### Task 6: Integration and final review

Review all changes for ownership, offline journal regressions, timed metric integrity, read-only sharing, unknown import handling and installation safety. Run backend/MCP/frontend tests, frontend typecheck, builds, migration graph and relevant lint. Perform browser workflow checks for demo, manual controls and viewport overflow. Run isolated Compose smoke when environment allows, without touching existing production volumes. Report precisely any remaining limitations.

Status: pending.
