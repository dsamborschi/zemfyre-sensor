FROM node:18-alpine

LABEL maintainer="Iotistic Sensor Team"
LABEL description="BME688 Sensor Simulator - Generates fake sensor data over Unix sockets"

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application
COPY simulator.js ./

# Create socket directory
RUN mkdir -p /tmp/sensors

# Expose volume for sockets
VOLUME ["/tmp/sensors"]

# Default environment variables (can be overridden in docker-compose)
ENV NUM_SENSORS=3
ENV SOCKET_DIR=/tmp/sensors
ENV PUBLISH_INTERVAL_MS=60000
ENV ENABLE_FAILURES=true
ENV FAILURE_CHANCE=0.05
ENV RECONNECT_DELAY_MS=10000
ENV DATA_FORMAT=json
ENV EOM_DELIMITER=\n
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD test -S /tmp/sensors/sensor1.sock || exit 1

# Run simulator
CMD ["node", "simulator.js"]
