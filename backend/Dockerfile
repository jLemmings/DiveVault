FROM node:24.19.0-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build:app

FROM golang:1.24-bookworm AS backend-build

WORKDIR /src/backend-go

COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

COPY backend-go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/divevault ./cmd/divevault

FROM debian:13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-build /out/divevault /app/divevault
COPY --from=frontend-build /frontend/dist /app/frontend/dist

ENV FRONTEND_DIR=/app/frontend/dist

EXPOSE 8000

CMD ["/app/divevault"]
