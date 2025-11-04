#!/bin/bash
set -e

# Deploy Iotistic VPN Server to Kubernetes
# This script deploys the complete VPN infrastructure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPN_ROOT="$(dirname "$SCRIPT_DIR")"
NAMESPACE="iotistic-vpn"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              Iotistic VPN Server Deployment              ║"
    echo "║                                                           ║"
    echo "║  This script will deploy the VPN server infrastructure   ║"
    echo "║  to your Kubernetes cluster.                             ║"
    echo "║                                                           ║"
    echo "║  Components to be deployed:                               ║"
    echo "║  • VPN Server (OpenVPN + API)                             ║"
    echo "║  • PostgreSQL Database                                    ║"
    echo "║  • Redis Cache                                            ║"
    echo "║  • LoadBalancer Service                                   ║"
    echo "║  • ConfigMaps and Secrets                                 ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl not found. Please install kubectl first."
        exit 1
    fi
    
    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    
    # Check if docker is available for building
    if ! command -v docker &> /dev/null; then
        warn "Docker not found. You'll need to build and push the image manually."
    fi
    
    success "Prerequisites checked"
}

create_namespace() {
    log "Creating namespace '$NAMESPACE'..."
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        warn "Namespace '$NAMESPACE' already exists"
    else
        kubectl create namespace "$NAMESPACE"
        kubectl label namespace "$NAMESPACE" managed-by=iotistic
        success "Namespace '$NAMESPACE' created"
    fi
}

build_and_push_image() {
    local image_tag="${1:-latest}"
    local registry="${2:-iotistic}"
    
    log "Building VPN server Docker image..."
    
    cd "$VPN_ROOT"
    
    # Build TypeScript
    if [ -f "package.json" ]; then
        log "Installing dependencies and building TypeScript..."
        npm ci
        npm run build
    fi
    
    # Build Docker image
    docker build -t "$registry/vpn-server:$image_tag" .
    
    # Push to registry (if not local)
    if [ "$registry" != "local" ]; then
        log "Pushing image to registry..."
        docker push "$registry/vpn-server:$image_tag"
    fi
    
    success "Docker image built and pushed"
}

deploy_database() {
    log "Deploying PostgreSQL database..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: $NAMESPACE
  labels:
    app: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_DB
          value: iotistic_vpn
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          value: password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-data
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: $NAMESPACE
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: $NAMESPACE
spec:
  ports:
  - port: 5432
  selector:
    app: postgres
EOF
    
    success "PostgreSQL deployed"
}

deploy_redis() {
    log "Deploying Redis cache..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: $NAMESPACE
  labels:
    app: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        command: ["redis-server", "--appendonly", "yes"]
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: $NAMESPACE
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: $NAMESPACE
spec:
  ports:
  - port: 6379
  selector:
    app: redis
EOF
    
    success "Redis deployed"
}

deploy_vpn_server() {
    log "Deploying VPN server..."
    
    # Apply all VPN server manifests
    kubectl apply -f "$VPN_ROOT/k8s/"
    
    success "VPN server deployed"
}

wait_for_deployment() {
    local deployment="$1"
    local timeout="${2:-300}"
    
    log "Waiting for deployment '$deployment' to be ready..."
    
    if kubectl wait --for=condition=available --timeout="${timeout}s" deployment/"$deployment" -n "$NAMESPACE"; then
        success "Deployment '$deployment' is ready"
    else
        error "Deployment '$deployment' failed to become ready within ${timeout}s"
        return 1
    fi
}

setup_load_balancer() {
    log "Setting up load balancer..."
    
    # Get the external IP
    local external_ip=""
    local max_attempts=30
    local attempt=0
    
    while [ -z "$external_ip" ] && [ $attempt -lt $max_attempts ]; do
        external_ip=$(kubectl get service vpn-server -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        if [ -z "$external_ip" ]; then
            external_ip=$(kubectl get service vpn-server -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
        fi
        
        if [ -z "$external_ip" ]; then
            log "Waiting for load balancer IP... (attempt $((attempt + 1))/$max_attempts)"
            sleep 10
            ((attempt++))
        fi
    done
    
    if [ -n "$external_ip" ]; then
        success "Load balancer ready at: $external_ip"
        echo "VPN Server: $external_ip:1194"
        echo "API Server: $external_ip:3200"
    else
        warn "Load balancer IP not available. Check your cloud provider configuration."
    fi
}

run_tests() {
    log "Running deployment tests..."
    
    # Test API health endpoint
    local api_pod=$(kubectl get pods -n "$NAMESPACE" -l app=vpn-server -o jsonpath='{.items[0].metadata.name}')
    
    if [ -n "$api_pod" ]; then
        log "Testing API health endpoint..."
        if kubectl exec -n "$NAMESPACE" "$api_pod" -- curl -f http://localhost:3200/health &>/dev/null; then
            success "API health check passed"
        else
            warn "API health check failed"
        fi
    fi
    
    # Check OpenVPN process
    if kubectl exec -n "$NAMESPACE" "$api_pod" -- pgrep openvpn &>/dev/null; then
        success "OpenVPN process is running"
    else
        warn "OpenVPN process not found"
    fi
}

print_completion() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                 Deployment Complete!                     ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Services:"
    kubectl get services -n "$NAMESPACE"
    echo ""
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Initialize PKI: kubectl exec -it deployment/vpn-server -n $NAMESPACE -- /etc/openvpn/scripts/init-pki.sh"
    echo "2. Generate client certificate: kubectl exec -it deployment/vpn-server -n $NAMESPACE -- /etc/openvpn/scripts/generate-client.sh device-001 customer-abc"
    echo "3. Access API: kubectl port-forward service/vpn-api 3200:3200 -n $NAMESPACE"
    echo "4. View logs: kubectl logs -f deployment/vpn-server -n $NAMESPACE"
    echo ""
    echo -e "${YELLOW}Documentation:${NC}"
    echo "- API Docs: http://localhost:3200/docs (when port-forwarded)"
    echo "- Management: http://localhost:7505 (OpenVPN management interface)"
}

# Main execution
main() {
    local image_tag="${1:-latest}"
    local registry="${2:-iotistic}"
    local skip_build="${3:-false}"
    
    print_banner
    check_prerequisites
    create_namespace
    
    if [ "$skip_build" != "true" ]; then
        build_and_push_image "$image_tag" "$registry"
    fi
    
    deploy_database
    deploy_redis
    deploy_vpn_server
    
    wait_for_deployment "postgres"
    wait_for_deployment "redis"
    wait_for_deployment "vpn-server"
    
    setup_load_balancer
    run_tests
    print_completion
}

# Parse command line arguments
case "$1" in
    "help"|"-h"|"--help")
        echo "Usage: $0 [image-tag] [registry] [skip-build]"
        echo ""
        echo "Arguments:"
        echo "  image-tag   Docker image tag (default: latest)"
        echo "  registry    Docker registry (default: iotistic)"
        echo "  skip-build  Skip building image (true/false, default: false)"
        echo ""
        echo "Examples:"
        echo "  $0                    # Deploy with default settings"
        echo "  $0 v1.0.0            # Deploy with specific tag"
        echo "  $0 latest local true # Deploy with local image, skip build"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac