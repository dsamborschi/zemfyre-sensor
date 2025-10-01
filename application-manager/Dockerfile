# Multi-stage build for optimal image size

# ----------------------
# Build stage
# ----------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ bash

# Copy package files
COPY package*.json ./ 
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ----------------------
# Production stage
# ----------------------
FROM node:20-alpine

WORKDIR /app

# Install runtime build dependencies temporarily (needed for sqlite3)
RUN apk add --no-cache python3 make g++ bash

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Remove build tools to keep image small
RUN apk del python3 make g++ bash

# Start the API server
CMD ["npm", "run", "start:docker"]
