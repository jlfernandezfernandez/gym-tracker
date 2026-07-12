# Gym Tracker product site redesign

## Goal

Turn the landing page into a distinctive, credible explanation of one idea: an AI coach converses in Telegram and Gym Tracker gives that conversation durable workout memory and a native visual surface. Make self-hosting feel concrete and low-risk without imitating a generic developer SaaS template.

## Audience and job

Primary audience: technical self-hosters and agent users evaluating whether Gym Tracker belongs beside Hermes, OpenClaw, Claude, or another MCP client. Secondary audience: people who want to understand the workout experience before installing.

The page's single job is to move a qualified visitor from understanding the Telegram workflow to choosing Docker Compose or Coolify.

## Direction

Use a cool training-journal aesthetic instead of the current near-black/acid-green default:

- chalk canvas `#F6F7F9`;
- graphite `#101318`;
- steel secondary `#667085`;
- kinetic violet `#5856D6`;
- completion green `#30A46C`;
- dark demo material `#17191E`.

Self-host one Manrope variable WOFF2 for display type and include its license. Body uses the system stack; commands and system labels use a system monospace stack. No remote font request.

The signature interaction is “conversation becomes workout”: the hero's Telegram messages resolve into the same workout rail and set card used conceptually in the Mini App. This is the one orchestrated motion moment; the rest of the page is quiet.

## Page structure

1. **Hero:** precise headline, short explanation, GitHub primary CTA, installation secondary CTA, and the live conversation-to-workout demo.
2. **How it works:** a truthful Agent → MCP → Gym Tracker flow showing which system owns conversation, tools, PostgreSQL, and media.
3. **Product proof:** three real states—today's session, set logging, and progress—using actual UI content rather than generic feature icons.
4. **Exercise depth:** compact proof of the 1,324-entry multilingual catalog with real demonstrations and attribution.
5. **Deploy:** Docker command and Coolify route presented as two equally clear paths, plus what stays private.
6. **Open source footer:** license, repository, docs, and data/media attribution.

Reduce the existing six generic feature cards. Every section either demonstrates behavior, explains ownership, or resolves deployment concern.

## Layout and components

Use generous asymmetric editorial grids, thin structural rules, and compact technical labels only where they encode architecture or state. Avoid decorative numbered sections, excessive rounded cards, gradients, and floating blobs.

Split the Astro page into `Hero`, `HowItWorks`, `ProductDemo`, `ExerciseCatalog`, `Deployment`, and `Footer`. The chat/workout simulator owns its script and generated markup. Static copy and example data stay local to their section.

## Motion

The hero sequence uses transform/opacity only and remains interactive while running. Messages appear, the coach creates a plan, and the plan settles into a Mini App card. It pauses when the tab is hidden and does not recurse indefinitely after navigation.

Section reveals are limited to the first appearance of major demonstrations. No stagger on ordinary copy. Pointer hover is gated to fine pointers. Reduced motion presents the complete static hero immediately.

## Content

Use plain Spanish from the operator's perspective. Lead with outcomes, then implementation. Explain that Telegram is the conversation surface, MCP is the tool bridge, PostgreSQL owns structured history, and the pinned dataset volume owns reproducible media. Do not claim setup is “two commands” unless the documented path truly is.

The deployment block links directly to Docker, Coolify, Telegram setup, backups, and agent setup. Show pinned dataset behavior as a reliability feature, not an internal detail.

## Verification

- Astro build and sitemap succeed.
- Lighthouse-oriented review checks semantic headings, metadata, keyboard use, contrast, image dimensions/loading, font preload, and reduced motion.
- Visual review covers 390px, 768px, 1280px, and 1440px widths.
- The hero demo is checked for timing, tab visibility, restart behavior, and no console errors.
- Docker/Coolify commands and links match current documentation.
- No new JavaScript framework or animation dependency is added.
