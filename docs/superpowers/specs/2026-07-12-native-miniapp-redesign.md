# Native Telegram Mini App redesign

## Goal

Make the Mini App feel like a focused native workout companion inside Telegram: immediate, calm, tactile, and easy to operate one-handed during a session. Preserve all existing API behavior and product capabilities while improving hierarchy, navigation, feedback, accessibility, and maintainability.

## Product principles

- The current set is always the primary object during a workout.
- One screen has one dominant action.
- Frequent actions respond instantly and avoid decorative animation.
- Meaningful commits combine visual state, Telegram haptic feedback, and concise copy on the same frame.
- Advanced context remains available one level deeper, never mixed into the primary logging path.

## Information architecture

Add a floating bottom tab bar on root screens with four destinations: Hoy, Historial, Marcas, Perfil. The bar is hidden on Plan, Exercise, shared/read-only views, and modal tasks. Tab state is persistent; workout detail navigation remains a small stack with native back behavior.

Hoy shows greeting, current-session status, the next set, session progress, and one primary “Continuar” action. Without a session it explains that the coach creates one in Telegram and keeps navigation available.

Plan shows the workout route, completed/current/upcoming exercises, overall progress, sharing, muscle map, and session completion. Exercise shows media, set position, weight/reps controls, log action, compact recent sets, and collapsed technique/progression sections.

## Visual system

Use the system font with optical sizing. Support light and dark Telegram/color-scheme modes with these semantic roles:

- light canvas `#F2F2F7`, surface `#FFFFFF`, ink `#111318`, secondary `#6E6E73`;
- dark canvas `#0C0C0E`, surface `#1C1C1E`, ink `#F5F5F7`, secondary `#A1A1AA`;
- kinetic violet `#5856D6` for interactive focus;
- completion green `#30A46C` only for successful progress;
- destructive red `#FF453A` only for destructive/error states.

Use a 4px spacing base, 12–16px controls, 20–24px cards, thin material edges, and restrained shadows. Translucent chrome appears only on the sticky top bar, bottom tab bar, and sheets; content cards remain solid for legibility.

The signature element is a continuous workout rail: the same visual language represents session percentage, exercise position, and set completion across Hoy, Plan, and Exercise.

## Components

Shared UI is limited to primitives with real repeated behavior: `AppShell`, `TopBar`, `TabBar`, `Button`, `Pill`, `ProgressRail`, `Sheet`, `Toast`, `EmptyState`, and visualization wrappers. Feature components own workout-specific presentation.

Buttons expose primary, secondary, quiet, and destructive variants. All have at least a 44px hit target, visible focus, immediate press scale around `.97`, disabled state, and stable loading width.

Use native `<dialog>` for sheets. Sheets enter in 220–280ms with `cubic-bezier(.32,.72,0,1)` and exit faster. Do not add a gesture/spring library; swipe dismissal is excluded until it can be tested on real Telegram devices.

## Motion and feedback

- Press feedback: 100–140ms transform only.
- Sheets/toasts: interruptible transitions, not keyframes that restart.
- Navigation used repeatedly is immediate; no page carousel.
- Successful set logging updates the workout rail and briefly morphs the button state before the next set, synchronized with haptic feedback.
- Loading uses skeletons only where content shape is known; short mutations keep the current screen stable.
- Reduced motion replaces translation/scale entrances with short opacity changes.
- Reduced transparency makes chrome solid; increased contrast strengthens edges.

## Copy and states

Use direct Spanish labels: “Guardar serie”, “Continuar”, “Terminar ejercicio”, “Finalizar sesión”. Toast copy repeats the completed action. Empty and error states tell the user what to do next. Shared sessions are visibly read-only and never show disabled editing controls that imply they might work.

## Responsive behavior

Optimize first for 360–430px Telegram WebViews and safe areas. Tablet/desktop shared links use a centered, wider layout with two-column exercise media/details where space permits. Do not imitate a desktop dashboard inside Telegram.

## Verification

- Existing frontend build and API flows remain functional.
- Visual review covers 390x844 light/dark, 360px narrow, 768px tablet, and a desktop shared link.
- Keyboard focus, screen-reader labels, 200% text, safe areas, reduced motion/transparency, and increased contrast are checked.
- Interaction review covers initial load, no session, active session, each workout state, mutations, errors, read-only sharing, dialogs, and tab restoration.
- No new runtime animation or component dependency is added.

