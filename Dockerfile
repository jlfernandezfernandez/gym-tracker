# Stage 0: Build Astro frontend
FROM node:22-alpine AS frontend
WORKDIR /web
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY astro.config.mjs ./
COPY src/ ./src/
COPY frontend/ ./frontend/
RUN npm run build

# =============================================================================
# gym-tracker — Dockerfile
# =============================================================================
# Stage 1: Build / install dependencies
FROM python:3.13-slim AS builder

WORKDIR /app

# Install build deps (only needed during build)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime image
FROM python:3.13-slim

WORKDIR /app

# Install curl for Coolify healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only installed packages from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY backend/ /app/
COPY --from=frontend /web/dist/ /app/static/

WORKDIR /app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
