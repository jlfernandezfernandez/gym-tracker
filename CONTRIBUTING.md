# Contributing

¡Gracias por querer mejorar Gym Coach! PRs e issues son bienvenidos.

## Arrancar en local

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env      # TELEGRAM_BOT_TOKEN vacío = auth desactivada (modo dev)
docker compose up -d      # app en http://localhost:8000 (el catálogo de ejercicios se carga solo)
```

Sin Docker: levanta un Postgres, `pip install -r backend/requirements.txt` y
`cd backend && uvicorn main:app --reload`. El frontend es un solo HTML estático
(`frontend/index.html`), no hay build step.

## Estructura

- `backend/` — FastAPI + SQLModel. Routers en `backend/routers/`.
- `frontend/index.html` — Mini App completa (HTML + CSS + JS vanilla, un archivo).
- `mcp/gym_tracker_mcp.py` — servidor MCP (21 tools) que habla con la API pública.
- `templates/` — SOUL.md y SKILL.md para el perfil del agente coach.
- `docs/` — GitHub Pages + guía de setup.

## Principios

- **Agnóstico al agente**: la app solo expone API + MCP. Nada específico de Hermes/Claude en backend.
- **YAGNI**: sin abstracciones especulativas. El frontend es un archivo a propósito.
- **Sin build steps innecesarios**: HTML estático, sin bundlers.
- La API es el contrato: si cambias un endpoint, actualiza el MCP y el frontend.

## PRs

1. Fork + rama desde `main`.
2. Cambios pequeños y enfocados. Un tema por PR.
3. Verifica que `docker compose up --build` arranca y `/health` responde.
4. Si tocas el MCP o la API, actualiza la tabla de tools del README.

## Issues

Abre un issue con: qué esperabas, qué pasó, y cómo reproducirlo. Para ideas de
producto, cuenta el caso de uso (qué le pedías al coach).
