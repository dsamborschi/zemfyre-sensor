FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY index.js ./

# Run as non-root user
USER node

# Expose metrics port
EXPOSE 9234

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9234/health || exit 1

CMD ["node", "index.js"]
