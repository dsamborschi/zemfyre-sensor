# Billing - Production Deployment

FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash \
    ca-certificates

# Install kubectl
RUN curl -LO "https://dl.k8s.io/release/v1.28.0/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/kubectl

# Install Helm
RUN curl -fsSL https://get.helm.sh/helm-v3.13.0-linux-amd64.tar.gz -o helm.tar.gz \
    && tar -zxvf helm.tar.gz \
    && mv linux-amd64/helm /usr/local/bin/helm \
    && rm -rf helm.tar.gz linux-amd64

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
