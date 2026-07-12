# Contributing

¡Gracias por querer mejorar Gym Coach! PRs e issues son bienvenidos.

## Arrancar en local

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
docker compose up -d --build  # app:8000 + MCP:8001 + PostgreSQL
```

Las guías de instalación están en [`docs/install-docker.md`](docs/install-docker.md) y [`docs/install-coolify.md`](docs/install-coolify.md). La guía de conexión de agentes está en [`docs/agent-setup.md`](docs/agent-setup.md).

Sin Docker: levanta PostgreSQL, ejecuta `cd apps/api && uv sync --locked`,
`uv run python -m scripts.bootstrap` y `uv run uvicorn app.main:app --reload`.
Mini App: `cd apps/miniapp && npm install`
y `npm run dev` (dev server de Astro con proxy a la API) o `npm run build` para
que FastAPI sirva `apps/miniapp/dist/`.

## Estructura

- `apps/api/app/` — FastAPI + SQLModel.
- `apps/api/alembic/` — migraciones de PostgreSQL.
- `apps/api/scripts/bootstrap.py` — migraciones y catálogo de ejercicios.
- Para crear migraciones: `cd apps/api && uv run alembic revision --autogenerate -m "desc"`.
- `apps/miniapp/` — Mini App en Astro + Preact.
- `apps/site/` — landing pública en Astro + Tailwind.
- `apps/mcp/gym_tracker_mcp.py` — servidor MCP que habla con la API pública.
- `templates/` — SOUL.md y SKILL.md para el perfil del agente coach.
- `docs/` — GitHub Pages + guía de setup.

## Principios

- **Agnóstico al agente**: la app solo expone API + MCP. Nada específico de Hermes/Claude en backend.
- **YAGNI**: sin abstracciones especulativas ni dependencias para problemas que cubre la plataforma.
- La API es el contrato: si cambias un endpoint, actualiza el MCP y el frontend.

## PRs

1. Fork + rama desde `main`.
2. Cambios pequeños y enfocados. Un tema por PR.
3. Verifica que `docker compose up --build` arranca y `/ready` responde.
4. Si tocas la API, actualiza también el MCP y la Mini App: la API es el contrato.

## Issues

Abre un issue con: qué esperabas, qué pasó, y cómo reproducirlo. Para ideas de
producto, cuenta el caso de uso (qué le pedías al coach).
