#!/bin/sh
set -e

# Extract API endpoint from environment (default to localhost:4002)
API_HOST="${CLOUD_API_ENDPOINT:-http://localhost:4002}"

echo "Waiting for API to be healthy at ${API_HOST}..."

# Wait for API health check with timeout
MAX_RETRIES=30
RETRY_INTERVAL=2
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s "${API_HOST}/health" > /dev/null 2>&1; then
        echo "API is healthy!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for API... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep $RETRY_INTERVAL
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: API health check timed out after ${MAX_RETRIES} attempts"
    echo "Starting agent anyway..."
fi

# Execute the main command
exec "$@"
