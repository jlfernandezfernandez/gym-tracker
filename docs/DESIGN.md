# Diseño de interfaz

Gym Tracker tiene dos superficies con una misma idea visual: información directa, una acción dominante y movimiento sólo cuando explica estado.

## Mini App

Ruta: `apps/miniapp/`.

- Tailwind v4 directamente en Preact.
- Tipografía del sistema para conservar sensación nativa.
- Paleta clara/oscura automática definida en `src/styles/theme.css`.
- Violeta para interacción, verde sólo para progreso completado y rojo sólo para error/destrucción.
- Navegación inferior en Hoy, Historial, Marcas y Perfil; se oculta durante Plan, Ejercicio y vistas compartidas.
- Objetivos táctiles mínimos de 44px y respuesta de presión inmediata.
- Sheets con `<dialog>`, haptics de Telegram y estados estables durante mutaciones.

Componentes compartidos:

```text
src/components/
  feedback.tsx        loading, empty y BusyButton
  navigation.tsx      TopBar y TabBar
  sheet.tsx           confirmación nativa
  visualizations.tsx  body map y gráficas
```

`global.css` sólo contiene base, preferencias de accesibilidad y estilos de DOM generado externamente. La presentación ordinaria vive en utilidades Tailwind.

## Landing

Ruta: `apps/site/`.

- Canvas frío, grafito, violeta y verde reservado para éxito.
- Display con `ui-rounded`, cuerpo del sistema y etiquetas técnicas monoespaciadas; no hay fuentes remotas.
- Secciones independientes en `src/sections/`.
- El hero muestra la conversación que se convierte en una sesión.
- No se usan grids de features genéricos, gradientes decorativos ni animaciones dispersas.

## Movimiento y accesibilidad

- Presión: 100–150ms, `transform` únicamente.
- Entradas excepcionales: menos de 300ms con curvas fuertes de salida.
- Nada frecuente se anima por decoración.
- `prefers-reduced-motion`, transparencia reducida, contraste aumentado, foco visible y safe areas son obligatorios.
- Hover sólo aporta información en dispositivos que realmente soportan hover.

## Verificación

```bash
cd apps/miniapp && npm run build
cd ../site && npm run build
```

Revisa la Mini App en un WebView real de Telegram a 360–430px y la landing a 390, 768, 1280 y 1440px.
