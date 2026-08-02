# DevForge AI — single-container deploy (dashboard + API) for Hugging Face Spaces.
# Stage 1 builds the Vite dashboard; stage 2 runs FastAPI and serves the built
# assets + the API on one origin (port 7860, HF's default).

# ---- Stage 1: build the React/Vite dashboard ----
FROM node:20-slim AS frontend
# puppeteer (a demo-video dev dep) tries to download Chrome on install, which
# fails in the slim image and isn't needed to build the dashboard — skip it.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # -> /build/dist

# ---- Stage 2: Python runtime ----
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/tmp/hf
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# backend source (dist/ is gitignored on the host; we take the freshly built one)
COPY . .
COPY --from=frontend /build/dist ./dist

# run as the non-root user Hugging Face Spaces expects (uid 1000), writable output/
RUN mkdir -p output && useradd -m -u 1000 user && chown -R user:user /app
USER user

EXPOSE 7860
# $PORT is honored when present (Render etc.); defaults to 7860 for HF Spaces.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
