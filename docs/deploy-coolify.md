# Desplegar en Coolify

Esta guía reproduce el patrón de producción del proyecto: cuatro recursos independientes, con persistencia únicamente en PostgreSQL y MinIO.

```text
PostgreSQL 18  ─┐
MinIO          ─┼─> App (API + Mini App)
MCP            ──┘
```

El agente puede ser Hermes, Claude, Codex u otro cliente MCP. Coolify no necesita conocer qué agente se conecta.

## 1. Crear los recursos

Crea los recursos en este orden dentro del mismo proyecto y entorno de Coolify.

### PostgreSQL

- Tipo: PostgreSQL.
- Imagen: `postgres:18-alpine`.
- Crear persistent storage en `/var/lib/postgresql`.
- Mantenerlo privado, sin dominio público.

Guarda el hostname, usuario, contraseña y nombre de base de datos que genere Coolify. Se usarán en `DATABASE_URL`.

### MinIO

Crea una aplicación desde el repositorio usando:

```text
Dockerfile: /Dockerfile.minio
Puertos: 9000,9001
```

Configura persistent storage:

```text
/data
```

Añade un healthcheck para:

```text
/minio/health/live
```

Mantén MinIO privado salvo que necesites acceder a él desde fuera de la red de Coolify.

### App

Crea una aplicación desde el repositorio usando:

```text
Dockerfile: /Dockerfile
Puerto: 8000
```

Healthcheck de proceso:

```text
GET /health
```

Si tienes dominio, asígnalo a esta aplicación:

```text
https://gym.example.com
```

Si no tienes dominio propio, utiliza temporalmente el dominio generado por Coolify.

### MCP

Crea otra aplicación desde el mismo repositorio usando:

```text
Dockerfile: /Dockerfile.mcp
Puerto: 8001
```

El MCP usa Streamable HTTP:

```text
/mcp
```

Healthcheck de Coolify:

```text
GET /health
```

Debe devolver HTTP 200. El endpoint `/mcp` no sirve como healthcheck porque
un `GET` directo sin negociación MCP puede responder `406` correctamente.

Antes de desplegar o escalar la App, ejecuta una vez el trabajo de release con
la misma imagen y variables de la App:

```text
python operations.py
```

Aplica migraciones y sincroniza el catálogo. Para descargar medios pendientes
de forma explícita, usa `python operations.py --media`; nunca se hace desde
cada réplica web.

## 2. Conectar la red interna

Los recursos `app`, `mcp`, PostgreSQL y MinIO deben poder resolverse entre sí dentro de la red de Coolify.

- Si están en el mismo recurso Compose/network, usa los nombres de servicio.
- Si son recursos separados, habilita **Connect to Predefined Network** cuando sea necesario.
- Usa el hostname interno generado por Coolify.
- No uses `localhost` para conectar unos contenedores con otros.
- No uses IPs de contenedor ni hagas `docker network connect` como solución permanente.

Ejemplos conceptuales:

```text
DATABASE_URL=postgresql+asyncpg://user:password:<postgres-host>:5432/database
S3_ENDPOINT=http://<minio-host>:9000
GYM_TRACKER_API_BASE=http://<app-host>:8000/api
```

Los hostnames concretos dependen de la instalación de Coolify.

## 3. Variables de la App

Configura estas variables como runtime variables en la aplicación `app`:

```env
DATABASE_URL=postgresql+asyncpg://...
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=...

CORS_ORIGINS=https://gym.example.com

S3_ENDPOINT=http://<minio-host>:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=gym-tracker-media
S3_REGION=us-east-1
LOG_LEVEL=INFO
```

Si no usas dominio propio, sustituye `CORS_ORIGINS` por el origen real de la Mini App.

## 4. Variables del MCP

Configura estas variables como runtime variables en `gym-tracker-mcp` y desactiva
`Available at build time`. Los secretos no deben aparecer como `ARG` en el build:

```env
GYM_TRACKER_API_BASE=http://<app-host>:8000/api
GYM_TRACKER_APP_BASE=https://gym.example.com
GYM_TRACKER_COACH_KEY=<mismo valor que COACH_API_KEY>
MCP_PORT=8001
```

`GYM_TRACKER_APP_BASE` es la URL que el agente usará al enviar enlaces de la Mini App. Si cambias el dominio, actualiza esta variable y redeploya el MCP.

## 5. Conectar el agente

### Agente en la misma máquina

Si el MCP está publicado en el host del mini PC:

```text
http://localhost:8001/mcp
```

### Agente dentro de Coolify

Usa el hostname interno del servicio:

```text
http://<mcp-host>:8001/mcp
```

### Agente remoto

Publica el MCP mediante un dominio separado:

```text
https://gym-mcp.example.com/mcp
```

Configura TLS, conserva `COACH_API_KEY` y limita el acceso en el proxy inverso. No publiques el MCP sin autenticación.

## 6. Verificación

Después de desplegar:

```bash
curl https://gym.example.com/ready
```

Debe responder HTTP 200 cuando PostgreSQL y MinIO estén disponibles. `/health`
queda como liveness del proceso.

Comprueba también:

- la Mini App carga desde el dominio configurado;
- `GET /health` del MCP responde HTTP 200;
- el MCP descubre sus herramientas;
- el MCP puede ejecutar `health`;
- la API puede leer y escribir PostgreSQL;
- la API puede crear y leer el bucket de MinIO;
- un redeploy conserva perfiles, sesiones, series e imágenes.

Si el MCP falla con HTTP 401, compara exactamente:

```text
App: COACH_API_KEY
MCP: GYM_TRACKER_COACH_KEY
```

Deben contener el mismo secreto.

## 7. Persistencia y backups

Persistent storage obligatorio:

| Recurso | Ruta |
|---|---|
| PostgreSQL | `/var/lib/postgresql` |
| MinIO | `/data` |

La app y el MCP son stateless y no necesitan volúmenes de datos.

Antes de eliminar recursos o cambiar de servidor:

1. Haz un backup lógico de PostgreSQL.
2. Haz una copia de los objetos de MinIO.
3. Verifica que puedes restaurarlos.
4. Conserva el backup fuera del servidor de Coolify.

Un redeploy normal no debe eliminar los persistent storage. Borrar el recurso o confirmar una operación destructiva sí puede hacerlo.

## Actualizaciones

El repositorio es la fuente de código. Tras un push:

1. Revisa las variables y persistent storage.
2. Redeploya `app` y `mcp` si cambió cualquiera de los dos.
3. Comprueba `/health` y la conexión MCP.
4. Verifica una lectura real de PostgreSQL y un objeto de MinIO.

No guardes secretos en Git ni dentro de las imágenes Docker.
