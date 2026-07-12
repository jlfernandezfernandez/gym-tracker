# Instalar en Coolify

Gym Tracker se despliega como **un recurso Docker Compose**: base de datos,
bootstrap del dataset, App y MCP. El repositorio no contiene dominios ni redes de
tu instalación; Coolify gestiona el dominio de la App.

## 1. Crea el recurso

1. En Coolify, crea una aplicación **Docker Compose** desde este repositorio.
2. Selecciona `compose.production.yml`.
3. En el servicio **app**, añade tu dominio HTTPS, por ejemplo
   `https://gym.example.com`.
4. No asignes dominio a `db`, `app-init` ni `mcp`.

No añadas etiquetas Traefik, redes externas ni IPs al Compose. Coolify ya conecta
a la App con su proxy.

## 2. Variables

Crea estas variables de runtime antes del primer deploy:

```dotenv
POSTGRES_USER=gym_user
POSTGRES_PASSWORD=<secreto-largo>
POSTGRES_DB=gym_tracker
TELEGRAM_BOT_TOKEN=<token-del-bot-que-abre-la-Mini-App>
COACH_API_KEY=<otro-secreto-largo>
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
EXERCISE_DATASET_VERSION=v1.0.0
GYM_TRACKER_VERSION=1.0.0

# Evitan ocupar puertos reservados por la propia instalación de Coolify.
APP_BIND=127.0.0.1
APP_PORT=18000
MCP_BIND=127.0.0.1
MCP_PORT=18001
```

Marca los secretos como runtime-only si tu versión de Coolify ofrece esa opción.
No pegues valores de ejemplo en producción.

## 3. Persistencia

El Compose crea dos volúmenes propios:

| Volumen | Contenido |
| --- | --- |
| `postgres_data` | Perfil, sesiones, series y mediciones |
| `exercise_data` | Dataset y media versionados |

No borres esos volúmenes al redeployar. Haz un `pg_dump` antes de cambiar versión,
restaurar datos o eliminar el recurso.

## 4. Deploy y comprobación

Despliega y espera a que `app-init` termine. Después:

- La App responde en `https://gym.example.com/ready`.
- `app` y `mcp` quedan healthy.
- La Mini App abre desde el **mismo bot** configurado en `TELEGRAM_BOT_TOKEN`.
- Perfil, sesiones y mediciones aparecen al abrir el menú de Telegram.

## MCP en Coolify

MCP no necesita dominio público. Si tu agente también está en Coolify, conecta los
recursos mediante **Connect to Predefined Network** y usa el hostname interno que
muestra Coolify para `mcp:8001/mcp`.

Si el agente está fuera, usa VPN/red privada o permite un puerto de MCP solo desde
la IP del agente. No expongas MCP directamente a Internet.

## Actualizar

1. Cambia `GYM_TRACKER_VERSION` a un tag publicado.
2. Redespiega el recurso.
3. Comprueba `/ready`, MCP `/health` y una Mini App abierta desde Telegram.

Para actualizar el catálogo, cambia también `EXERCISE_DATASET_VERSION`.
