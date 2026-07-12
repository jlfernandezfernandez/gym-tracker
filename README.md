# Gym Tracker

> Backend, Mini App de Telegram y MCP para que cualquier agente compatible pueda actuar como entrenador personal.

Gym Tracker no está ligado a Hermes, Claude, Codex ni a ningún proveedor. El agente conversa con el atleta y Gym Tracker se encarga de persistir perfiles, sesiones, ejercicios, series y mediciones.

## Qué incluye

- **API**: FastAPI + SQLModel + PostgreSQL.
- **Mini App**: Astro + Preact, servida por la API.
- **MCP**: FastMCP por Streamable HTTP.
- **Media**: MinIO compatible con S3 para imágenes y GIFs.
- **Auth**: Telegram InitData para la Mini App y una clave compartida para el MCP.
- **Despliegue**: Docker Compose o Coolify.

```text
Agente (Hermes, Claude, Codex, ...)
              │ MCP
              ▼
        gym-tracker-mcp
              │ API
              ▼
     gym-tracker + Postgres + MinIO
              │
              ▼
       Mini App de Telegram
```

## Elige tu instalación

Si ya tienes Hermes, OpenClaw u otro agente en un mini PC o servidor, usa la
instalación de producción con Docker Compose:

[`docs/install-docker.md`](docs/install-docker.md)

Si usas Coolify, despliega `compose.production.yml` como un único recurso:

[`docs/install-coolify.md`](docs/install-coolify.md)

Para desarrollo local con builds y auth desactivada:

```bash
cp .env.example .env
docker compose up -d --build
```

Endpoints de desarrollo:

| Servicio | URL |
|---|---|
| App + API + Mini App | `http://localhost:8000` |
| MCP | `http://localhost:8001/mcp` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

Comprueba el arranque:

```bash
curl http://localhost:8000/ready
curl http://localhost:8001/ready
docker compose ps
```

El MCP es independiente del agente. Configura en Hermes, Claude, Codex u otro cliente MCP la URL:

```text
http://localhost:8001/mcp
```

## Despliegue en Coolify

Coolify usa el mismo `compose.production.yml` como un único stack. La App
recibe el dominio HTTPS; PostgreSQL, MinIO y MCP permanecen privados.

Guía: [`docs/install-coolify.md`](docs/install-coolify.md).

`compose.production.yml` fija `ENVIRONMENT=production`. En un despliegue manual
configura el mismo valor. La aplicación fallará al arrancar si faltan
PostgreSQL, S3, Telegram, la clave del coach o un origen CORS explícito;
producción no admite `CORS_ORIGINS=*`.

## Configuración

`.env.example` contiene la referencia completa:

| Variable | Uso |
|---|---|
| `ENVIRONMENT` | `development` local o `production` en despliegues reales |
| `DATABASE_URL` | conexión PostgreSQL asíncrona |
| `TELEGRAM_BOT_TOKEN` | valida Telegram InitData |
| `COACH_API_KEY` | autentica MCP → API; el endpoint MCP sigue siendo privado |
| `CORS_ORIGINS` | orígenes permitidos, separados por comas |
| `S3_ENDPOINT` | endpoint MinIO/S3 |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | credenciales de object storage |
| `S3_BUCKET`, `S3_REGION` | bucket y región |
| `EXERCISE_DATASET_REPOSITORY` | repositorio `owner/repo`; se consume su rama `main` |

Docker Compose local usa `development`; el Compose de producción fija
`production` y exige sustituir las credenciales de ejemplo.

## Dominios y proxy inverso

Si publicas la Mini App detrás de un proxy inverso, configura en `.env` o en Coolify:

```env
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
```

El proxy debe enviar el dominio al servicio **app**, puerto `8000`.

El MCP debe permanecer privado. `COACH_API_KEY` autentica MCP → API, pero no
autentica clientes que lleguen al endpoint MCP. Para un agente remoto usa una
VPN o túnel privado; no publiques PostgreSQL ni MinIO.

## Persistencia

Los datos de usuario no viven en los contenedores de la app ni del MCP:

| Datos | Almacenamiento |
|---|---|
| Perfiles, sesiones, series y mediciones | PostgreSQL |
| Imágenes y GIFs | MinIO |

Compose gestiona los volúmenes `postgres_data` y `minio_data` dentro de cada
proyecto.

Un reinicio o redeploy normal conserva los datos. `docker compose down -v` elimina los volúmenes y solo debe usarse para empezar desde cero. La persistencia no sustituye a los backups.

En Coolify, configura persistent storage en PostgreSQL (`/var/lib/postgresql`)
y MinIO (`/data`). Consulta [`docs/install-coolify.md`](docs/install-coolify.md).

## Agentes y MCP

El MCP expone las operaciones del producto: perfil, mediciones, catálogo, sesiones (crear, actualizar fecha/título/notas, finalizar, borrar), series y enlaces de la Mini App. El agente decide cómo conversar y cuándo usar cada herramienta.

Guía: [`docs/agent-setup.md`](docs/agent-setup.md). Telegram:
[`docs/setup-telegram.md`](docs/setup-telegram.md).

MCP Apps queda como una integración futura; la Mini App de Telegram y esta API
son ahora las superficies canónicas.

Los templates opcionales de personalidad y operación están en [`templates/`](templates/).

## Desarrollo

```bash
docker compose up -d --build
curl http://localhost:8000/ready
```

`app-init` ejecuta una vez `python -m scripts.bootstrap` antes de arrancar la
API. El bootstrap aplica Alembic, descarga en memoria el catálogo remoto,
actualiza PostgreSQL y sube a S3 únicamente las imágenes y GIFs ausentes. No
guarda catálogo ni medios en disco y cualquier fallo aborta el arranque.

Sin Docker:

```bash
cd backend
uv sync --locked
uv run python -m scripts.bootstrap
uv run uvicorn app.main:app --reload
```

Comprobaciones del backend:

```bash
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
```

## Estructura

```text
apps/api/app/          API, modelos, rutas y servicios
apps/api/alembic/      migraciones de PostgreSQL
apps/api/scripts/      bootstrap de migraciones y catálogo
apps/api/tests/        tests de backend
apps/api/pyproject.toml + uv.lock  dependencias y herramientas bloqueadas
apps/miniapp/          Mini App Astro + Preact
apps/site/             landing page estática (Astro + Tailwind)
apps/mcp/              servidor MCP y entrypoint HTTP
mcp/                  herramientas MCP agnósticas al agente
Dockerfile             imagen de la API + Mini App
Dockerfile.mcp        imagen del servidor MCP
docker-compose.yml    stack local completo
compose.production.yml stack de producción con imágenes GHCR
docs/                 guías de despliegue, conexión y design system (DESIGN.md)
templates/            templates opcionales para agentes
```

## Multiusuario y seguridad

La Mini App identifica al usuario mediante Telegram InitData. El MCP debe enviar el `telegram_user_id` en las operaciones de perfil y sesiones para mantener el aislamiento entre atletas.

- No compartas `TELEGRAM_BOT_TOKEN`, `COACH_API_KEY` ni credenciales S3.
- No expongas PostgreSQL.
- Usa HTTPS cuando la Mini App sea accesible desde Internet.
- Usa enlaces con share token; no construyas URLs de sesiones manualmente.

## Contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md). Los cambios de API deben mantener alineados el MCP y la Mini App. Antes de abrir un PR, verifica que el stack arranca con Docker Compose y que `/ready` responde.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
