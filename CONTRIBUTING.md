# Contributing

¡Gracias por querer mejorar Gym Coach! PRs e issues son bienvenidos.

## Arrancar en local

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
docker compose up -d --build  # app:8000 + MCP:8001 + Postgres + MinIO
```

La guía de despliegue en Coolify está en [`docs/deploy-coolify.md`](docs/deploy-coolify.md). La guía de conexión de agentes está en [`docs/agent-setup.md`](docs/agent-setup.md).

Sin Docker: levanta un Postgres, `pip install -r backend/requirements.txt` y
`cd backend && uvicorn main:app --reload`. Frontend: `cd frontend && npm install`
y `npm run dev` (dev server de Astro con proxy a la API) o `npm run build` para
que FastAPI sirva `frontend/dist/`.

## Estructura

- `backend/` — FastAPI + SQLModel. Routers en `backend/routers/`.
- `backend/` — FastAPI + SQLModel + Alembic ( migraciones en `backend/migrations/`). Routers en `backend/routers/`.
- `backend/exercise_data/` — catálogo bilingüe (JSON en el repo; imágenes/GIFs se descargan del fork dataset-es en el primer arranque).
- Para crear migraciones: `cd backend && alembic revision --autogenerate -m "desc"`. Se aplican solo en el boot.
- `frontend/` — Mini App en Astro + Preact: `src/pages/index.astro` (shell), `src/components/App.tsx` (island + router), `src/components/screens/*` (pantallas), `src/lib/*` (api, helpers, chart, bodymap).
- `mcp/gym_tracker_mcp.py` — servidor MCP (22 tools) que habla con la API pública.
- `templates/` — SOUL.md y SKILL.md para el perfil del agente coach.
- `docs/` — GitHub Pages + guía de setup.

## Principios

- **Agnóstico al agente**: la app solo expone API + MCP. Nada específico de Hermes/Claude en backend.
- **YAGNI**: sin abstracciones especulativas. React solo existe como isla para el body map.
- La API es el contrato: si cambias un endpoint, actualiza el MCP y el frontend.

## PRs

1. Fork + rama desde `main`.
2. Cambios pequeños y enfocados. Un tema por PR.
3. Verifica que `docker compose up --build` arranca y `/health` responde.
4. Si tocas el MCP o la API, actualiza la tabla de tools del README.

## Issues

Abre un issue con: qué esperabas, qué pasó, y cómo reproducirlo. Para ideas de
producto, cuenta el caso de uso (qué le pedías al coach).
