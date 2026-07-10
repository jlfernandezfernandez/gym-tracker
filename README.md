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

## Arranque rápido con Docker Compose

Requisitos: Docker Engine y Docker Compose v2.

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
# Edita .env y establece TELEGRAM_BOT_TOKEN y COACH_API_KEY si procede
docker compose up -d
```

Endpoints locales:

| Servicio | URL |
|---|---|
| App + API + Mini App | `http://localhost:8000` |
| MCP | `http://localhost:8001/mcp` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

Comprueba el arranque:

```bash
curl http://localhost:8000/health
curl http://localhost:8001/health
docker compose ps
```

El MCP es independiente del agente. Configura en Hermes, Claude, Codex u otro cliente MCP la URL:

```text
http://localhost:8001/mcp
```

## Despliegue en Coolify

La instalación recomendada en Coolify usa recursos independientes, igual que la instalación de producción del proyecto:

```text
PostgreSQL persistente
MinIO persistente
App desde Dockerfile
MCP desde Dockerfile.mcp
```

La Mini App puede funcionar con la URL que proporcione Coolify o con un dominio propio. El dominio es opcional.

Guía completa: [`docs/deploy-coolify.md`](docs/deploy-coolify.md).

## Dominios y proxy inverso

Si publicas la Mini App detrás de un proxy inverso, configura en `.env` o en Coolify:

```env
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
```

El proxy debe enviar el dominio al servicio **app**, puerto `8000`.

El MCP puede permanecer privado si el agente corre en el mismo mini PC. Si un agente remoto necesita acceder a él, publícalo con un dominio separado, por ejemplo:

```text
https://gym-mcp.example.com/mcp
```

Usa HTTPS y `COACH_API_KEY`. No publiques PostgreSQL ni MinIO sin una razón específica.

## Persistencia

Los datos de usuario no viven en los contenedores de la app ni del MCP:

| Datos | Almacenamiento |
|---|---|
| Perfiles, sesiones, series y mediciones | PostgreSQL |
| Imágenes y GIFs | MinIO |

En Compose, los volúmenes persistentes son:

```text
gym-tracker-postgres-data
gym-tracker-minio-data
```

Un reinicio o redeploy normal conserva los datos. `docker compose down -v` elimina los volúmenes y solo debe usarse para empezar desde cero. La persistencia no sustituye a los backups.

En Coolify, configura persistent storage en PostgreSQL (`/var/lib/postgresql`) y MinIO (`/data`). Consulta [`docs/deploy-coolify.md`](docs/deploy-coolify.md).

## Agentes y MCP

El MCP expone las operaciones del producto: perfil, mediciones, catálogo, sesiones, series y enlaces de la Mini App. El agente decide cómo conversar y cuándo usar cada herramienta.

Guía: [`docs/agent-setup.md`](docs/agent-setup.md).

Los templates opcionales de personalidad y operación están en [`templates/`](templates/).

## Desarrollo

```bash
docker compose up -d --build
curl http://localhost:8000/health
```

La API aplica las migraciones de Alembic al arrancar y carga el catálogo de ejercicios de forma idempotente. Las imágenes y GIFs del dataset se descargan en segundo plano y se almacenan en MinIO.

## Estructura

```text
backend/              API FastAPI, modelos, migraciones y seed
frontend/             Mini App Astro + Preact
mcp/                  herramientas MCP agnósticas al agente
Dockerfile             imagen de la API + Mini App
Dockerfile.mcp        imagen del servidor MCP
Dockerfile.minio      imagen/configuración de MinIO
docker-compose.yml    stack local completo
docs/                 guías de despliegue y conexión
templates/            templates opcionales para agentes
```

## Multiusuario y seguridad

La Mini App identifica al usuario mediante Telegram InitData. El MCP debe enviar el `telegram_user_id` en las operaciones de perfil y sesiones para mantener el aislamiento entre atletas.

- No compartas `TELEGRAM_BOT_TOKEN`, `COACH_API_KEY` ni credenciales S3.
- No expongas PostgreSQL.
- Usa HTTPS cuando la Mini App o el MCP sean accesibles desde Internet.
- Usa enlaces con share token; no construyas URLs de sesiones manualmente.

## Contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md). Los cambios de API deben mantener alineados el MCP y la Mini App. Antes de abrir un PR, verifica que el stack arranca con Docker Compose y que `/health` responde.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
