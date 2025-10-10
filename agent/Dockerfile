# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native deps and update npm to latest
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@latest

COPY package*.json tsconfig.json ./

# Install all deps (including dev)
RUN npm ci

COPY src ./src

# Build TypeScript and copy migrations
RUN npm run build

# ---- Production stage ------
FROM node:20-slim AS runtime

WORKDIR /app

COPY package*.json package-lock.json ./


# Install only production deps, then remove build tools in same layer
RUN apt-get update \
    && apt-get install -y python3 make g++ curl jq procps \
    && npm install -g npm@latest \
    && npm ci --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /app/dist ./dist

# Data volume
RUN mkdir -p /app/data
VOLUME ["/app/data"]


EXPOSE 3002

CMD ["npm", "run", "start:device"]
