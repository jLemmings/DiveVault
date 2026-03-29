FROM node:24.14.1-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY divevault ./divevault
COPY migrations ./migrations
COPY docker/docker-entrypoint.sh ./docker/docker-entrypoint.sh
RUN chmod +x /app/docker/docker-entrypoint.sh
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 8000

ENTRYPOINT ["/app/docker/docker-entrypoint.sh"]
CMD ["python", "-m", "divevault.app"]
