# Conectar un agente MCP

Gym Tracker es agnóstico al agente. Puedes usar Hermes, Claude, Codex u otro cliente compatible con MCP.

## Endpoint

### Docker Compose local

```text
http://localhost:8001/mcp
```

### Coolify

Usa el hostname interno si el agente está dentro de Coolify:

```text
http://<mcp-host>:8001/mcp
```

## Configuración

Añade el endpoint a la configuración MCP del agente. En Hermes, por ejemplo:

```bash
hermes mcp add gym_tracker --url http://localhost:8001/mcp
hermes mcp test gym_tracker
```

Otros agentes usan el mismo endpoint con su propio formato de configuración.

El agente necesita recibir las instrucciones y herramientas del servidor MCP. La aplicación no contiene la lógica conversacional: el agente decide cuándo hacer onboarding, crear planes, registrar series o abrir la Mini App.

## Variables internas del MCP

Estas variables las configura Docker Compose o Coolify, no el usuario del agente:

```env
GYM_TRACKER_API_BASE=http://<app-host>:8000/api
GYM_TRACKER_APP_BASE=https://gym.example.com
GYM_TRACKER_COACH_KEY=<mismo valor que COACH_API_KEY>
```

`GYM_TRACKER_APP_BASE` es la URL pública que aparecerá en los enlaces de la Mini App. Es independiente de la URL que use el agente para conectar con el MCP.

## Telegram

El gateway de Telegram pertenece al agente. Gym Tracker solo proporciona:

- API;
- persistencia;
- catálogo de ejercicios;
- servidor MCP;
- Mini App.

Configura `TELEGRAM_BOT_TOKEN` en la aplicación y el gateway del agente según la documentación de ese agente.

## Multiusuario

El agente debe pasar siempre el `telegram_user_id` en las operaciones de perfil
y sesión. El MCP lo traduce a `X-Telegram-User-Id` junto con
`GYM_TRACKER_COACH_KEY`; la API rechaza llamadas del coach sin usuario. Así los
datos permanecen aislados por atleta.

No guardes series, sesiones ni datos corporales en la memoria del agente: Gym Tracker es la fuente de verdad.

## Seguridad

- Usa `COACH_API_KEY` fuerte.
- Mantén el MCP privado.
- El endpoint MCP público no está soportado todavía: `COACH_API_KEY` autentica
  MCP → API, no al cliente que se conecta al MCP. Para un agente remoto usa
  una VPN o túnel privado.
- No compartas tokens de Telegram, claves MCP ni credenciales S3.
- Usa los enlaces generados por `session_web_url` y `share_web_url`; no construyas URLs de sesiones manualmente.
