# Contributing

¡Gracias por querer mejorar Gym Coach! PRs e issues son bienvenidos.

## Arrancar en local

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
docker compose up -d --build  # app:8000 + MCP:8001 + Postgres + MinIO
```

Las guías de instalación están en [`docs/install-docker.md`](docs/install-docker.md) y [`docs/install-coolify.md`](docs/install-coolify.md). La guía de conexión de agentes está en [`docs/agent-setup.md`](docs/agent-setup.md).

Sin Docker: levanta PostgreSQL y MinIO, ejecuta `cd backend && uv sync --locked`,
`uv run python -m scripts.bootstrap` y `uv run uvicorn app.main:app --reload`.
Frontend: `cd frontend && npm install`
y `npm run dev` (dev server de Astro con proxy a la API) o `npm run build` para
que FastAPI sirva `frontend/dist/`.

## Estructura

- `backend/app/` — FastAPI + SQLModel; rutas HTTP en `app/api/routes/` y lógica en `app/services/`.
- `backend/alembic/` — migraciones de PostgreSQL.
- `backend/scripts/bootstrap.py` — migraciones y seed remoto hacia PostgreSQL + S3.
- Para crear migraciones: `cd backend && uv run alembic revision --autogenerate -m "desc"`.
- `frontend/` — Mini App en Astro + Preact: `src/pages/index.astro` (shell), `src/components/App.tsx` (island + router), `src/components/screens/*` (pantallas), `src/lib/*` (api, helpers, chart, bodymap).
- `mcp/gym_tracker_mcp.py` — servidor MCP (23 tools) que habla con la API pública.
- `templates/` — SOUL.md y SKILL.md para el perfil del agente coach.
- `docs/` — GitHub Pages + guía de setup.

## Principios

- **Agnóstico al agente**: la app solo expone API + MCP. Nada específico de Hermes/Claude en backend.
- **YAGNI**: sin abstracciones especulativas. React solo existe como isla para el body map.
- La API es el contrato: si cambias un endpoint, actualiza el MCP y el frontend.

## PRs

1. Fork + rama desde `main`.
2. Cambios pequeños y enfocados. Un tema por PR.
3. Verifica que `docker compose up --build` arranca y `/ready` responde.
4. Si tocas el MCP o la API, actualiza la tabla de tools del README.

## Issues

Abre un issue con: qué esperabas, qué pasó, y cómo reproducirlo. Para ideas de
producto, cuenta el caso de uso (qué le pedías al coach).
