# =============================================================================
# gym-tracker — Dockerfile
# =============================================================================
# Stage 0: Build the Astro Mini App
FROM node:22-slim AS frontend
WORKDIR /fe
COPY apps/miniapp/package.json apps/miniapp/package-lock.json ./
RUN npm ci
COPY apps/miniapp/ ./
# astro.config reads the version from ../../.release-please-manifest.json (= / here)
COPY .release-please-manifest.json /
RUN npm run build

# Stage 1: Build the locked Python environment
FROM python:3.13-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /bin/uv

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Stage 2: Runtime image
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the exact environment resolved by uv.lock.
COPY --from=builder /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH

# Copy application code + built Mini App
COPY apps/api/ /app/
COPY --from=frontend /fe/dist/ /app/static/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=5)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
