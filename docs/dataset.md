# Actualizar el dataset

Gym Tracker consume releases inmutables de [exercises-dataset-es](https://github.com/jlfernandezfernandez/exercises-dataset-es).

## Versión instalada

La versión se fija en `.env`:

```dotenv
EXERCISE_DATASET_VERSION=v1.0.0
```

`app-init` compara esa versión con PostgreSQL y con el marcador del volumen. Si coinciden, no realiza ninguna petición.

## Actualizar

1. Revisa la release del dataset.
2. Cambia `EXERCISE_DATASET_VERSION`.
3. Redespliega o ejecuta `docker compose up -d`.
4. Comprueba el log de `app-init`.

El instalador descarga `manifest.json` y un único `exercise-dataset.tar.gz`, verifica SHA-256 y extrae la versión en un directorio nuevo antes de activarla.

## Publicar una versión

En el repositorio del dataset, actualiza los datos y crea un tag:

```bash
git tag v1.1.0
git push origin main v1.1.0
```

GitHub Actions valida referencias, genera los assets y publica la release. No reutilices ni muevas tags existentes.
