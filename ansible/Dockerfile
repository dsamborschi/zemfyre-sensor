# Ansible Dockerfile for Raspberry Pi deployment
FROM python:3.12-slim

# Upgrade system packages to address vulnerabilities
RUN apt-get update && apt-get upgrade -y

# Install Ansible, sshpass, SSH client, and Git
RUN apt-get install -y \
    sshpass \
    openssh-client \
    git \
 && pip install --no-cache-dir ansible \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace