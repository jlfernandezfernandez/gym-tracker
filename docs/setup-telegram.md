# Configurar Telegram y la Mini App

Gym Tracker no recibe mensajes de Telegram: Hermes, OpenClaw u otro agente hace
de gateway y usa MCP. La Mini App valida únicamente la identidad que Telegram le
entrega al abrirla.

## 1. Usa un único bot

1. Crea un bot con `@BotFather` o usa el que ya recibe tus mensajes.
2. Copia su token en `TELEGRAM_BOT_TOKEN` de Gym Tracker.
3. Configura **ese mismo bot** en el gateway del agente.

Si el token de Gym Tracker no coincide con el bot que abre la Mini App, todas las
lecturas de perfil, sesiones y mediciones devolverán `401`.

## 2. Publica la App por HTTPS

Elige una URL estable y accesible desde el teléfono:

```text
https://gym.example.com
```

Usa exactamente el mismo origen en producción:

```dotenv
PUBLIC_APP_URL=https://gym.example.com
CORS_ORIGINS=https://gym.example.com
```

Telegram exige un certificado HTTPS válido. `localhost`, HTTP y certificados
autofirmados no sirven para la Mini App real.

## 3. Configura el botón de menú

En `@BotFather`, usa `/setmenubutton`:

```text
Texto: Entrenar
URL: https://gym.example.com/
```

Abre la App desde el menú del chat del bot. Para una sesión concreta, el agente
debe enviar un botón Telegram `web_app` con la URL devuelta por `session_web_url`:

```json
{
  "text": "Abrir sesión",
  "web_app": {"url": "https://gym.example.com/session/share/TOKEN"}
}
```

Un enlace normal no garantiza que Telegram entregue `initData`; úsalo solo para
vistas de compartir de solo lectura.

## 4. Checklist real

1. Abre **Entrenar** desde el chat del bot, no desde un navegador externo.
2. Comprueba que se muestra el perfil, las sesiones y las mediciones.
3. Pide al agente un plan pasando el `telegram_user_id` del chat.
4. Abre la sesión desde su botón Web App y registra una serie.
5. Vuelve al historial y comprueba la serie.

Si falla con `401`, verifica primero: bot correcto, `TELEGRAM_BOT_TOKEN` idéntico,
URL HTTPS y que has abierto la App desde Telegram.

## Seguridad

- No publiques `TELEGRAM_BOT_TOKEN` ni `COACH_API_KEY`.
- Mantén MCP y PostgreSQL privados.
- Nunca construyas URLs de sesiones manualmente; usa las herramientas MCP.
