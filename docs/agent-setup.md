# Conectar un agente MCP

Gym Tracker es agnóstico al agente. Puedes usar Hermes, Claude, Codex u otro cliente compatible con MCP.

## Endpoint

### Docker Compose local

```text
http://localhost:8001/mcp
```

### Coolify

Usa el hostname interno si el agente está dentro de Coolify, o el dominio HTTPS del MCP si el agente es remoto:

```text
http://<mcp-host>:8001/mcp
https://gym-mcp.example.com/mcp
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

El agente debe pasar siempre el `telegram_user_id` en las operaciones de perfil y sesión. Así la API mantiene los datos aislados por atleta.

No guardes series, sesiones ni datos corporales en la memoria del agente: Gym Tracker es la fuente de verdad.

## Seguridad

- Usa `COACH_API_KEY` fuerte.
- Mantén el MCP privado cuando sea posible.
- Si lo publicas, usa HTTPS y protección en el proxy inverso.
- No compartas tokens de Telegram, claves MCP ni credenciales S3.
- Usa los enlaces generados por `session_web_url` y `share_web_url`; no construyas URLs de sesiones manualmente.
