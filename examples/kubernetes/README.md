# DiveVault Kubernetes Example

This directory contains a baseline Kubernetes deployment for DiveVault with:

- a one-shot migration `Job`
- a `Deployment` with 3 backend replicas
- readiness/liveness probes on `/api/health`
- rolling update settings (`maxUnavailable: 0`)
- a `PodDisruptionBudget`

## How to use

1. Build and publish your image.
2. Update `ghcr.io/your-org/divevault:latest` in `divevault.yaml`.
3. Update Secret values in `divevault.yaml`.
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
