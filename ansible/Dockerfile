FROM python:3.12

# Upgrade system packages to address vulnerabilities
RUN apt-get update && apt-get upgrade -y

# Install Ansible, sshpass, SSH client, and Git
RUN apt-get install -y \
    sshpass \
    openssh-client \
    git \
 && pip install --no-cache-dir ansible \
 && ansible-galaxy collection install community.docker \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace