# Gym Tracker

Gym Tracker convierte cualquier agente compatible con MCP en un coach de gimnasio con memoria. Hablas en Telegram; el agente crea la sesión y abre una Mini App para seguirla, registrar series y consultar progreso.

- Telegram Mini App para el entrenamiento.
- API FastAPI + PostgreSQL para sesiones, perfil y mediciones.
- MCP Streamable HTTP para Hermes, OpenClaw, Claude, Codex y otros agentes.
- Catálogo versionado de 1.324 ejercicios con demostraciones.
- Docker Compose y Coolify.
- Open source, licencia MIT.

## Cómo encaja

```text
Telegram
   │ conversación + botón Mini App
   ▼
Tu agente ──MCP──▶ Gym Tracker API ──▶ PostgreSQL
                         │
                         └──▶ catálogo versionado en volumen local
```

La App es el único servicio público. PostgreSQL y MCP deben permanecer privados.

## Arranque rápido

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
docker compose up -d --build
```

Servicios locales:

| Servicio | URL |
| --- | --- |
| Mini App + API | `http://localhost:8000` |
| MCP | `http://localhost:8001/mcp` |
| Salud | `http://localhost:8000/health` |

Para Telegram real, edita `.env` y configura al menos:

```dotenv
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=...
CORS_ORIGINS=https://gym.example.com
PUBLIC_APP_URL=https://gym.example.com
```

Después crea el botón de la Mini App siguiendo [la guía de Telegram](docs/setup-telegram.md) y conecta el agente con [la guía MCP](docs/agent-setup.md).

## Dataset

`app-init` instala una release inmutable y fijada:

```dotenv
EXERCISE_DATASET_VERSION=v1.0.0
```

La primera ejecución descarga un único `tar.gz`, comprueba SHA-256, importa los metadatos y extrae la media al volumen `exercise_data`. Los siguientes arranques no descargan nada si la versión instalada coincide.

Consulta [actualización del dataset](docs/dataset.md).

## Producción

- [Docker en tu propia máquina](docs/install-docker.md)
- [Coolify](docs/install-coolify.md)

El stack de producción está en `compose.production.yml`. Usa imágenes publicadas y exige secretos explícitos.

## Configuración

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | conexión PostgreSQL |
| `TELEGRAM_BOT_TOKEN` | valida Telegram Mini App |
| `COACH_API_KEY` | protege la API usada por MCP |
| `CORS_ORIGINS` | dominio público permitido |
| `PUBLIC_APP_URL` | URL que el MCP entrega al agente |
| `EXERCISE_DATASET_VERSION` | release fijada del catálogo |
| `GYM_TRACKER_VERSION` | tag de imágenes en producción |
| `APP_PORT`, `MCP_PORT` | puertos publicados |

Consulta `.env.example` para la lista completa.

## Desarrollo

API:

```bash
cd apps/api
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest -q
```

Mini App y landing:

```bash
cd apps/miniapp && npm ci && npm run build
cd ../site && npm ci && npm run build
```

## Estructura

```text
apps/
  api/       FastAPI, migraciones y tests
  miniapp/   Astro + Preact + Tailwind
  site/      landing Astro + Tailwind
  mcp/       servidor MCP
docs/        instalación y operación
templates/   contexto opcional para agentes
```

## Seguridad y datos

- No publiques PostgreSQL ni MCP directamente en Internet.
- No compartas `TELEGRAM_BOT_TOKEN` ni `COACH_API_KEY`.
- La media del catálogo es © Gym visual; conserva la atribución y revisa `NOTICE.md` en el [repositorio del dataset](https://github.com/jlfernandezfernandez/exercises-dataset-es).
## Licencia

MIT. Consulta [LICENSE](LICENSE).
