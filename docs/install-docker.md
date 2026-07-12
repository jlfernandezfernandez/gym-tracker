# Instalar con Docker

Esta guía instala Gym Tracker en un servidor Docker normal. Usa imágenes públicas
de GHCR y deja App y MCP en `localhost` por defecto.

## Requisitos

- Docker Engine con Compose v2.
- Un dominio HTTPS para Telegram, por ejemplo `https://gym.example.com`.
- Un proxy HTTPS en la **misma máquina** que reenvíe al puerto local de la App.
- Un bot de Telegram y un agente MCP.

## 1. Configura el entorno

```bash
git clone https://github.com/jlfernandezfernandez/gym-tracker.git
cd gym-tracker
cp .env.example .env
```

Genera dos secretos y edita `.env`:

```bash
openssl rand -hex 32 # POSTGRES_PASSWORD
openssl rand -hex 32 # COACH_API_KEY
```

Valores mínimos de producción:

```dotenv
ENVIRONMENT=production
POSTGRES_USER=gym_user
POSTGRES_PASSWORD=<secreto-largo>
POSTGRES_DB=gym_tracker
TELEGRAM_BOT_TOKEN=<token-del-mismo-bot-de-Telegram>
COACH_API_KEY=<otro-secreto-largo>
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
GYM_TRACKER_VERSION=1.0.0
```

No cambies `APP_BIND=127.0.0.1` ni `MCP_BIND=127.0.0.1` para una instalación
normal. Así los puertos no quedan publicados por accidente.

## 2. Arranca el stack de producción

```bash
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
```

`app-init` aplica migraciones e instala el catálogo en el volumen persistente.
El primer arranque descarga la release del dataset; después es idempotente.

## 3. Configura HTTPS

Tu proxy debe terminar TLS para `gym.example.com` y reenviar a:

```text
http://127.0.0.1:8000
```

No reenvíes PostgreSQL. Tampoco expongas MCP: si el agente vive en esta máquina,
conéctalo a `http://127.0.0.1:8001/mcp`.

## 4. Comprueba antes de abrir Telegram

```bash
curl http://127.0.0.1:8000/ready
curl http://127.0.0.1:8001/health
```

Después sigue [Telegram](setup-telegram.md) y [MCP](agent-setup.md).

## Agente en otra máquina

La opción recomendada es una VPN o una red privada. Solo en una LAN de confianza,
puedes cambiar `MCP_BIND=0.0.0.0`, proteger el puerto con firewall para la IP del
agente y reiniciar el stack. Nunca publiques MCP directamente en Internet: la
clave del coach protege MCP → API, no al cliente que conecta a MCP.

## Actualizar

1. Exporta PostgreSQL antes de un cambio importante.
2. Cambia `GYM_TRACKER_VERSION` a un tag publicado.
3. Ejecuta:

```bash
docker compose -f compose.production.yml pull
docker compose -f compose.production.yml up -d
```

Los volúmenes `postgres_data` y `exercise_data` se conservan. `down -v` los borra
intencionadamente.
