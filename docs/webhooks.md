# Webhooks salientes

Gym Tracker incluye una capa base para entregar eventos a cualquier agente o servicio
externo mediante HTTP. No depende de Hermes, OpenClaw, OpenAI ni de un broker.

La capa está **desactivada por defecto**. Actualmente publica solo estos eventos
cuando el endpoint está configurado:

- `gym.session.finished`, al terminar una sesión desde la aplicación.
- `gym.discomfort.reported`, cuando se registra una molestia explícita desde la
  sesión; no se emite por cada actualización normal.

No incluye eventos de cada serie ni eventos de navegación.

## Configuración

En `.env` o en las variables de Coolify:

```dotenv
WEBHOOKS_ENABLED=false
WEBHOOKS_URL=https://agente.example.com/webhooks/gym-tracker
WEBHOOKS_SECRET=cambia-esto-por-un-secreto-largo
WEBHOOKS_POLL_SECONDS=5
WEBHOOKS_MAX_ATTEMPTS=8
```

Para activar la entrega deben estar definidos `WEBHOOKS_ENABLED=true`,
`WEBHOOKS_URL` y `WEBHOOKS_SECRET`. Mantén el secreto solo en el runtime; no lo
incluyas en la imagen ni en el repositorio.

## Contrato de transporte

El cuerpo usa el formato JSON de CloudEvents:

```json
{
  "specversion": "1.0",
  "id": "evento-unico",
  "type": "evento-definido-por-el-producto",
  "source": "gym-tracker",
  "subject": "recurso/opcional",
  "time": "2026-01-01T12:00:00Z",
  "datacontenttype": "application/json",
  "data": {}
}
```

Cabeceras:

- `Content-Type: application/cloudevents+json`
- `X-Webhook-Id`: igual que `id`.
- `X-Webhook-Signature`: `sha256=` seguido del HMAC-SHA256 del cuerpo exacto,
  usando `WEBHOOKS_SECRET`.

El receptor debe responder con un código HTTP `2xx`. Los fallos se reintentan con
backoff hasta `WEBHOOKS_MAX_ATTEMPTS`; después quedan marcados como `failed` en
PostgreSQL. El identificador del evento permite hacer el receptor idempotente.

## Arquitectura

1. La acción de sesión guarda el cambio de negocio y el evento en la misma
   transacción mediante el outbox.
2. El dispatcher opcional lee eventos pendientes de PostgreSQL.
3. Envía el CloudEvent al endpoint configurado.
4. Guarda intentos, último error y estado de entrega.

No hay eventos adicionales activos en esta versión. La Mini App y el MCP no cambian
su comportamiento fuera de emitir los dos eventos anteriores cuando sus acciones
correspondientes ocurren.

## Local y Coolify

En local, el endpoint puede ser otro contenedor de Compose o un agente del mismo
ordenador. Si el receptor está fuera de la red local, usa una URL HTTPS accesible,
VPN o túnel privado. No publiques PostgreSQL ni el endpoint de la API solo para
recibir webhooks.

En Coolify, añade las cinco variables como runtime-only. El stack ya las pasa al
servicio `app`; dejar `WEBHOOKS_ENABLED=false` mantiene el comportamiento actual.
