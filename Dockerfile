# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:26.13.1-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build:app

FROM --platform=$BUILDPLATFORM golang:1.27.4-bookworm AS backend-build

ARG TARGETOS=linux
ARG TARGETARCH=amd64

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/divevault ./cmd/divevault

# Static, shell-less runtime image that runs as an unprivileged user.
FROM gcr.io/distroless/static-debian13:nonroot

WORKDIR /app

COPY --from=backend-build /out/divevault /app/divevault
COPY --from=frontend-build /frontend/dist /app/frontend/dist

ENV FRONTEND_DIR=/app/frontend/dist \
    LOG_FORMAT=json

USER nonroot:nonroot

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/app/divevault", "healthcheck"]

CMD ["/app/divevault"]
