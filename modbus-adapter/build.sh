#!/bin/bash

# Build script for Modbus Adapter

set -e

echo "🔨 Building Modbus Adapter..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Type check
echo "🔍 Type checking..."
npx tsc --noEmit

# Build
echo "🏗️  Building TypeScript..."
npm run build

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p dist/config
mkdir -p sockets

# Copy configuration files
echo "📄 Copying configuration files..."
cp config/*.json dist/config/ 2>/dev/null || echo "No config files to copy"

# Make executable
echo "🔧 Making executable..."
chmod +x dist/index.js

echo "✅ Build complete!"
echo ""
echo "📋 Usage:"
echo "  node dist/index.js --example-config config.json"
echo "  node dist/index.js --config config.json"
echo ""
echo "🐳 Docker build:"
echo "  docker build -t modbus-adapter ."
echo "  docker run -v ./config:/app/config modbus-adapter"