# Iotistic Admin - Optimized Multi-stage Docker Build

# Stage 1: Build the Vue application
FROM node:20-bullseye-slim AS builder

# Use Yarn 1.x explicitly (avoid Yarn 4 download)
RUN corepack disable && npm install -g yarn@1.22.22

# Set working directory
WORKDIR /app

# Install dependencies needed for building (build tools, python, etc.)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files to leverage Docker cache  
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile 

# Copy rest of the source code
COPY . .

# Build the application
RUN yarn build:ci

# Stage 2: Serve with Nginx
FROM nginx:stable-bullseye

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]