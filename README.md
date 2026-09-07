# Gym Tracker

Gym Tracker añade memoria de entrenamiento a cualquier agente compatible con MCP.
Hablas con tu agente en Telegram; el agente usa MCP para guardar perfil, sesiones,
series y mediciones. La Mini App sirve para ver y registrar el entrenamiento.

- Mini App de Telegram + API FastAPI.
- PostgreSQL para perfil, historial y mediciones.
- MCP Streamable HTTP para Hermes, Claude, Codex y otros clientes.
- Catálogo versionado de 1.324 ejercicios con imágenes y GIFs.

## Elige un camino

| Quiero | Lee | Resultado |
| --- | --- | --- |
| Probarlo en mi ordenador | [Arranque local](#arranque-local) | App y MCP en `localhost` |
| Publicarlo con Docker | [Docker en producción](docs/install-docker.md) | App HTTPS mediante tu proxy |
| Usar Coolify | [Coolify](docs/install-coolify.md) | Un recurso Compose portable |
| Abrirlo desde Telegram | [Telegram](docs/setup-telegram.md) | Botón Mini App autenticado |
| Registrar series sin conexión | [Entrenamiento sin conexión](docs/offline-workouts.md) | Series locales que se sincronizan al volver la red |
| Conectar mi agente | [MCP](docs/agent-setup.md) | Agente con herramientas de gimnasio |
| Reutilizar skills operativas | [skills/gym-tracker-install/SKILL.md](skills/gym-tracker-install/SKILL.md) y [skills/gym-tracker/SKILL.md](skills/gym-tracker/SKILL.md) | Instalación, mantenimiento y uso guiado |
| Recibir eventos | [Webhooks](docs/webhooks.md) | Transporte HTTP agnóstico y opcional |

## Arranque local

Requisitos: Docker Engine + Docker Compose v2.

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
docker compose up -d --build
```

Este camino compila la App y el MCP desde tu clon local. Es seguro para desarrollo
porque ambos servicios escuchan en `127.0.0.1` por defecto.

Comprueba que el primer arranque ha terminado:

```bash
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl http://localhost:8001/health
curl http://localhost:8001/ready
```

Abre `http://localhost:8000`. Este modo es desarrollo: no valida identidad de
Telegram mientras `TELEGRAM_BOT_TOKEN` esté vacío. No lo expongas a Internet.

## Qué queda privado

Por defecto, App y MCP escuchan solo en `127.0.0.1`; PostgreSQL no publica ningún
puerto. En el host usa `http://127.0.0.1:8000` para la App y
`http://127.0.0.1:8001/mcp` para el MCP. Dentro de Compose, el MCP habla con la
API mediante `http://app:8000/api`; ese hostname no sirve fuera de la red Docker.
Para producción, deja MCP privado y pon un proxy HTTPS delante de la App.

```text
Telegram ─HTTPS→ Mini App + API ─→ PostgreSQL
Agente ─MCP privado──────────────→ API
```

## Variables importantes

| Variable | Para qué sirve |
| --- | --- |
| `POSTGRES_*` | Base de datos incluida en Compose |
| `TELEGRAM_BOT_TOKEN` | Valida la identidad de la Mini App |
| `COACH_API_KEY` | Permite que MCP actúe ante la API |
| `PUBLIC_APP_URL` | URL HTTPS que reciben los enlaces de sesión |
| `CORS_ORIGINS` | Origen HTTPS de la Mini App |
| `GYM_TRACKER_VERSION` | Tag de imágenes GHCR; usa `latest` |
| `WEBHOOKS_*` | Transporte HTTP opcional para eventos futuros |

Copia `.env.example`; contiene valores locales seguros y comentarios de cada
variable. Para una Mini App real, `TELEGRAM_BOT_TOKEN` debe ser exactamente el
token del mismo bot que abre el botón Web App y con el que habla tu agente.

## Actualizar

Local:

```bash
git pull --ff-only
docker compose up -d --build
```

Producción: descarga `latest` y redespliega siguiendo la guía de tu plataforma.
Un volumen no sustituye un backup: exporta PostgreSQL antes de cambios mayores.

## Skills listas para copiar

El repositorio incluye dos skills autocontenidas en `skills/`:

- [skills/gym-tracker-install/SKILL.md](skills/gym-tracker-install/SKILL.md) para instalación, mantenimiento, readiness y diagnóstico seguro.
- [skills/gym-tracker/SKILL.md](skills/gym-tracker/SKILL.md) para uso del producto, onboarding, logging y enlaces de sesión.

En OpenClaw, puedes instalarlas directamente desde este clon con:

```bash
openclaw skills install ./skills/gym-tracker-install --as gym-tracker-install
openclaw skills install ./skills/gym-tracker --as gym-tracker
```

En Hermes, `skills/` en la raíz del repo no se carga automáticamente. Copia la
skill completa a `~/.hermes/skills/` o añade este directorio a
`skills.external_dirs` en `~/.hermes/config.yaml`. Las rutas de proyecto que
Hermes sí descubre son `.hermes/skills/` y `.agents/skills/`, después de
`hermes skills trust`.

Si copias una skill fuera de este repo, llévala completa con sus `references/`,
`scripts/` y `tests/`.

## Desarrollo

```bash
cd apps/api && uv sync --locked
cd ../miniapp && npm ci
cd ../site && npm ci
```

Consulta `CONTRIBUTING.md` para los checks del repositorio.

## Seguridad

- No publiques PostgreSQL.
- No publiques MCP sin una red privada, VPN o autenticación de cliente.
- No compartas `TELEGRAM_BOT_TOKEN` ni `COACH_API_KEY`.
- Usa URLs de sesión generadas por MCP; no construyas IDs o tokens a mano.

## Licencia

MIT. La media del catálogo conserva su atribución; revisa `NOTICE.md` en el
[repositorio del dataset](https://github.com/jlfernandezfernandez/exercises-dataset-es).
