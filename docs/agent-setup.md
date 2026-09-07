# Conectar un agente MCP

Gym Tracker no incluye un agente conversacional. Expone un servidor MCP; Hermes,
OpenClaw, Claude, Codex u otro cliente compatible decide cuándo crear planes y
registrar series.

## Endpoint correcto según dónde estés

En la misma máquina que ejecuta Docker Compose:

```text
http://127.0.0.1:8001/mcp
```

Dentro de la red de Compose, el MCP resuelve la API como `http://app:8000/api`.
Ese hostname es interno al bridge de Docker y no sirve para un agente que corre
fuera del stack.

`localhost` tampoco sirve desde otra máquina. Para un agente remoto usa una VPN,
una red privada o un firewall que permita el puerto solo desde la IP del agente.
No publiques el MCP directamente en Internet.

## OpenClaw y Hermes: procedencia y caveat de versión

- OpenClaw: documentación oficial consultada en `https://docs.openclaw.ai/cli/skills` y `https://docs.openclaw.ai/channels/telegram` el 2026-09-07. Los nombres de comandos y pantallas pueden cambiar entre versiones, así que confirma siempre la doc actual si tu build difiere.
- Hermes: documentación oficial consultada en `https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/` el 2026-09-07. Esta guía solo usa comportamientos extraídos de esa página para evitar inventar flags o rutas.

## Skills del repo: descubrimiento automático frente a registro manual

Las dos skills autocontenidas del repo están en [skills/gym-tracker-install/SKILL.md](../skills/gym-tracker-install/SKILL.md) y [skills/gym-tracker/SKILL.md](../skills/gym-tracker/SKILL.md).

OpenClaw documenta instalación local explícita desde un directorio que contiene
`SKILL.md`:

```bash
openclaw skills install ./skills/gym-tracker-install --as gym-tracker-install
openclaw skills install ./skills/gym-tracker --as gym-tracker
```

Hermes usa `~/.hermes/skills/` como directorio principal. Si prefieres no tocar
tu configuración, copia ahí el directorio completo de la skill y evita
sobrescribir una instalación existente sin revisarla antes.

Hermes también puede escanear directorios externos mediante `skills.external_dirs`
en `~/.hermes/config.yaml`. Si ya gestionas skills desde este repo, puedes añadir
la ruta `repo/skills` a esa lista en lugar de copiar archivos, pero esta guía no
modifica tu config local por ti.

Las skills de proyecto en Hermes no se cargan desde `skills/` en la raíz del repo.
Solo descubre `.hermes/skills/` o `.agents/skills/` dentro del proyecto, y solo
después de confiar ese repo con `hermes skills trust`.

Si más adelante publicas una skill en un repo GitHub con la estructura esperada,
Hermes soporta instalación directa con el formato `hermes skills install owner/repo/skills/name`.
Mientras no esté publicada, la copia local funciona ahora mismo.

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

Antes de registrar el endpoint en el agente:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ready
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8001/ready
```

Después de conectar el agente:

1. Ejecuta la prueba MCP documentada por tu cliente si existe.
2. Lee el perfil de un usuario de Telegram.
3. Lista sus sesiones.
4. Crea un plan de prueba solo si el usuario lo pide.

Usa los enlaces devueltos por `session_web_url` y `share_web_url`; no construyas
IDs ni tokens de sesión manualmente.

## Seguridad

- `COACH_API_KEY` protege MCP → API, no autentica a quien abre el endpoint MCP.
- No compartas claves de coach ni tokens de Telegram.
- Mantén PostgreSQL y MCP fuera de Internet.
