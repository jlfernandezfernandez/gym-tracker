# Instalar con Docker

## Requisitos

- Docker Engine con Compose v2.
- Un dominio o túnel HTTPS para abrir la Mini App desde Telegram.
- Un bot de Telegram y una clave privada para el coach.

## Instalación

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
```

Edita `.env`:

```dotenv
ENVIRONMENT=production
POSTGRES_USER=gym_user
POSTGRES_PASSWORD=una-clave-larga
POSTGRES_DB=gym_tracker
TELEGRAM_BOT_TOKEN=...
COACH_API_KEY=otra-clave-larga
CORS_ORIGINS=https://gym.example.com
PUBLIC_APP_URL=https://gym.example.com
EXERCISE_DATASET_VERSION=v1.0.0
```

Levanta el stack:

```bash
docker compose up -d --build
docker compose ps
```

`app-init` aplica migraciones e instala el catálogo antes de arrancar la App. El primer arranque descarga aproximadamente 121 MB; los siguientes omiten el proceso si la versión coincide.

## Proxy HTTPS

Envía el dominio público al servicio `app`, puerto `8000`. No publiques PostgreSQL. El MCP ya está limitado a `127.0.0.1:8001` para agentes instalados en la misma máquina.

Comprueba:

```bash
curl https://gym.example.com/health
docker compose logs app-init
```

Después configura [Telegram](setup-telegram.md) y [el agente MCP](agent-setup.md).

## Actualizar

```bash
git pull --ff-only
docker compose up -d --build
```

Para actualizar el catálogo cambia `EXERCISE_DATASET_VERSION`; consulta [dataset.md](dataset.md).
