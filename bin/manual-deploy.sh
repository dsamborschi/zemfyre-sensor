#!/bin/bash
# Manual deployment script to rebuild and restart services on the Pi
# Run this from project root: ./bin/manual-deploy.sh

set -e

REPO_DIR="/home/zemfyre/iotistic"
PI_IP="10.0.0.198"
PI_USER="zemfyre"

echo "Deploying to $PI_USER@$PI_IP:$REPO_DIR"

# SSH into Pi, pull latest code, and restart services
ssh -o StrictHostKeyChecking=accept-new $PI_USER@$PI_IP << 'EOF'
    set -e
    repo_dir="/home/zemfyre/iotistic"
    
    echo "Pulling latest code..."
    cd "$repo_dir"
    git pull origin master
    
    echo "Stopping and removing old containers..."
    docker compose -f docker-compose.yml down || true
    
    echo "Building and starting services..."
    docker compose -f docker-compose.yml up -d --build
    
    echo "Waiting for services to stabilize..."
    sleep 5
    
    echo "Checking service status..."
    docker compose -f docker-compose.yml ps
    
    echo "API container logs (last 20 lines):"
    docker logs zemfyre-api 2>&1 | tail -20 || echo "API not yet ready"
    
    echo "Deployment complete!"
EOF

echo "Remote deployment finished!"
