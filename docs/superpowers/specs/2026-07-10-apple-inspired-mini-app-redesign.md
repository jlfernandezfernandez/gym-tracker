# Gym Coach Mini App Redesign

## Product intent

Telegram and the AI coach remain the primary product. The Mini App is the visual execution surface: it helps an athlete understand today's plan, perform the current set, record reality, and review progress when visual interaction is better than chat.

The redesign optimizes first for use during training: one-handed, time-constrained, and with limited attention. It must feel calm, immediate, predictable, and crafted rather than like a generic fitness dashboard.

## Design direction

Use the approved **Focus** direction:

- System typography, restrained color, strong hierarchy, generous spacing.
- A light, adaptive surface system with subtle depth instead of borders around everything.
- The current task dominates; secondary information remains one clear action away.
- Immediate press feedback, short interruptible transitions, and haptics only for meaningful completion or errors.
- No new animation or UI dependency. Use native CSS, Preact, and `<dialog>`.

## Information architecture

The app has two contextual modes:

1. **No active session:** the landing screen is calm and points the athlete back to the coach. History, records, and profile remain directly accessible.
2. **Active session:** the app opens the current exercise as the primary workspace. The full plan is always available from the header and returns to the exact exercise.

The existing stack router remains. Navigation must preserve spatial consistency: pushed screens enter and leave along the same path, and dialogs originate from the control that opened them.

## Screens

### Landing

- Greet the athlete without a large dashboard header.
- With no session, explain that the coach creates the next workout and expose History, Records, and Profile as quiet secondary destinations.
- With an active session, show the current exercise, prescribed set, and one dominant Continue action.
- Do not duplicate the full plan or body map on this screen.

### Active exercise

- Header: Exit, session title plus exercise position, and Plan.
- Segmented progress communicates position across exercises.
- Exercise media is the primary visual reference; Technique opens from the media.
- Show exercise name, target area/equipment, and set progress.
- Present the coach prescription as one readable value, for example `22.5 kg × 10`.
- `Register set` logs the prescribed values, or the last performed set where current behavior already carries it forward.
- `Adjust` opens a native bottom sheet with prefilled weight and repetitions. It shows prescribed versus actual values before saving.
- Preserve optional notes, but keep them inside the adjustment flow rather than on the default path.
- Completed sets remain inspectable and deletable with an accessible destructive action.
- Completion returns to the plan/current next exercise without trapping the user.

### Session plan

- Present the workout as a route, not a dashboard.
- Compact session summary: goal, duration, exercise count, and overall progress.
- Exercise rows emphasize sequence, completion, current position, and prescription.
- Move the body map and coach notes below the actionable route or into disclosure, since they are context rather than the next action.
- Keep Share and Finish clearly separated from the workout's primary continuation action.
- Completed sessions become summaries with performed sets, volume, duration, and feedback.

### History

- Use a chronological grouped list rather than identical floating cards.
- Each row shows date, title, completion, exercises, sets, and duration when available.
- Opening a row reuses the read-only/completed session presentation.
- Empty and error states use plain language and a clear recovery path.

### Records and record detail

- Records prioritize exercise name and personal best; media and supporting metadata are secondary.
- The detail screen leads with the current best and latest result, then the progression chart and session list.
- Charts use the same semantic colors and remain readable with increased contrast and reduced transparency.
- Do not add new metrics that the current API cannot support reliably.

### Profile

- Lead with identity and training goal, followed by grouped sections: Training, Body, Constraints, Preferences, and Measurements.
- Replace the dense tile grid with readable label/value rows where comparison is not needed.
- Keep coach-owned context visibly distinct from athlete-editable information.
- Edit Profile uses grouped native controls, correct keyboards, inline validation, and a persistent Save action only while changes exist.

### Shared/read-only session

- Reuse the redesigned session plan and exercise detail.
- Remove all mutation affordances rather than disabling them.
- Clearly label the view as shared without letting the label dominate the content.

### System states

- Loading uses stable skeleton geometry where practical so content does not jump.
- Errors remain in context and provide Retry where retrying is meaningful.
- Toasts are reserved for completion and errors, announced with `aria-live`.
- Dialogs trap focus natively, close predictably, and retain entered values after a failed request.

## Visual system

- Use system font with optical sizing. Display text has tighter tracking; body and small labels prioritize legibility.
- Minimum touch target: 44 × 44 CSS pixels.
- Use one dark primary action, indigo for navigational/active emphasis, green for completed state, amber for warnings, and red only for destructive/error states.
- Prefer grouped surfaces and spacing over a border on every element.
- Floating chrome may use subtle translucency; content surfaces remain solid for legibility.
- Support safe-area insets and Telegram viewport behavior.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast`.

## Interaction and motion

- Controls respond on press with a subtle scale or highlight.
- Screen transitions are brief and symmetrical. Reduced motion uses opacity without translation.
- The adjustment sheet uses native `<dialog>` with a bottom-sheet presentation on mobile.
- No input is locked while decorative animation finishes.
- Haptics fire on successful set registration, completion, and errors only.

## Data flow

The existing model already separates `PlannedExercise.suggested_weight` and `target_reps` from each `PerformedSet.weight` and `reps`. Therefore the approved confirm-or-adjust flow requires no database migration.

1. The exercise screen derives defaults from the last performed set, falling back to the coach prescription.
2. Register Set sends those defaults directly.
3. Adjust edits local state and sends the edited values through the existing set endpoint.
4. On success, existing query caches for session, current state, progress, active session, and records are refreshed.
5. On failure, the adjustment state remains open with the user's values intact.

Backend or schema changes are permitted only if implementation discovers a concrete missing invariant or field. No speculative API or database work is included.

## Implementation scope

Expected frontend changes are concentrated in the existing screen components, shared UI primitives, router behavior, helpers, Telegram bridge, chart styling, and global CSS. Existing API contracts and libraries are reused. No new dependency, component framework, design-token package, or abstraction layer is planned.

## Verification

- Build the Astro frontend successfully.
- Add one small runnable check for the prescription/default selection logic if it is extracted into a helper.
- Exercise the active-session, confirm, adjust, error, completed, read-only, and no-session paths.
- Inspect the app locally at a mobile viewport and at the existing desktop breakpoint.
- Verify keyboard focus, accessible labels, 44 px targets, safe areas, and reduced-motion behavior.
- Confirm no backend migration is needed; if one becomes necessary, test upgrade against the current schema.

## Explicit non-goals

- Replacing Telegram chat or adding plan creation forms.
- Adding social, gamification, timers, rest countdowns, or new analytics.
- Introducing a dark mode, custom typeface, motion library, or design-system package.
- Changing coach behavior or inventing data the coach did not provide.
