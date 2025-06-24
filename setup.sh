#!/bin/bash

# Script to clone or update repo, check/install Docker, and run docker-compose

REPO_URL="https://github.com/dsamborschi/zemfyre-sensor.git"
REPO_DIR="zemfyre-sensor"

# # Clone or update the repository
# if [ ! -d "$REPO_DIR/.git" ]; then
#     echo "Cloning repository..."
#     git clone "$REPO_URL"
# else
#     echo "Repository already exists. Pulling latest changes..."
#     cd "$REPO_DIR" || exit 1
#     git pull
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
    echo "Docker Compose plugin is available."
fi

# Run docker-compose
sudo docker compose up -d

# Health checks for all services
echo "\nWaiting for services to become healthy..."

# Mosquitto health check (TCP port)
MOSQUITTO_PORT=${MOSQUITTO_PORT_EXT:-1883}
for i in {1..20}; do
    if nc -z localhost "$MOSQUITTO_PORT"; then
        echo "Mosquitto is healthy on port $MOSQUITTO_PORT."
        break
    fi
    echo "Waiting for Mosquitto... ($i)"
    sleep 2
done

# Node-RED health check (HTTP)
NODERED_PORT=${NODERED_PORT_EXT:-51880}
for i in {1..20}; do
    if curl -sSf "http://localhost:$NODERED_PORT" > /dev/null; then
        echo "Node-RED is healthy on port $NODERED_PORT."
        break
    fi
    echo "Waiting for Node-RED... ($i)"
    sleep 2
done

# InfluxDB health check (HTTP)
INFLUXDB_PORT=${INFLUXDB_PORT_EXT:-58086}
for i in {1..20}; do
    if curl -sSf "http://localhost:$INFLUXDB_PORT/health" | grep -q '"status":"pass"'; then
        echo "InfluxDB is healthy on port $INFLUXDB_PORT."
        break
    fi
    echo "Waiting for InfluxDB... ($i)"
    sleep 2
done

# Grafana health check (HTTP)
GRAFANA_PORT=${GRAFANA_PORT_EXT:-53000}
for i in {1..20}; do
    if curl -sSf "http://localhost:$GRAFANA_PORT/login" | grep -q '<title>Grafana'; then
        echo "Grafana is healthy on port $GRAFANA_PORT."
        break
    fi
    echo "Waiting for Grafana... ($i)"
    sleep 2
done

echo "All health checks completed."
