# Tailwind-first frontend migration

## Goal

Make the Telegram Mini App and public landing page simpler to understand and maintain by expressing their visual system directly in Tailwind CSS v4 utilities. Preserve the current product, responsive behavior, accessibility, and visual identity; this is a styling architecture migration, not a redesign.

The migration is complete when ordinary component styling can be understood from the component markup, `frontend/src/styles/global.css` no longer acts as a component stylesheet, and the landing page has no avoidable handcrafted CSS.

## Current state

- Both applications already use Tailwind CSS v4 through `@tailwindcss/vite`.
- Both keep their palette, radii, shadows, and typography in a small `@theme` file.
- The landing page is mostly utility-first, but still contains static styles and simulator-generated markup that depend on handcrafted selectors.
- The Mini App still relies on a large global stylesheet containing layout, component, state, and responsive rules referenced through semantic class names in Preact components.
- The applications contain a few legitimate cases that Tailwind utilities cannot cleanly own: keyframes, pseudo-elements, browser/dialog behavior, Telegram safe-area integration, and DOM created by Chart.js or the exercise body-map library.

## Chosen approach

Use Tailwind utilities directly in Astro and Preact markup. Static styles become literal utility classes; conditional states become conditional utility class strings. Keep the existing `@theme` tokens as the single visual vocabulary shared within each application.

Do not replace global CSS with `@apply` component classes. That would retain the indirection and simply move the same maintenance burden into a Tailwind-specific syntax. Do not add a class-composition dependency or build a new component abstraction solely to shorten class strings. Existing reusable UI components remain the reuse boundary.

## Mini App migration

Migrate every screen, shared UI component, and the Astro layout:

- Page shells, cards, buttons, pills, grids, rows, forms, media, navigation, progress, loading, empty, error, dialog, and chart containers use utilities in their markup.
- Active, current, completed, success, warning, error, loading, and disabled states use conditional utilities at the point where the state is known.
- Existing shared components such as buttons, the top bar, confirmation sheet, charts, and empty/loading states keep owning repeated markup and their common class lists.
- Repetition alone does not justify a new abstraction. A helper is introduced only if it removes genuine conditional-class duplication without hiding the rendered styles.
- Responsive rules, hover/focus-visible feedback, disabled behavior, touch targets, and reduced-motion behavior are preserved.

After migration, `frontend/src/styles/global.css` contains only:

- the Tailwind import and theme import;
- minimal document-level defaults that cannot be more clearly expressed on the root layout;
- required keyframes and reduced-motion overrides;
- pseudo-element or browser rules that are materially clearer as CSS;
- Telegram viewport/safe-area integration;
- selectors required to style DOM owned by Chart.js or the body-map library.

It must not contain ordinary named component classes such as `.card`, `.btn`, `.pill`, `.history-row`, or screen-specific layout classes.

## Landing page migration

Keep the current dark identity and page structure. Migrate all remaining static presentation to utilities, including the phone simulator, message bubbles, call-to-action states, reveal/stagger states where practical, and responsive layout.

The simulator's JavaScript-generated elements receive complete Tailwind utility class strings when created. No parallel CSS component system is kept for those elements.

Landing global CSS retains only Tailwind/theme imports, document defaults when clearer globally, keyframes, unavoidable pseudo-elements, and progressive-enhancement animation selectors whose state is toggled outside component rendering. Decorative effects that are directly expressible with arbitrary Tailwind values move to markup.

## Visual and behavioral constraints

- No deliberate visual redesign, content rewrite, routing change, or interaction change.
- Preserve the Mini App's light palette and the landing page's dark palette.
- Preserve all mobile layouts and Telegram WebView behavior.
- Preserve semantic elements, accessible names, keyboard focus visibility, and reduced-motion support.
- Avoid dynamic class-name construction that Tailwind cannot discover at build time. Conditional branches must contain complete literal utility classes.
- Avoid one-off CSS variables where an existing theme token or direct utility is sufficient.

## Related uncommitted changes

The exercise-catalog path correction requested alongside this work is not part of the styling migration and will be committed separately so it can be reviewed or reverted independently. Other pre-existing Docker or catalog concurrency edits will be preserved and reviewed before inclusion; the Tailwind migration will not silently absorb them.

## Verification

The implementation is accepted when:

1. The Mini App production build succeeds.
2. The landing production build succeeds.
3. Existing backend tests and static checks still pass when related backend changes are included.
4. Searches confirm ordinary legacy component selectors are gone from global CSS and their references are gone from markup.
5. The built applications are inspected at representative mobile and desktop widths, including the Mini App's main screens and the landing simulator.
6. Keyboard focus, dialogs, loading/error states, disabled buttons, reduced motion, and Telegram safe-area behavior remain intact.
7. No new runtime or styling dependency is added.

## Commit strategy

Use small, coherent commits:

1. the exercise-catalog correction explicitly requested by the user;
2. Mini App Tailwind-first migration;
3. landing Tailwind-first cleanup;
4. any verification-driven fixes that genuinely span both applications.

Publish the completed branch only after all checks pass. Existing unrelated working-tree changes remain untouched unless their intent is confirmed.
