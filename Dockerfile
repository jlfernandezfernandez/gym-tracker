# =============================================================================
# gym-tracker — Dockerfile
# =============================================================================
# Stage 0: Build the Astro Mini App
FROM node:22-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 1: Build the locked Python environment
FROM python:3.13-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /bin/uv

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Stage 2: Runtime image
FROM python:3.13-slim

WORKDIR /app

# Copy the exact environment resolved by uv.lock.
COPY --from=builder /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH

# Copy application code + built Mini App
COPY backend/ /app/
COPY --from=frontend /fe/dist/ /app/static/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=5)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
