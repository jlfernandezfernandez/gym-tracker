# Instalar con Docker Compose

Esta es la instalación recomendada si Hermes, OpenClaw u otro agente ya corre
en el mismo mini PC o servidor.

## Requisitos

- Docker Engine con Compose v2.
- Un dominio HTTPS o un túnel HTTPS para la App que pueda abrir Telegram.
- Un bot de Telegram configurado en la [guía de Telegram](setup-telegram.md).

El agente y el MCP pueden vivir en la misma máquina. PostgreSQL y MinIO son
internos al stack y no necesitan puertos públicos.

## Arranque

Descarga una release del repositorio y prepara las variables:

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.production.example .env
```

Edita `.env` y establece, como mínimo:

```env
GYM_TRACKER_VERSION=latest
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=...
POSTGRES_PASSWORD=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

Usa contraseñas aleatorias. `S3_ACCESS_KEY` y `S3_SECRET_KEY` son también las
credenciales root del MinIO incluido en este stack. Si una contraseña de
PostgreSQL contiene `@`, `:`, `/` u otros caracteres reservados, codifícala en
la URL o utiliza una contraseña sin esos caracteres.

Arranca la release:

```bash
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
curl https://gym.example.com/ready
curl http://localhost:8001/ready
```

`app-init` aplica migraciones, crea el bucket y sincroniza el catálogo antes de
que la App se considere preparada. Si falla, revisa sus logs:

```bash
docker compose -f compose.production.yml logs app-init
```

Conecta el agente al MCP privado:

```text
http://localhost:8001/mcp
```

No publiques el puerto 8001 directamente. `COACH_API_KEY` protege las llamadas
del MCP hacia la API, pero no autentica clientes que lleguen al endpoint MCP.

## Comprobación final

- `GET /ready` de la App devuelve `status: ready`.
- `GET http://localhost:8001/ready` devuelve `status: ready`.
- El agente descubre y ejecuta la herramienta `health`.
- Telegram abre la Mini App con identidad firmada.
- El agente crea una sesión de prueba y la App la muestra.
- Reiniciar el stack conserva la sesión.

Para configurar los botones y el menú de Telegram, continúa con
[`setup-telegram.md`](setup-telegram.md). Para actualizar y hacer backups,
consulta [`backup-and-update.md`](backup-and-update.md).

## Desarrollo local

Para desarrollo con builds locales, variables cómodas y consola MinIO:

```bash
cp .env.example .env
docker compose up -d --build
```

