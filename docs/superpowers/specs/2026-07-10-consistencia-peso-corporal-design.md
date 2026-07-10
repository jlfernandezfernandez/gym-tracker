# Consistencia de peso corporal y perfil

## Objetivo

Eliminar campos de perfil que ya no se usan y presentar de forma consistente los ejercicios de peso corporal, sin kilos redundantes ni etiquetas en inglés.

## Regla de dominio

El backend usa valores semánticos para el peso: `-1` es peso corporal, `0` es sin carga y un valor positivo son kg. Al crear planes o registrar series, el backend asigna `-1` a ejercicios con `equipment = body weight`; los clientes no deciden el tipo de ejercicio. Las respuestas exponen además `weight_mode` y `total_volume` para que Mini App y MCP solo presenten datos ya resueltos.

## Cambios

- Eliminar lesiones y limitaciones del perfil, API y migración actual.
- Usar teclado numérico en cada entrada numérica: decimal para peso y entero para edad, altura y repeticiones.
- Migrar los planes y series corporales existentes de `0` a `-1`, y excluir el centinela del volumen.
- Presentar `weight_mode` desde el backend en ejercicio, marcas y detalle de marcas.
- Traducir músculo y equipamiento al mostrarlos en tarjetas.

## Límites

No se añade soporte de lastre en ejercicios de peso corporal. Si se necesita, se añadirá como un modo de peso explícito; no se inferirá en los clientes.

## Verificación

Ejecutar la compilación del frontend y comprobar que las rutas afectadas conservan sus tipos y que no quedan referencias a los campos retirados.
