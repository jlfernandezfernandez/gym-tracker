# Conectar un agente MCP

Gym Tracker no incluye un agente conversacional. Expone un servidor MCP; Hermes,
Claude, Codex u otro cliente compatible decide cuándo crear planes y registrar
series.

## Conexión local

Con el Compose local o de producción en la misma máquina:

```text
http://127.0.0.1:8001/mcp
```

Ejemplo para Hermes:

```bash
hermes mcp add gym_tracker --url http://127.0.0.1:8001/mcp
hermes mcp test gym_tracker
```

La configuración exacta de otros agentes cambia, pero usan el mismo endpoint
Streamable HTTP.

## Agente remoto

MCP queda privado por defecto. Para un agente en otra máquina usa una VPN, una
red Docker privada o un firewall que permita el puerto únicamente desde la IP del
agente. No lo publiques directamente en Internet.

En Coolify, la opción preferida es **Connect to Predefined Network** y el hostname
interno que la interfaz muestra para el servicio MCP.

## Variables internas

Compose configura estas variables dentro del servicio MCP:

```dotenv
GYM_TRACKER_API_BASE=http://app:8000/api
GYM_TRACKER_APP_BASE=https://gym.example.com
GYM_TRACKER_COACH_KEY=<mismo-valor-que-COACH_API_KEY>
```

`GYM_TRACKER_APP_BASE` crea enlaces de la Mini App. No es la URL que utiliza el
agente para conectar al MCP.

## Telegram y multiusuario

El gateway de Telegram pertenece al agente. Gym Tracker valida el `initData` de
la Mini App con `TELEGRAM_BOT_TOKEN` y guarda los datos por usuario.

El agente debe pasar `telegram_user_id` en operaciones de perfil y sesión. El MCP
lo convierte en `X-Telegram-User-Id` junto a la clave de coach; la API rechaza
peticiones de coach sin usuario para evitar mezclar atletas.

No guardes series, sesiones ni mediciones en la memoria del agente: PostgreSQL de
Gym Tracker es la fuente de verdad.

## Comprobación

Después de conectar el agente:

1. Ejecuta la prueba MCP de tu cliente.
2. Lee el perfil de un usuario de Telegram.
3. Lista sus sesiones.
4. Crea un plan de prueba solo si el usuario lo pide.

Usa los enlaces devueltos por `session_web_url` y `share_web_url`; no construyas
IDs ni tokens de sesión manualmente.

## Seguridad

- `COACH_API_KEY` protege MCP → API, no autentica a quien abre el endpoint MCP.
- No compartas claves de coach ni tokens de Telegram.
- Mantén PostgreSQL y MCP fuera de Internet.
