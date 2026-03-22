FROM node:24-slim AS frontend-build

WORKDIR /frontend

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

COPY dive_backend.py postgres_store.py migrate_postgres_schema.py docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "dive_backend.py"]
