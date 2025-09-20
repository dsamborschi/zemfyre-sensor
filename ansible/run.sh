#!/bin/bash
# Run this from the project root: ./ansible/run.sh
# This script builds the Ansible Docker image and runs the playbook
set -e

IMAGE_NAME=ansible-deploy
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if .env.pi exists
if [ ! -f "$SCRIPT_DIR/.env.pi" ]; then
    echo "ERROR: .env.pi file not found!"
    echo "Please copy .env.pi.example to .env.pi and update with your values:"
    echo "  cp ansible/.env.pi.example ansible/.env.pi"
    echo "  # Edit ansible/.env.pi with your actual configuration"
    exit 1
fi

# Build the Docker image (if not already built)
docker build -t $IMAGE_NAME "$SCRIPT_DIR"

# Run the playbook inside the container, mounting the project root
# Pass any extra args to ansible playbook (e.g., -i hosts.ini)
docker run --rm -it \
  --env-file "$SCRIPT_DIR/.env.pi" \
  -e ANSIBLE_HOST_KEY_CHECKING=False \
  -v "$PROJECT_ROOT:/workspace" \
  $IMAGE_NAME \
  ansible-playbook -i /workspace/ansible/hosts.ini /workspace/ansible/deploy.yml "$@"
