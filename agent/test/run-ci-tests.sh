#!/bin/bash
# CI Test Runner - Starts services and runs tests
# This script is meant to be run inside the Docker container

set -e

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================"
echo "CI Test Runner"
echo "======================================${NC}"

# Start cloud server in background
echo -e "${BLUE}🚀 Starting cloud server...${NC}"
npm run start:cloud > /tmp/cloud-server.log 2>&1 &
CLOUD_PID=$!

# Wait for cloud server
echo -e "${BLUE}⏳ Waiting for cloud server (port 3002)...${NC}"
for i in {1..30}; do
    if curl -fs http://localhost:3002/ >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Cloud server is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Cloud server failed to start${NC}"
        echo "Cloud server logs:"
        cat /tmp/cloud-server.log
        kill $CLOUD_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Start device agent in background
echo -e "${BLUE}🚀 Starting device agent...${NC}"
npm run start:device > /tmp/device-agent.log 2>&1 &
DEVICE_PID=$!

# Wait for device API
echo -e "${BLUE}⏳ Waiting for device API (port 48484)...${NC}"
for i in {1..30}; do
    if curl -fs http://localhost:48484/ping >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Device API is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Device API failed to start${NC}"
        echo "Device agent logs:"
        cat /tmp/device-agent.log
        kill $CLOUD_PID $DEVICE_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Give services a moment to stabilize
sleep 2

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
bash /app/test/device-api.sh
TEST_EXIT=$?

# Cleanup
echo -e "${BLUE}🛑 Stopping services...${NC}"
kill $DEVICE_PID $CLOUD_PID 2>/dev/null || true
sleep 2

# Exit with test result
if [ $TEST_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed with exit code $TEST_EXIT${NC}"
fi

exit $TEST_EXIT
