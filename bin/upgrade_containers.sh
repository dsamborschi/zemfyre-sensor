#!/bin/bash -e

# vim: tabstop=4 shiftwidth=4 softtabstop=4
# -*- sh-basic-offset: 4 -*-

# Export various environment variables
export MY_IP=$(ip -4 route get 8.8.8.8 | awk {'print $7'} | tr -d '\n')
GIT_BRANCH="${GIT_BRANCH:-master}"

MODE="${MODE:-pull}"
if [[ ! "$MODE" =~ ^(pull|build)$ ]]; then
    echo "Invalid mode: $MODE"
    echo "Usage: MODE=(pull|build) $0"
    exit 1
fi

if [ -z "$DOCKER_TAG" ]; then
    export DOCKER_TAG="latest"
fi

cat /home/${USER}/iotistic/docker-compose.yml.tmpl \
    | envsubst \
    > /home/${USER}/iotistic/docker-compose.yml

if [[ "$DEVICE_TYPE" =~ ^(x86|pi5)$ ]]; then
    sed -i '/devices:/ {N; /\n.*\/dev\/vchiq:\/dev\/vchiq/d}' \
        /home/${USER}/iotistic/docker-compose.yml
fi

echo "=================================================="
echo "🔄 Upgrading Docker Containers"
echo "=================================================="
echo "Mode:        $MODE"
echo "Docker Tag:  $DOCKER_TAG"
echo "Device Type: $DEVICE_TYPE"
echo "Git Branch:  $GIT_BRANCH"
echo "User:        $USER"
echo "=================================================="
echo ""
echo "📄 Generated docker-compose.yml:"
echo "=================================================="
cat /home/${USER}/iotistic/docker-compose.yml
echo "=================================================="
echo ""

sudo -E docker compose \
    -f /home/${USER}/iotistic/docker-compose.yml \
    ${MODE}

if [ -f /var/run/reboot-required ]; then
    exit 0
fi

sudo -E docker compose \
    -f /home/${USER}/iotistic/docker-compose.yml \
    up -d