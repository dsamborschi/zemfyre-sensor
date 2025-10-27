# ArgoCD GitOps Configuration

GitOps configuration for deploying and managing Iotistic customer instances using ArgoCD.

## Architecture

- **App of Apps Pattern**: Root application manages all customer instances
- **Centralized Image Tags**: All customers share the same image versions
- **Automated Updates**: GitHub Actions updates image tags, ArgoCD syncs all customers

## Structure

```
argocd/
├── root-app.yaml                    # Root ArgoCD Application (App of Apps)
├── customers/                       # Customer-specific overrides
│   ├── customer-7f05d0d2.yaml      # Customer instance config
│   └── customer-abc12345.yaml      # Another customer
└── shared/
    ├── image-versions.yaml         # Centralized image tags (updated by CI/CD)
    └── common-values.yaml          # Shared configuration
```

## Workflow

1. **Push code** → GitHub Actions builds images with version tags
2. **Update tags** → CI/CD updates `shared/image-versions.yaml`
3. **Commit & push** → Changes pushed to git
4. **ArgoCD syncs** → All customer instances updated automatically

## Quick Start

### 1. Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Access ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 2. Deploy Root Application

```bash
kubectl apply -f argocd/root-app.yaml
```

This will automatically deploy all customer instances defined in `argocd/customers/`.

### 3. Add New Customer

```bash
# Create customer instance file
cat > argocd/customers/customer-new123.yaml <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: customer-new123
  namespace: argocd
spec:
  project: iotistic-customers
  source:
    repoURL: https://github.com/dsamborschi/zemfyre-sensor
    targetRevision: HEAD
    path: charts/customer-instance
    helm:
      valueFiles:
        - ../../argocd/shared/image-versions.yaml
        - ../../argocd/shared/common-values.yaml
      values: |
        customerId: new123
        namespace: customer-new123
        ingress:
          host: new123.iotistic.cloud
        licenseKey: "eyJhbGc..."
  destination:
    server: https://kubernetes.default.svc
    namespace: customer-new123
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF

# Commit and push - ArgoCD will deploy automatically
git add argocd/customers/customer-new123.yaml
git commit -m "Add customer new123"
git push
```

### 4. Update All Customers

Images are centralized in `shared/image-versions.yaml`. Update once, all customers get new version:

```bash
# Manually update
vim argocd/shared/image-versions.yaml
git add argocd/shared/image-versions.yaml
git commit -m "Update API to v1.2.3"
git push

# Or let CI/CD do it automatically
```

## Image Update Process

### Automatic (via GitHub Actions)

Push to master → CI builds images → Updates `image-versions.yaml` → ArgoCD syncs all customers

### Manual

```bash
# Update versions
yq eval '.api.image.tag = "v1.2.3"' -i argocd/shared/image-versions.yaml
yq eval '.dashboard.image.tag = "v1.2.3"' -i argocd/shared/image-versions.yaml

# Commit and push
git add argocd/shared/image-versions.yaml
git commit -m "chore: update images to v1.2.3"
git push
```

## Monitoring

```bash
# List all applications
argocd app list

# Check sync status
argocd app get customer-7f05d0d2

# Force sync all customers
argocd app sync -l app.kubernetes.io/instance=iotistic-customers

# View logs
argocd app logs customer-7f05d0d2 --follow
```

## Per-Customer Overrides

If a customer needs a specific configuration or image version:

```yaml
# argocd/customers/customer-special.yaml
spec:
  source:
    helm:
      valueFiles:
        - ../../argocd/shared/image-versions.yaml  # Still use shared versions
      values: |
        # Override for this customer only
        api:
          image:
            tag: v1.1.0  # Pin to older version
        resources:
          limits:
            cpu: 4000m   # More resources
```

## Rollback

```bash
# Rollback specific customer
argocd app rollback customer-7f05d0d2

# Rollback all customers (revert git commit)
git revert HEAD
git push
```

## Security

- ArgoCD runs in `argocd` namespace
- Each customer instance runs in isolated namespace
- Image pull secrets managed per-customer
- License keys stored in customer-specific values

## Troubleshooting

### Application not syncing
```bash
argocd app get customer-7f05d0d2
argocd app diff customer-7f05d0d2
```

### Image pull errors
```bash
kubectl get events -n customer-7f05d0d2 --sort-by='.lastTimestamp'
kubectl describe pod -n customer-7f05d0d2 <pod-name>
```

### Sync stuck
```bash
argocd app sync customer-7f05d0d2 --force
```
