# Repository architecture redesign

## Goal

Organize Gym Tracker as a small, legible monorepo where each deployable application and product feature has an obvious home. Preserve all runtime behavior, public APIs, Docker/Coolify entrypoints, and one-command setup while reducing oversized files and cross-layer navigation.

This is a mechanical foundation for the dataset and interface work. It must land before behavioral changes so later commits target final paths.

## Root structure

```text
apps/
  api/
  miniapp/
  site/
  mcp/
docs/
templates/
Dockerfile
Dockerfile.mcp
docker-compose.yml
compose.production.yml
README.md
```

Keep Compose files and Dockerfiles at the root because Docker and Coolify users should not need custom paths. Do not add a workspace manager, shared package, task runner, or root JavaScript dependency.

## API structure

Move `backend/` to `apps/api/`. Organize application code by feature:

```text
apps/api/app/
  core/
    auth.py
    config.py
    database.py
  features/
    coach/
      routes.py
      schemas.py
      service.py
    exercises/
      routes.py
      schemas.py
      catalog.py
    profile/
      routes.py
      schemas.py
    sessions/
      routes.py
      schemas.py
      service.py
  storage/
    s3.py
  models.py
  main.py
```

Keep `models.py` together. Its six SQLModel tables are short and relationally coupled; splitting them would create import cycles without reducing complexity. Feature folders may import models and `core`, but features must not import another feature's routes.

Move route business logic into a feature service only where it is reused, requires its own tests, or obscures the HTTP boundary. Small endpoint-specific queries stay in `routes.py`. Preserve every path, payload, status code, and OpenAPI shape.

## Mini App structure

Move `frontend/` to `apps/miniapp/`:

```text
apps/miniapp/src/
  app/
    App.tsx
    context.ts
    router.ts
  components/
    feedback.tsx
    navigation.tsx
    sheet.tsx
    visualizations.tsx
  features/
    workout/
      Home.tsx
      Plan.tsx
      Exercise.tsx
      components.tsx
      queries.ts
    history/
      History.tsx
    records/
      Records.tsx
      RecordDetail.tsx
    profile/
      Profile.tsx
  lib/
  styles/
```

Do not create one file per tiny element. Split current files only at stable responsibilities: router/context, shared feedback/navigation/sheets/charts, workout-specific components, and feature screens. Feature-local components stay beside the feature.

## Site and MCP structure

Move `landing/` to `apps/site/`. Split the page into `Hero`, `HowItWorks`, `ProductDemo`, `Deployment`, and `Footer` sections. Keep static content as ordinary TypeScript data near the section that owns it.

Move `mcp/` and `run_mcp.py` into `apps/mcp/`, retaining one executable entrypoint. Do not turn the MCP server into a package unless packaging becomes a real distribution requirement.

## Deployment and documentation

Update Docker build contexts, Compose mounts/commands, Ruff/Pyright paths, tests, documentation links, and CI references atomically. Root commands remain:

```bash
docker compose up -d
docker compose -f compose.production.yml up -d
```

Documentation uses the product names “API”, “Mini App”, “site”, and “MCP”; internal folder names appear only where a command needs them.

## Verification

- Existing API tests, Ruff, Pyright, Alembic heads, both Astro builds, and Compose config pass before and after the move.
- A route/schema snapshot confirms the HTTP contract is unchanged.
- Searches find no stale `backend/`, `frontend/`, `landing/`, or old MCP paths in tracked configuration or documentation.
- Docker production config still exposes only the intended public service.

## Non-goals

- No API or database behavior change.
- No new build system, package workspace, dependency, or reusable design-system package.
- No speculative plugin architecture.

