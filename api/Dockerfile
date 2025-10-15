FROM node:20

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Install system dependencies
RUN apt-get update && apt-get install -y libnotify-bin

EXPOSE 3002

# Run node directly to avoid npm output buffering
CMD ["node", "dist/index.js"]
