FROM node:24-slim AS frontend-build

WORKDIR /frontend

ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY dive_backend.py postgres_store.py print_dives.py migrate_sqlite_to_postgres.py ./
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 8000

CMD ["python", "dive_backend.py"]
