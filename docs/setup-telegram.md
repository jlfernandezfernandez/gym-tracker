# Configurar Telegram y la Mini App

Gym Tracker no incluye un gateway de Telegram. Hermes, OpenClaw u otro agente
recibe los mensajes y se conecta al MCP; la App solo valida la identidad de
Telegram mediante `TELEGRAM_BOT_TOKEN`.

## 1. Bot y URL HTTPS

1. Crea un bot en `@BotFather` o utiliza el bot que ya usa tu agente.
2. Copia su token en `TELEGRAM_BOT_TOKEN`.
3. Publica la App en una URL HTTPS estable, por ejemplo
   `https://gym.example.com`.
4. Usa exactamente ese origen en `PUBLIC_APP_URL` y `CORS_ORIGINS`.

La URL debe ser accesible desde el teléfono que abre Telegram. El MCP puede ser
local; la Mini App no, salvo que el teléfono también tenga acceso a la red
privada donde está el servidor.

## 2. Menú de Telegram

En `@BotFather`, configura **Bot Settings → Menu Button** (o `/setmenubutton`)
con:

```text
Texto: Entrenar
URL: https://gym.example.com/
```

Así el usuario puede abrir la Mini App aunque el agente no sepa enviar botones
Web App todavía.

## 3. Botones de las sesiones

Las herramientas `session_web_url` y `share_web_url` devuelven URLs seguras. La
URL de una sesión debe enviarse al atleta como botón Telegram `web_app`, no solo
como enlace de texto:

```json
{
  "text": "Abrir sesión",
  "web_app": {"url": "https://gym.example.com/session/share/TOKEN"}
}
```

El formato exacto depende del gateway del agente. Un botón URL normal puede
abrir la página, pero no garantiza que Telegram entregue `initData` y la
sesión quedará sin escritura. Los enlaces de compartir para acompañantes sí
pueden ser enlaces normales de solo lectura.

## 4. Prueba de identidad y escritura

1. Abre el menú `Entrenar` desde el chat del bot.
2. La App debe cargar sin mostrar “Esta app vive dentro de Telegram”.
3. El agente debe crear un plan pasando el `telegram_user_id` del chat.
4. Abre el botón `Abrir sesión` y registra una serie.
5. Comprueba que la serie aparece en el historial.

Si la App abre como solo lectura, revisa que el gateway haya usado `web_app`,
que el dominio sea HTTPS y que `TELEGRAM_BOT_TOKEN` sea el mismo bot que abrió
la Mini App.

## Seguridad

- No publiques `TELEGRAM_BOT_TOKEN`, `COACH_API_KEY` ni credenciales S3.
- Mantén MCP, PostgreSQL y MinIO privados.
- El MCP debe pasar siempre `telegram_user_id` en las operaciones multiusuario.
- No construyas URLs de sesiones manualmente; usa las herramientas MCP.

