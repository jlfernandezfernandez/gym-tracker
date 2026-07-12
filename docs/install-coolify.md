# Instalar en Coolify

## Crear el recurso

1. Crea un recurso **Docker Compose** desde este repositorio.
2. Selecciona `compose.production.yml`.
3. Asigna el dominio HTTPS al servicio `app`, puerto `8000`.
4. No asignes dominio a `postgres` ni `mcp`.

## Variables

```dotenv
POSTGRES_USER=gym_user
POSTGRES_PASSWORD=una-clave-larga
POSTGRES_DB=gym_tracker
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=otra-clave-larga
CORS_ORIGINS=https://gym.example.com
PUBLIC_APP_URL=https://gym.example.com
EXERCISE_DATASET_VERSION=v1.0.0
GYM_TRACKER_VERSION=latest
```

## Persistencia

El Compose declara dos volúmenes:

| Volumen | Contenido |
| --- | --- |
| `postgres_data` | sesiones, perfil y progreso |
| `exercise_data` | release reproducible del catálogo |

El primer deploy espera a PostgreSQL, aplica migraciones, verifica la release del dataset y después inicia la App.

## Verificar

- `https://gym.example.com/health` devuelve `status: ok`.
- `app-init` termina con código 0.
- `app` y `mcp` quedan saludables.

Después configura [Telegram](setup-telegram.md) y [el agente](agent-setup.md).

## Actualizar

Cambia `GYM_TRACKER_VERSION` y redespliega. Para actualizar el catálogo cambia `EXERCISE_DATASET_VERSION`; consulta [dataset.md](dataset.md).
