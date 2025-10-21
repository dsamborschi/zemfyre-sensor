# Billing - Production Deployment

FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built TypeScript
COPY dist ./dist

# Copy migrations
COPY migrations ./migrations

# Create keys directory (volume will be mounted here)
RUN mkdir -p /app/keys

# Environment
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

CMD ["node", "dist/index.js"]
