FROM node:24.14.1-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/divevault ./divevault
COPY backend/migrations ./migrations
COPY backend/docker ./docker
RUN chmod +x /app/backend/docker/docker-entrypoint.sh
COPY --from=frontend-build /frontend/dist /app/frontend/dist

EXPOSE 8000

ENTRYPOINT ["/app/backend/docker/docker-entrypoint.sh"]
CMD ["python", "-m", "divevault.app"]
