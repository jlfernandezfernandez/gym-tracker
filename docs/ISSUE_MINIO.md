# Issue: Migrar Garage S3 a MinIO para simplificar el despliegue local y en Coolify v4

## Descripción
Actualmente, el proyecto utiliza **Garage S3** (`dxflrs/garage`) como servidor de almacenamiento de objetos compatible con S3 para guardar las imágenes y GIFs de los ejercicios. 

Aunque Garage es una excelente herramienta para entornos distribuidos con replicación geográfica multiseridor, para este proyecto (que es un despliegue mononodo/único servidor) introduce una complejidad innecesaria:
1. Requiere inicialización manual de topología de cluster (`layout assign` y `layout apply`).
2. Requiere generación de claves RPC y tokens de administración.
3. Requiere scripts de inicialización complejos (`garage-init`) y un empaquetado custom (distroless vs alpine con scripts).
4. En **Coolify v4**, desplegar y configurar Garage requiere configuraciones personalizadas complejas, mientras que MinIO es un servicio nativo de un solo clic.

## Propuesta: Migrar a MinIO
Proponemos sustituir **Garage** por **MinIO**, que es el estándar de la industria para S3 auto-hospedado.

### Beneficios
* **Sin Scripts de Inicialización**: MinIO no requiere comandos de `layout` o claves de cluster. Arranca directamente y está listo para usarse.
* **Soporte Nativo en Coolify v4**: Coolify tiene una plantilla integrada para MinIO que se despliega en segundos.
* **Configuración por Variables de Entorno**: Todo (credenciales, puerto, etc.) se define con variables estándar y limpias.

---

## Cambios Recomendados para DevOps

### 1. Actualización de Backend (Auto-creación de Bucket)
Para eliminar por completo contenedores de inicialización como `garage-init`, añadiremos un bloque de código al arrancar el backend (`lifespan` en `backend/main.py`) para que cree el bucket automáticamente si no existe:

```python
# En backend/main.py (dentro de lifespan)
try:
    s3 = _get_s3()
    s3.head_bucket(Bucket=S3_BUCKET)
except Exception:
    logger.info("Creating S3 bucket: %s", S3_BUCKET)
    s3.create_bucket(Bucket=S3_BUCKET)
```

### 2. Nuevo `docker-compose.yml` (Local Dev)
El archivo `docker-compose.yml` se reduce significativamente, eliminando `garage-init` y volúmenes redundantes:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: gym-tracker-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-gym_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-gym_pass}
      POSTGRES_DB: ${POSTGRES_DB:-gym_tracker}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  minio:
    image: minio/minio:latest
    container_name: gym-tracker-minio
    restart: unless-stopped
    ports:
      - "9000:9000"  # S3 API
      - "9001:9001"  # Consola Web (Opcional en dev)
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY:-gym-tracker-access-key}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-gym-tracker-secret-key}
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gym-tracker-app
    restart: unless-stopped
    ports:
      - "${APP_PORT:-8000}:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-gym_user}:${POSTGRES_PASSWORD:-gym_pass}@postgres:5432/${POSTGRES_DB:-gym_tracker}
      CORS_ORIGINS: ${CORS_ORIGINS:-*}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      COACH_API_KEY: ${COACH_API_KEY:-}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-gym-tracker-access-key}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-gym-tracker-secret-key}
      S3_BUCKET: gym-tracker-media
      S3_REGION: us-east-1
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy

volumes:
  postgres_data:
  minio_data:
```

### 3. Configuración en Coolify v4
MinIO ya no aparece como un servicio "one-click" preconfigurado de primer nivel en Coolify v4 (fue retirado del catálogo oficial). Sin embargo, se puede desplegar de forma muy sencilla de dos maneras:

#### Opción A: Despliegue en Coolify como Servicio Personalizado (Custom Service)
1. En el panel de Coolify, haz clic en **"Create New"** > **"Service"** > **"Custom Service" (Docker Compose)**.
2. Pega la definición de `docker-compose.yml` que se proporciona en la sección anterior. Coolify levantará tanto la App, Postgres como MinIO en la misma red privada de Docker de forma automática.
3. La App se comunicará con MinIO de forma interna usando la dirección `http://minio:9000`.

#### Opción B: Usar un S3 Gestionado (Recomendado para Producción)
En lugar de auto-hospedar S3 en el mismo servidor VPS (lo cual añade complejidad con copias de seguridad y espacio en disco):
1. Se puede utilizar **Cloudflare R2** (cuenta con un nivel gratuito de hasta 10GB/mes y costes de transferencia $0) o **Backblaze B2**.
2. Basta con configurar las siguientes variables de entorno en la App dentro de Coolify apuntando al proveedor externo:
   * `S3_ENDPOINT`: URL del Endpoint S3 de Cloudflare/Backblaze.
   * `S3_ACCESS_KEY`: Access Key ID.
   * `S3_SECRET_KEY`: Secret Access Key.
   * `S3_BUCKET`: Nombre del bucket creado en el proveedor.
   * `S3_REGION`: Región del bucket (ej: `auto` o `us-east-1`).

