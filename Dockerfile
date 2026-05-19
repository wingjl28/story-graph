# Multi-stage build for AWS App Runner. App Runner port is configured to 8000 via CDK.

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
# Cognito config is baked into the SPA at build time (Vite inlines VITE_*).
# Pass via: docker build --build-arg VITE_COGNITO_AUTHORITY=... \
#   --build-arg VITE_COGNITO_CLIENT_ID=...
# Left blank => frontend runs in dev/no-auth mode (matches backend with
# COGNITO_USER_POOL_ID unset).
ARG VITE_COGNITO_AUTHORITY=""
ARG VITE_COGNITO_CLIENT_ID=""
ARG VITE_COGNITO_REDIRECT_URI=""
ARG VITE_COGNITO_SCOPE=""
ENV VITE_COGNITO_AUTHORITY=$VITE_COGNITO_AUTHORITY \
    VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID \
    VITE_COGNITO_REDIRECT_URI=$VITE_COGNITO_REDIRECT_URI \
    VITE_COGNITO_SCOPE=$VITE_COGNITO_SCOPE
RUN npm run build

# Stage 2: Build and run backend
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
# alembic.ini lives at the repo root and is required at runtime by
# init_db() -> `alembic upgrade head` (resolves to /app/alembic.ini).
# Migrations themselves are under backend/migrations (copied above).
COPY alembic.ini ./alembic.ini
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000
CMD ["python","-m","uvicorn","backend.main:app","--host","0.0.0.0","--port","8000"]
