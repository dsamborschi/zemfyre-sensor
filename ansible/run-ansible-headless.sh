#!/bin/bash
# Run this from the project root: ./ansible/run-ansible.sh
# This script builds the Ansible Docker image and runs the playbook
set -e

IMAGE_NAME=ansible-raspi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Build the Docker image (if not already built)
docker build -t $IMAGE_NAME "$SCRIPT_DIR"

# Run the playbook inside the container, mounting the project root
# Pass any extra args to ansible-playbook (e.g., -i hosts.ini)
docker run --rm -it \
  --env-file .env \
  -e ANSIBLE_HOST_KEY_CHECKING=False \
  -v "$PROJECT_ROOT:/workspace" \
  $IMAGE_NAME \
  ansible-playbook -i /workspace/ansible/hosts.ini /workspace/ansible/deploy-raspberrypi-headless.yml "$@"
