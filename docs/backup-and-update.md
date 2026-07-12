# Backups y actualizaciones

Los contenedores App y MCP son stateless. Los datos viven en PostgreSQL y
MinIO, por lo que hay que respaldar ambos.

## Backup

Haz un dump lógico de PostgreSQL con las credenciales de tu `.env`:

```bash
docker compose -f compose.production.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > postgres-$(date +%F).sql
```

Para MinIO usa el cliente `mc` desde una máquina con acceso a `minio:9000` o a
su red privada y replica el bucket `gym-tracker-media` a almacenamiento externo.
Conserva los backups fuera del servidor y verifica periódicamente una
restauración.

## Actualizar

1. Haz backup de PostgreSQL y MinIO.
2. Cambia `GYM_TRACKER_VERSION` a una release concreta, por ejemplo `1.0.0`.
3. Descarga las imágenes y ejecuta:

```bash
docker compose -f compose.production.yml pull
docker compose -f compose.production.yml up -d
```

`app-init` aplica las migraciones y sincroniza el catálogo antes de arrancar la
App. Comprueba `/ready`, `/health`, MCP y una lectura real de datos.

Usar una versión concreta facilita volver a la anterior: cambia la variable y
repite `pull` y `up -d`. `latest` es cómodo para pruebas, pero no es un pin de
producción.

## Empezar de cero

`docker compose down` conserva los volúmenes. No ejecutes `docker compose down
-v` salvo que quieras borrar PostgreSQL y MinIO de forma irreversible para ese
stack.
