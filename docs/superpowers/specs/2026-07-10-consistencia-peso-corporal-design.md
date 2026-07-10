# Consistencia de peso corporal y perfil

## Objetivo

Eliminar campos de perfil que ya no se usan y presentar de forma consistente los ejercicios de peso corporal, sin kilos redundantes ni etiquetas en inglés.

## Regla de producto

El equipamiento del ejercicio es la fuente de verdad. Si `equipment` es `body weight`, el ejercicio se muestra como **Peso corporal** y su progreso, marca e historial se expresan en repeticiones. El valor `0 kg` de una serie no determina el tipo de ejercicio.

## Cambios

- Eliminar lesiones y limitaciones del perfil, API y migración actual.
- Usar teclado numérico en cada entrada numérica: decimal para peso y entero para edad, altura y repeticiones.
- Centralizar la detección y el texto de peso corporal en el helper existente y reutilizarlo en ejercicio, marcas y detalle de marcas.
- Traducir músculo y equipamiento al mostrarlos en tarjetas.

## Límites

No se añade soporte de lastre en ejercicios de peso corporal. Si se necesita, se modelará explícitamente después, en vez de inferirlo a partir de un número.

## Verificación

Ejecutar la compilación del frontend y comprobar que las rutas afectadas conservan sus tipos y que no quedan referencias a los campos retirados.
