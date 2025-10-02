# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native deps
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./

# Install all deps (including dev)
RUN npm ci

COPY src ./src
RUN npm run build

# Copy migration files (they're .js, not compfiled by TypeScript)
COPY src/migrations ./dist/migrations

# ---- Production stage ------
FROM node:20-slim AS runtime

WORKDIR /app

COPY package*.json package-lock.json ./

# Install only production deps, then remove build tools in same layer
RUN apt-get update \
    && apt-get install -y python3 make g++ curl jq \
    && npm ci --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /app/dist ./dist

# Data volume
RUN mkdir -p /app/data
VOLUME ["/app/data"]


EXPOSE 3002

CMD ["npm", "run", "start:docker"]
