#!/bin/bash

# Script to clone repo, check/install Docker, and run docker-compose

REPO_URL="https://github.com/your-username/your-repo.git"
REPO_DIR="zemfyre-sensor"

# Clone the repository if not already present
if [ ! -d "$REPO_DIR" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL"
else
    echo "Repository already exists."
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
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose not found. Installing docker-compose..."
    sudo apt-get update
    sudo apt-get install -y docker-compose
else
    echo "docker-compose is already installed."
fi

# Run docker-compose
sudo docker-compose up -d
