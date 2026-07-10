# Design System

Two Astro apps share one token vocabulary with different palettes:

| App | Path | Palette | Styling idiom |
|-----|------|---------|---------------|
| Mini App (Telegram) | `frontend/` | Light, iOS-like | Semantic classes (`.card`, `.btn`) in `global.css` |
| Landing | `landing/` | Dark, green accent | Tailwind utilities inline in `.astro` files |

**Rule: don't mix idioms.** In the Mini App, style through semantic classes in
`frontend/src/styles/global.css`; don't sprinkle Tailwind utilities in TSX
(spacing utilities like `mt-2` are the one allowed exception). In the landing,
use Tailwind utilities; component-specific CSS lives in the page's `<style>`.

## Tokens

Defined as Tailwind v4 `@theme` in each app's `src/styles/theme.css`. Same
names in both apps — only values differ. Both `var(--color-*)` and utilities
(`bg-surface`, `text-ink`, `rounded-card`…) work.

| Token | Mini App | Landing | Use |
|-------|----------|---------|-----|
| `--color-canvas` | `#f5f5f7` | `#09090b` | Page background |
| `--color-surface` | `#fff` | `#131315` | Cards |
| `--color-surface-2` | `#f2f2f7` | — | Nested fills (stats, rows) |
| `--color-hover` | `#fafafa` | `#1c1c1f` | Hover/active fills |
| `--color-ink` | `#1d1d1f` | `#fafafa` | Primary text |
| `--color-hint` | `#6e6e73` | `#a1a1aa` | Secondary text |
| `--color-accent` | `#5856d6` (indigo) | `#4ade80` (green) | Brand / interactive |
| `--color-ok / warn / err` | iOS greens/oranges/reds + `-bg` pairs | ok only | Status pills, toasts |
| `--color-edge` | `rgba(60,60,67,.14)` | `rgba(255,255,255,.09)` | Borders |
| `--radius-card` | `22px` | same | Cards |
| `--radius-control` | `14px` | same | Inputs, buttons, nested tiles |
| `--radius-pill` | `999px` | same | Pills, round buttons |
| `--shadow-card/toast/sheet/sticky` | see theme.css | card only | Elevation |
| `--font-sans` | SF Pro stack | same | Everything |

Adding a token: add to the app that needs it, keep the name generic enough
that the other app could adopt it. Structural tokens (radius, font) stay
identical in both files — they're duplicated on purpose (two independent
builds; sharing a file isn't worth the coupling for ~8 lines).

## Typography (Mini App)

Set globally in `@layer base` — headings and `<p>` need no classes:

- `h1` — clamp 1.75–2.25rem, weight 780, tight tracking. One per screen.
- `h2` — 1.15rem. Card/section titles.
- `h3` — .98rem. Row/tile titles.
- `p` — .875rem, hint color by default.
- `.eyebrow` — uppercase micro-label above headings.
- Numbers get `tnum` via body `font-feature-settings`.

## Mini App patterns (`frontend/src/styles/global.css`)

- `.card` — surface + `radius-card` + `shadow-card`. Add `.tap` for pressable.
- `.btn` — primary (ink bg). Variants `.secondary`, `.ghost`. `.row` lays buttons side by side.
- `.pill` — status chips. Variants `.active`, `.ok`, `.warn`, `.err`; workflow states `.st-completed`, `.st-skipped`, `.st-in_progress`.
- `.topbar` — sticky blurred header; `.back` and `.top-action` round buttons. Component: `TopBar` in `ui.tsx`.
- `dialog.sheet` — bottom sheet via native `<dialog>` (`ConfirmSheet` in `ui.tsx`; `window.confirm` breaks in Telegram webview).
- `.stat` / `.stats` — KPI tiles on `surface-2`.
- `.toast`, `.loading`/`.spinner`, `.empty` — feedback states (`ui.tsx` components).
- Media tiles (`.big-media`, `.exercise-media`, `.session-hero-media`) — always white bg (exercise GIFs have white canvases), `object-fit: contain`.

Shared primitives live in `frontend/src/components/ui.tsx`: `Loading`,
`Empty`, `TopBar`, `BusyButton`, `ConfirmSheet`, `BodyMap`, charts. Reuse
before writing new ones.

## Motion & a11y (both apps)

Non-negotiable, already wired — keep them when touching styles:

- Press feedback: `:active { transform: scale(.97ish) }` on tappables.
- Landing scroll reveal: `.reveal` + `.stagger` with IntersectionObserver.
- `prefers-reduced-motion` — kills movement, keeps opacity fades.
- `prefers-reduced-transparency` and `prefers-contrast: more` handled in Mini App.
- Touch targets ≥ 44px (`min-height`/`min-width` on buttons).
- Hover styles only inside `@media (hover: hover)`.

## Checks

After style changes: `npm run build` in `frontend/` and `landing/` must pass.
Visual check in Telegram webview for the Mini App (safe-area insets matter).
