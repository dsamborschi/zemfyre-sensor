# Use slim Debian base
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app
COPY package*.json ./

# Install production dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Remove build tools to shrink image
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Create data directory and declare volume
RUN mkdir -p /app/data
VOLUME ["/app/data"]


CMD ["npm", "run", "start:docker"]
