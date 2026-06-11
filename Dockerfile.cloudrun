# =============================================================================
# Dockerfile — PipelineGuardian (Multi-stage: React → Python)
# Stage 1: Build React/Vite frontend
# Stage 2: Python 3.11 runtime serving both the webhook API + static frontend
# =============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /project

# Copy package files first (layer cache — only re-installs on package.json change)
COPY package.json package-lock.json ./

RUN npm ci --prefer-offline --no-audit

# Copy source and build
COPY index.html vite.config.ts tsconfig*.json tailwind.config.js postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/ 2>/dev/null || true

RUN npm run build
# Output: /project/dist/

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Python runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# System deps: ca-certificates for HTTPS, curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# (Copy requirements first for layer caching)
COPY adk_agents/requirements.txt ./adk_agents/requirements.txt
RUN pip install --no-cache-dir \
    google-adk>=0.5.0 \
    google-cloud-secret-manager>=2.20.0 \
    fastapi>=0.136.0 \
    "uvicorn[standard]>=0.29.0" \
    python-gitlab>=4.0.0 \
    requests>=2.32.0 \
    python-dotenv>=1.0.1 \
    supabase>=2.4.0 \
    PyYAML>=6.0.2 \
    mcp>=1.3.0 \
    httpx>=0.27.0 \
    -r adk_agents/requirements.txt

# Copy React build output from Stage 1
COPY --from=frontend-builder /project/dist/ ./static/

# Copy application source
COPY adk_agents/ ./adk_agents/
COPY webhook_server.py ./webhook_server.py

# Cloud Run injects PORT (always 8080 in managed Cloud Run)
ENV PORT=8080
EXPOSE 8080

# Single worker — Cloud Run scales horizontally via instances, not threads
CMD ["uvicorn", "webhook_server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
