# Iotistic Admin - Multi-stage Docker Build
# Stage 1: Build the Vue application
FROM node:20-alpine AS builder

# Enable Corepack for Yarn 4.x support
RUN corepack enable && corepack prepare yarn@4.9.2 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --immutable

# Copy source code
COPY . .

# Build the application
RUN yarn build:ci

# Stage 2: Serve with Nginx
FROM nginx:alpine

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
