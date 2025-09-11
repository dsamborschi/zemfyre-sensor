FROM python:3.12-slim-bookworm

# Upgrade system packages to address vulnerabilities
RUN apt-get update && apt-get upgrade -y

# Install Ansible, sshpass, SSH client, and Git
RUN apt-get install -y \
    sshpass \
    openssh-client \
    git \
 && pip install --no-cache-dir ansible \
 && ansible-galaxy collection install community.docker \
 && apt-get update && apt-get upgrade -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace