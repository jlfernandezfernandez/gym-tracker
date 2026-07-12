# Instalar en Coolify

Usa un único recurso Docker Compose. Es el camino recomendado para Coolify;
la guía de [deploy-coolify.md](deploy-coolify.md) conserva la topología
avanzada con recursos separados.

## Crear el recurso

1. Crea un proyecto y entorno en Coolify.
2. Añade un recurso desde el repositorio público o mediante GitHub App.
3. Selecciona el build pack **Docker Compose**.
4. Indica `compose.production.yml` como Compose file.
5. Configura las variables del `.env.production.example` como runtime
   variables, nunca como build arguments.
6. Asigna el dominio HTTPS a `app`, puerto `8000`.

Después de publicar la primera release, deja los paquetes GHCR visibles para
Coolify o configura credenciales de registry para que pueda descargar las
imágenes privadas.

Coolify crea una red interna para los servicios del stack. La App puede usar
`postgres` y `minio` como hostnames; no sustituyas esos nombres por
`localhost`.

## Variables y persistencia

Establece:

```env
ENVIRONMENT=production
GYM_TRACKER_VERSION=latest
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
DATABASE_URL=postgresql+asyncpg://...
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=gym-tracker-media
S3_REGION=us-east-1
```

Configura almacenamiento persistente para:

| Servicio | Ruta |
|---|---|
| PostgreSQL | `/var/lib/postgresql` |
| MinIO | `/data` |

No asignes dominio público a PostgreSQL, MinIO ni MCP. El MCP queda disponible
para la App por la red interna. Para un agente en otra red hace falta una VPN
o túnel privado; el MCP público todavía no tiene autenticación de entrada.

## Deploy y comprobación

Despliega el stack y espera a que `app-init` termine. Configura el healthcheck
de la App como:

```text
GET /ready
```

Comprueba el dominio de la App y el log de `app-init`. Después conecta el agente
al hostname interno del servicio MCP en el mismo stack. Si el agente está fuera
de Coolify, usa una red privada; no abras 8001 al mundo.

El primer flujo completo debe comprobar App preparada, MCP preparado,
descubrimiento de herramientas, creación de una sesión desde el agente y
apertura con escritura desde Telegram.

Para actualizaciones, backups y rollback consulta
[`backup-and-update.md`](backup-and-update.md).
