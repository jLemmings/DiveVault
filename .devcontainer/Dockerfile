FROM golang:1.24-bookworm AS go

FROM mcr.microsoft.com/devcontainers/javascript-node:5-24-bookworm

COPY --from=go /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
