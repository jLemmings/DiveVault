# DiveVault Kubernetes Example

This directory contains a baseline Kubernetes deployment for DiveVault with:

- a one-shot migration `Job`
- a `Deployment` with 3 backend replicas
- readiness/liveness probes on `/api/health`
- rolling update settings (`maxUnavailable: 0`)
- a `PodDisruptionBudget`

## How to use

1. Build and publish your image.
2. Update `ghcr.io/your-org/divevault:0.4.0` in `divevault.yaml` to your registry and a pinned release tag or digest.
3. Update Secret values in `divevault.yaml`. `AUTH_JWT_SECRET` must be at least 32 random characters (`openssl rand -base64 48`); the backend refuses to start otherwise.
4. Run migrations first:

```bash
kubectl apply -f examples/kubernetes/divevault.yaml
kubectl wait --for=condition=complete job/divevault-db-migrate --timeout=180s
```

5. Deploy backend:

```bash
kubectl rollout status deployment/divevault-backend
```

The backend uses `STARTUP_MIGRATIONS=disabled` and expects the migration Job to have already completed.
The migration Job and backend Deployment both run the Go backend binary from the published image.

## Security notes

- Pods run as a non-root user with a read-only root filesystem and all Linux capabilities dropped. The image is distroless, so `kubectl exec` has no shell.
- The `preStop` sleep hook uses the native `sleep` action (Kubernetes 1.30+).
- Rate limits are kept in memory per pod; scale the per-window values with the replica count, or enforce limits at the ingress.
- Set `TRUST_FORWARDED_HEADERS=true` only when every request passes through your ingress, and set `TRUSTED_PROXY_HOPS` to the number of proxies that append to `X-Forwarded-For`.
