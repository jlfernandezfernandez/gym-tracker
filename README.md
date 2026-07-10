# 🏋️ Gym Coach — Tu entrenador personal en Telegram

> Conecta un coach de IA a tu Telegram. Él te pregunta, conoce tu cuerpo, crea tus entrenos y te los abre en una Mini App visual. Tú solo entrenas.

---

## ¿Qué es?

Gym Coach es un **agente entrenador** que vive en tu Telegram. No es una app más de gimnasio — es un coach real que:

- **Te conoce**: pregunta tu objetivo, experiencia, lesiones, equipamiento del gym
- **Crea planes adaptados**: cada entreno es único, basado en tu perfil y energía del día
- **Te guía en tiempo real**: te dice qué ejercicio toca, qué serie, qué peso
- **Se adapta**: ¿una máquina está ocupada? ¿te duele algo? Lo cambia al instante
- **Registra todo**: series, pesos, sensaciones — sin que tú toques nada
- **Aprende**: guarda tus preferencias y evita lo que odias

Y cuando necesitas ver el plan o registrar series tocando botones, te abre una **Mini App visual** dentro de Telegram.

---

## Cómo se ve

Demo visual en la web del proyecto: **[jlfernandezfernandez.github.io/gym-tracker](https://jlfernandezfernandez.github.io/gym-tracker/)**

---

## ¿Por qué esto es diferente?

Las apps de gimnasio te dan una plantilla y te dejan solo. Gym Coach es un **agente** que conversa contigo:

- *— Voy a entrenar*
- *— ¿Cuánta energía tienes? ¿Molestias?*
- *— Energía 7, sin molestias, 45 minutos*
- *— Perfecto. 4 ejercicios, 3 series. Te lo abro 👇*

No rellenas formularios. No buscas ejercicios. **Hablás con tu coach y él hace todo.**

---

## Arquitectura — pensada para agentes

```text
Tú ──Telegram──> Coach (Hermes) ──MCP──> API ──> Base de datos
                        │
                        └──deep link──> Mini App (visual)
```

La aplicación es **agnóstica al agente**. No sabe ni le importa quién la llama. Todo se controla via MCP (22 herramientas):

| Categoría | Qué hace el agente |
|---|---|
| **Perfil** | Leer y actualizar tu perfil deportivo |
| **Mediciones** | Registrar y consultar peso/composición corporal con fecha y fuente |
| **Catálogo** | Buscar ejercicios, ver alternativas |
| **Sesiones** | Crear planes, ver estado actual, registrar series |
| **Mini App** | Generar deep links para abrir la web |

Cualquier agente con soporte MCP (Hermes, Claude, Cursor...) puede controlar la app entera.

---

## Setup rápido

### Opción A: Docker Compose (local, 5 minutos)

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker

# Configurar
cp .env.example .env
# Edita .env: pon tu TELEGRAM_BOT_TOKEN (de @BotFather)
# ⚠️ Sin token la auth queda DESACTIVADA (solo para dev local)

# Levantar
docker compose up -d

# La app está en http://localhost:8000
```

### Opción B: Coolify (producción con dominio)

1. Fork/clone este repo
2. En Coolify: New Resource → GitHub → selecciona `gym-tracker`
3. Añade un Postgres como servicio vinculado
4. Set environment variables:
   - `TELEGRAM_BOT_TOKEN` = tu token de @BotFather
   - `CORS_ORIGINS` = tu dominio (ej: `https://gym.midominio.com`)
5. Deploy

El Dockerfile sirve API y Mini App desde un solo contenedor. El **catálogo de ejercicios** (1324 ejercicios bilingües, con GIFs e imágenes) se carga solo en el primer arranque: el JSON viaja con el repo (`backend/exercise_data/exercises.json`) y los binarios se descargan bajo demanda del [fork dataset-es](https://github.com/jlfernandezfernandez/exercises-dataset-es) al primer boot — el repo no empaqueta los binarios. El almacenamiento S3 compatible usa MinIO en producción y desarrollo local. El esquema de la DB se crea con **Alembic** (`alembic upgrade head` corre solo en el boot).

### Conectar el coach (Hermes)

Después de levantar la app, conecta un perfil de Hermes como coach:

```bash
# Crear perfil separado para el coach
hermes profile create gym-coach

# Registrar el MCP
hermes -p gym-coach mcp add gym_tracker \
  --stdio /path/to/gym_tracker_mcp.py \
  --env GYM_TRACKER_API_BASE=https://gym.midominio.com/api \
  --env GYM_TRACKER_APP_BASE=https://gym.midominio.com

# Configurar el bot de Telegram
hermes -p gym-coach config set telegram.bot_token "TU_BOT_TOKEN"

# Iniciar el gateway
hermes -p gym-coach gateway start
```

El coach tiene su propia personalidad y skill. Copia los templates de `templates/SOUL.md` y `templates/SKILL.md` al perfil.

Lee [`docs/coach-setup.md`](docs/coach-setup.md) para la guía completa paso a paso.

---

## Cómo funciona

Gym Coach combina un **coach de IA** en Telegram con una **Mini App visual**:

1. Hablas con el bot en Telegram.
2. El coach te conoce: objetivo, experiencia, lesiones, equipamiento.
3. Crea tu entrenamiento del día.
4. Te envía un botón. Al pulsarlo se abre la Mini App.
5. Desde la Mini App ves el plan, cada ejercicio con GIF o imagen, y registras peso/reps/notas serie a serie.
6. Cuando terminas, el coach recibe tu feedback y progreso para ajustar la próxima sesión.

No tienes que rellenar formularios ni buscar ejercicios. **Hablas con tu coach y él hace todo.**

---

## Multi-usuario

Cada persona que abre la Mini App desde Telegram se identifica automáticamente via **Telegram InitData** (firma HMAC con el bot token). No hay registros, no hay passwords.

- **Tus sesiones son tuyas**: nadie más puede verlas o modificarlas
- **Tu perfil es tuyo**: cada usuario tiene su propio perfil de atleta
- **Datos separados**: cada instancia (docker compose o Coolify) tiene su propia base de datos

Si despliegas tu propia instancia, tus datos están en tu Postgres, en tu servidor. Nadie más tiene acceso.

¿Instancia compartida? Un mismo coach puede atender a varias personas: el MCP pasa `telegram_user_id` en cada tool y la API separa perfiles y sesiones por usuario.

---

## Para agentes — manual de operación

¿Eres un agente conectándote como coach? El propio servidor MCP te entrega el manual al conectarte: las `instructions` del servidor + los docstrings de cada tool son suficientes para operar sin leer nada más. Las plantillas de `templates/` (SOUL.md, SKILL.md) son un punto de partida opcional para darle personalidad.

**Qué eres tú y qué es la app**: tú eres el cerebro — la app no tiene IA, solo persiste perfil, sesiones, ejercicios y series. El chat de Telegram es el producto principal; la Mini App es la superficie visual que abres con deep links cuando ver/tocar gana a leer.

**Reglas**:

1. **Onboarding primero.** Al empezar, `get_athlete_profile`. Si `onboarding_complete` es false, no planifiques: pregunta como entrenador real (objetivo, experiencia, días/tiempo, lesiones, equipamiento, gustos) en bloques cortos y guarda con `patch_athlete_profile` (termina con `"onboarding_complete": true`).
2. **Nunca inventes** peso, altura, lesiones, máquinas ni historial. Lee el perfil, mira `list_sessions`, o pregunta.
3. **Elige tú los ejercicios**: `list_exercises` / `list_muscle_groups` → pásalos en `exercises_json` de `create_plan`. La API rechaza planes sin ejercicios (422).
4. **Preview antes de entrenar**: `create_plan` deja la sesión en `planned`; manda `session_web_url`. ¿No convence? `delete_session` y otra.
5. **Durante el entreno actualiza estado, no solo respondas**: "he hecho 12" → `log_set`; "me duele el hombro" → alternativa + guarda en perfil; "no hay máquina" → `patch_athlete_profile` + `update_planned_exercise` con `new_exercise_id`. Posición actual: `get_active_session` / `get_current_state`.
6. **Al terminar**: `finish_session` con feedback. La duración se calcula sola desde `started_at` — no envíes `duration_actual` salvo que el atleta lo diga. Sin sets loggeados y sin `duration_actual` el endpoint responde 422 (no hay fallback a 0). Úsalo (y `list_sessions`) para adaptar el siguiente plan.
7. **Datos corporales**: peso, composición, básculas, escáneres → `record_body_measurement` (con fecha y fuente); evolución → `list_measurements`.
8. **Compartir**: `share_web_url(share_token)` → link solo lectura para un compañero en cualquier navegador.
9. **Multi-usuario**: pasa siempre `telegram_user_id` (id de Telegram del chat) en tools de perfil/sesión. Sin él, acceso sin filtro — solo instancias personales.

**Deep links** (los generan `session_web_url` / `share_web_url`, nunca los construyas a mano): plan `/session/share/<token>` · ejercicio `/session/share/<token>/exercise/<planned_id>`.

**Persistencia**: lo físico/entrenable → perfil de la app. Tu memoria de agente → solo preferencias humanas estables. No dupliques logs de entreno.

---

## MCP — las 22 herramientas del coach

El coach controla toda la app via MCP. Estas son las herramientas:

| Tool | Para qué |
|---|---|
| `health` | Saber si la API está viva |
| `get_athlete_profile` | Leer perfil del atleta |
| `patch_athlete_profile` | Guardar/actualizar campos del perfil (onboarding incluido) |
| `record_body_measurement` | Registrar peso/composición corporal con fecha y fuente |
| `list_measurements` | Historial de mediciones corporales (evolución) |
| `list_exercises` | Buscar ejercicios por nombre o músculo |
| `list_muscle_groups` | Ver grupos musculares disponibles |
| `get_exercise` | Detalle completo de un ejercicio |
| `exercise_progress` | Progresión de un ejercicio (peso, volumen) |
| `get_session` | Ver una sesión completa |
| `list_sessions` | Historial de sesiones (para adaptar planes; filtra por fecha) |
| `get_active_session` | Ver sesión en curso + estado actual |
| `get_current_state` | Saber qué ejercicio y serie toca ahora |
| `create_plan` | Crear un plan con los ejercicios que elige el agente |
| `delete_session` | Descartar un plan que no convence |
| `log_set` | Registrar una serie (peso, reps, sensación) |
| `complete_exercise` | Marcar ejercicio como completado |
| `delete_set` | Borrar una serie mal registrada |
| `update_planned_exercise` | Cambiar/saltar un ejercicio |
| `finish_session` | Terminar sesión con feedback (duración auto, idempotente) |
| `session_web_url` | Generar link a la Mini App (`/session/share/<token>`) |
| `share_web_url` | Generar link compartible (solo lectura) |

Al conectarte, el servidor MCP también expone unas `instructions` con el manual de operación completo — un agente nuevo no necesita más documentación.

---

## Stack

- **Backend**: FastAPI + SQLModel + Postgres
- **Frontend**: Astro + Preact (islas) + TanStack Query + Tailwind + Chart.js + body-highlighter → Mini App de Telegram
- **MCP**: Python (FastMCP) — el puente entre agente y app
- **Deploy**: Docker multi-stage, Coolify o docker compose
- **Auth**: Telegram InitData HMAC (sin passwords)

---

## Estructura del repo

```text
├── backend/          # FastAPI app (API + static files)
│   ├── routers/      # sessions, exercises, coach, profile
│   ├── models.py     # SQLModel tables
│   ├── schemas.py    # Pydantic schemas
│   ├── telegram_auth.py  # HMAC InitData validation
│   ├── seed/         # Exercise catalog seeder (baja media del fork dataset-es)
│   ├── migrations/   # Alembic migrations (initial schema en versions/)
│   ├── alembic.ini   # Config de Alembic (migraciones auto-aplicadas en boot)
│   └── exercise_data/    # Catálogo: JSON en el repo; imágenes/GIFs se descargan al arrancar
├── frontend/         # Mini App (Astro + Preact + TanStack Query + Tailwind)
│   └── src/
│       ├── pages/        # index.astro (shell)
│       ├── layouts/      # AppLayout
│       ├── components/   # App.tsx (island + router), ui.tsx, screens/*
│       ├── lib/          # api.ts, helpers.ts, chart.ts, bodymap.ts, telegram.ts
│       └── styles/       # global.css
├── mcp/              # MCP server (22 tools)
├── templates/        # SOUL.md + SKILL.md for coach profile
├── docs/             # Setup guide + landing
├── Dockerfile        # Multi-stage: build frontend + API + estáticos
└── docker-compose.yml
```

---

## Contribuir

El repo está abierto a contribución: issues, PRs e ideas de producto. Lee [CONTRIBUTING.md](CONTRIBUTING.md) — en local arrancas con `docker compose up -d` y sin bot token la auth queda desactivada (modo dev).

---

## Licencia

MIT. Úsalo, modifícalo, compártelo. Ver [LICENSE](LICENSE).

---

## ¿Quién lo hizo?

Un agente Hermes construyó este producto entero: backend, frontend, MCP, Docker, despliegue. El coach que lo usa también es Hermes. Es un producto pensado para que agentes de IA controlen entrenamientos de personas reales.