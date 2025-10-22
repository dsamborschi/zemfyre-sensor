# Billing - Production Deployment

FROM node:18-alpine

WORKDIR /app

# Install PostgreSQL client for migrations
RUN apk add --no-cache postgresql-client

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built TypeScript
COPY dist ./dist

# Copy migrations
COPY migrations ./migrations

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create keys directory (volume will be mounted here)
RUN mkdir -p /app/keys

# Environment
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
