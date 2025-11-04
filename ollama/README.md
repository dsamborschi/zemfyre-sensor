# Ollama Docker Setup

Run Ollama as a Docker container - perfect for your IoT platform!

## 🚀 Quick Start (3 commands)

### Step 1: Start Ollama Container
```powershell
cd ollama
docker-compose up -d
```

### Step 2: Pull a Model
```powershell
# Pull llama3.1 (recommended)
.\pull-models.ps1

# Or manually:
docker exec ollama ollama pull llama3.1
```

### Step 3: Test It
```powershell
# Test the API
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1",
  "prompt": "Why is the sky blue?",
  "stream": false
}'

# Or use the Web UI
# Open: http://localhost:3005
```

That's it! Your AI chat now works! 🎉

---

## 📦 What's Included:

### **1. Ollama Service** (Port 11434)
- Runs Ollama API
- Persists models in Docker volume
- Auto-restarts
- Uses ~8GB RAM for llama3.1

### **2. Web UI** (Port 3005) - Optional
- ChatGPT-like interface
- Test your models
- Manage conversations
- Not needed for your dashboard (just for testing)

---

## 🔧 Configuration

### Update Your API Environment:
```bash
# In api/.env or docker-compose.yml
OLLAMA_URL=http://localhost:11434  # Local dev
# or
OLLAMA_URL=http://ollama:11434     # If API is also in Docker
```

### For Docker Compose Stack:
If your API is in Docker, add to your main `docker-compose.yml`:

```yaml
services:
  api:
    # ... your existing API config
    environment:
      - OLLAMA_URL=http://ollama:11434  # Use container name
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
```

---

## 🎯 Available Models

### Recommended for Production:
```powershell
# Fast & Good Quality (8GB RAM)
docker exec ollama ollama pull llama3.1

# Smaller, Faster (6GB RAM)
docker exec ollama ollama pull mistral

# Larger, Better (48GB RAM - GPU recommended)
docker exec ollama ollama pull llama3.1:70b
```

### Check Downloaded Models:
```powershell
docker exec ollama ollama list
```

---

## 🖥️ GPU Support (Optional)

### For NVIDIA GPUs:

1. **Install NVIDIA Container Toolkit**
   ```powershell
   # Windows with WSL2
   wsl --install
   # Install NVIDIA Container Toolkit in WSL
   ```

2. **Uncomment GPU section in docker-compose.yml**
   ```yaml
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: 1
             capabilities: [gpu]
   ```

3. **Restart container**
   ```powershell
   docker-compose down
   docker-compose up -d
   ```

**Result**: 10x faster responses! 🚀

---

## 📊 Resource Usage

| Model | Size | RAM Needed | Speed (CPU) | Speed (GPU) |
|-------|------|------------|-------------|-------------|
| `llama3.1` | 4.7GB | 8GB | 2-5s | 0.5-1s |
| `mistral` | 4.1GB | 6GB | 2-4s | 0.5-1s |
| `llama3.1:70b` | 40GB | 48GB | 10-30s | 2-5s |

---

## 🔍 Troubleshooting

### Container won't start?
```powershell
# Check logs
docker logs ollama

# Check if port is in use
netstat -ano | findstr :11434
```

### Models not downloading?
```powershell
# Check disk space (models are 4-40GB each!)
docker system df

# Manually pull inside container
docker exec -it ollama bash
ollama pull llama3.1
```

### API connection errors?
```powershell
# Test if Ollama is running
curl http://localhost:11434/api/tags

# Check from another container
docker exec api curl http://ollama:11434/api/tags
```

### Slow responses?
- Use smaller model: `mistral`
- Add GPU support (see above)
- Close other applications
- Increase Docker memory limit

---

## 🌐 Multi-Tenant SaaS Deployment

### For Kubernetes:
Deploy one Ollama instance per customer namespace:

```yaml
# In charts/customer-instance/templates/ollama-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-ollama
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: ollama
        image: ollama/ollama:latest
        resources:
          requests:
            memory: "8Gi"
          limits:
            memory: "12Gi"
```

### Or: Shared Ollama Instance
Deploy once, all customers use it:
```yaml
# Global Ollama service
OLLAMA_URL=http://ollama.shared-services:11434
```

**Cost Savings**: One 48GB GPU instance can serve 50+ customers! 💰

---

## 🆚 Docker vs Native Install

| Feature | Docker | Native |
|---------|--------|--------|
| **Setup** | 3 commands | 2 commands |
| **Isolation** | ✅ Container | ❌ System-wide |
| **Portability** | ✅ Works anywhere | ❌ OS-specific |
| **Updates** | `docker pull` | `winget upgrade` |
| **GPU Support** | Requires toolkit | Auto-detected |
| **Resource Limits** | Configurable | System resources |

**Recommendation**: Use Docker for production, native for dev! 🚀

---

## 📝 Quick Commands

```powershell
# Start
docker-compose up -d

# Stop
docker-compose down

# Logs
docker logs -f ollama

# Pull model
docker exec ollama ollama pull llama3.1

# List models
docker exec ollama ollama list

# Test API
curl http://localhost:11434/api/generate -d '{"model":"llama3.1","prompt":"Hello!","stream":false}'

# Access Web UI
start http://localhost:3005

# Restart
docker-compose restart ollama
```

---

## 💡 Next Steps

1. ✅ Start Ollama: `docker-compose up -d`
2. ✅ Pull model: `.\pull-models.ps1`
3. ✅ Test API: `curl http://localhost:11434/api/tags`
4. ✅ Start your API: `cd ../api && npm run dev`
5. ✅ Click "AI Assistant" in dashboard!

Your FREE AI chat is now ready! 🎊
