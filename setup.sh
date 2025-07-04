#!/bin/bash

# Script to clone or update repo, check/install Docker, and run docker-compose
GRAFANA_DATA_PATH="/home/zemfyre/zemfyre-sensor/grafana/data"
REPO_URL="https://github.com/dsamborschi/zemfyre-sensor.git"
REPO_DIR="zemfyre-sensor"

# Clone or update the repository
# if [ ! -d "$REPO_DIR/.git" ]; then
#     echo "Cloning repository..."
#     git clone "$REPO_URL"
# else
#     echo "Repository already exists. Overwriting with latest changes from remote..."
#     cd "$REPO_DIR" || exit 1
#     git fetch origin
#     git reset --hard origin/master
#     cd ..
# fi

# Ensure the repo directory exists
if [ ! -d "$REPO_DIR" ]; then
    echo "Creating $REPO_DIR directory..."
    mkdir -p "$REPO_DIR"
fi

cd "$REPO_DIR" || exit 1

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    # Install Docker (Ubuntu/Debian)
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Please log out and log back in for group changes to take effect."
else
    echo "Docker is already installed."
fi

# Check if docker-compose is installed
if ! docker compose version &> /dev/null; then
    echo "Docker Compose plugin not found. You may need to install it manually or check Docker installation."
else
    echo "Docker Compose is already installed."
fi

# Run docker-compose
sudo docker compose up -d --build > /dev/null

echo "Fixing ownership to UID 472 (Grafana container user)..."
# GRAFANA_UID=$(docker run --rm grafana/grafana-oss id -u grafana)
sudo chown -R 472:0 ./grafana/data

echo "Setting directory permissions to 775 (read/write/execute for owner and group)..."
sudo chmod -R 775 "$GRAFANA_DATA_PATH"


