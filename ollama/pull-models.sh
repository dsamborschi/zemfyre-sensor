#!/bin/bash
# Script to pull Ollama models after container starts

echo "Waiting for Ollama to start..."
sleep 10

echo "Pulling llama3.1 model (recommended)..."
docker exec ollama ollama pull llama3.1

echo "Models pulled successfully!"
echo "You can now use Ollama at http://localhost:11434"
echo "Web UI available at http://localhost:3005"
