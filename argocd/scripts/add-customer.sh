#!/bin/bash
# Add new customer to ArgoCD GitOps

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 3 ]; then
    echo -e "${RED}Usage: $0 <customer-id> <customer-name> <plan>${NC}"
    echo "Example: $0 abc12345 'Acme Corp' professional"
    echo ""
    echo "Plans: starter, professional, enterprise"
    exit 1
fi

CUSTOMER_ID=$1
CUSTOMER_NAME=$2
PLAN=$3
NAMESPACE="customer-${CUSTOMER_ID}"
HOSTNAME="${CUSTOMER_ID}.iotistic.cloud"

echo -e "${GREEN}🚀 Adding new customer to ArgoCD${NC}"
echo "Customer ID: ${CUSTOMER_ID}"
echo "Customer Name: ${CUSTOMER_NAME}"
echo "Plan: ${PLAN}"
echo "Namespace: ${NAMESPACE}"
echo "Hostname: ${HOSTNAME}"
echo ""

# Set resources based on plan
case $PLAN in
    starter)
        API_CPU_REQ="100m"
        API_MEM_REQ="256Mi"
        API_CPU_LIM="500m"
        API_MEM_LIM="512Mi"
        PG_SIZE="10Gi"
        MQTT_SIZE="1Gi"
        MONITORING_DEDICATED="false"
        ;;
    professional)
        API_CPU_REQ="200m"
        API_MEM_REQ="512Mi"
        API_CPU_LIM="1000m"
        API_MEM_LIM="1Gi"
        PG_SIZE="20Gi"
        MQTT_SIZE="2Gi"
        MONITORING_DEDICATED="false"
        ;;
    enterprise)
        API_CPU_REQ="500m"
        API_MEM_REQ="1Gi"
        API_CPU_LIM="2000m"
        API_MEM_LIM="2Gi"
        PG_SIZE="50Gi"
        MQTT_SIZE="5Gi"
        MONITORING_DEDICATED="true"
        ;;
    *)
        echo -e "${RED}Invalid plan: ${PLAN}${NC}"
        echo "Valid plans: starter, professional, enterprise"
        exit 1
        ;;
esac

# Create customer ArgoCD Application manifest
CUSTOMER_FILE="argocd/customers/customer-${CUSTOMER_ID}.yaml"

cat > "${CUSTOMER_FILE}" <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: customer-${CUSTOMER_ID}
  namespace: argocd
  labels:
    customer-id: "${CUSTOMER_ID}"
    plan: "${PLAN}"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: iotistic-customers
  
  source:
    repoURL: https://github.com/dsamborschi/zemfyre-sensor
    targetRevision: HEAD
    path: charts/customer-instance
    
    helm:
      # Use shared image versions (updated by CI/CD for all customers)
      valueFiles:
        - ../../argocd/shared/image-versions.yaml
        - ../../argocd/shared/common-values.yaml
      
      # Customer-specific configuration
      values: |
        customerId: "${CUSTOMER_ID}"
        customerName: "${CUSTOMER_NAME}"
        
        # Namespace
        namespace: ${NAMESPACE}
        
        # Ingress configuration
        ingress:
          host: ${HOSTNAME}
        
        # License (TODO: Replace with actual license from billing service)
        licenseKey: "PLACEHOLDER_LICENSE_KEY"
        
        # ${PLAN^} plan configuration
        monitoring:
          enabled: true
          serviceMonitor:
            enabled: true
            namespace: monitoring
          dedicatedPrometheus: ${MONITORING_DEDICATED}
        
        # ${PLAN^} plan resources
        resources:
          api:
            requests:
              cpu: ${API_CPU_REQ}
              memory: ${API_MEM_REQ}
            limits:
              cpu: ${API_CPU_LIM}
              memory: ${API_MEM_LIM}
        
        # Storage
        persistence:
          postgres:
            size: ${PG_SIZE}
          mosquitto:
            size: ${MQTT_SIZE}
  
  destination:
    server: https://kubernetes.default.svc
    namespace: ${NAMESPACE}
  
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
EOF

echo -e "${GREEN}✅ Created ArgoCD Application: ${CUSTOMER_FILE}${NC}"
echo ""

# Commit and push
echo -e "${YELLOW}📝 Committing changes...${NC}"
git add "${CUSTOMER_FILE}"
git commit -m "feat: add customer ${CUSTOMER_ID} (${CUSTOMER_NAME}) - ${PLAN} plan

Customer will be automatically deployed by ArgoCD"

echo ""
echo -e "${GREEN}✅ Changes committed${NC}"
echo ""
echo -e "${YELLOW}🚀 Push to deploy:${NC}"
echo "   git push"
echo ""
echo -e "${YELLOW}📊 Monitor deployment:${NC}"
echo "   argocd app get customer-${CUSTOMER_ID}"
echo "   argocd app sync customer-${CUSTOMER_ID}"
echo "   kubectl get pods -n ${NAMESPACE}"
echo ""
echo -e "${YELLOW}⚠️  TODO:${NC}"
echo "   1. Update licenseKey in ${CUSTOMER_FILE}"
echo "   2. Configure DNS for ${HOSTNAME}"
echo "   3. Verify ingress certificate"
