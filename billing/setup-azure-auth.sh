#!/bin/bash
# Setup Azure Service Principal for Billing Service K8s Access

echo "🔐 Creating Service Principal for Billing Service..."

# Create service principal
SP=$(az ad sp create-for-rbac --name "iotistic-billing-k8s" --skip-assignment --output json)

APP_ID=$(echo $SP | jq -r '.appId')
PASSWORD=$(echo $SP | jq -r '.password')
TENANT_ID=$(echo $SP | jq -r '.tenant')

echo "✅ Service Principal created:"
echo "   APP_ID: $APP_ID"
echo "   TENANT_ID: $TENANT_ID"

# Get AKS resource ID
RESOURCE_GROUP="node-red-demo-aks-rg"
CLUSTER_NAME="aks-demo"

echo ""
echo "📋 Getting AKS cluster info..."
CLUSTER_ID=$(az aks show --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME --query id -o tsv)

# Grant permissions to AKS cluster
echo ""
echo "🔑 Granting AKS permissions to Service Principal..."
az role assignment create \
  --assignee $APP_ID \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --scope $CLUSTER_ID

echo ""
echo "✅ Setup complete! Add these to your .env file:"
echo ""
echo "AZURE_TENANT_ID=$TENANT_ID"
echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_CLIENT_SECRET=$PASSWORD"
echo "AKS_RESOURCE_GROUP=$RESOURCE_GROUP"
echo "AKS_CLUSTER_NAME=$CLUSTER_NAME"
