# Ollama Setup for AI Chat (FREE!)

The AI Chat feature uses **Ollama** - a completely free, local LLM that runs on your machine. No API keys, no costs!

## 🚀 Quick Setup (5 minutes)

### 1. Install Ollama

**Windows:**
```powershell
winget install Ollama.Ollama
```

**Or download from:** https://ollama.com/download

### 2. Pull a Model

After installation, Ollama runs automatically. Pull a model:

```powershell
# Recommended: Llama 3.1 (8B parameters, ~8GB RAM needed)
ollama pull llama3.1

# Smaller option: Mistral (7B, ~6GB RAM)
ollama pull mistral

# Larger option: Llama 3.1:70b (70B, ~48GB RAM - better quality)
ollama pull llama3.1:70b
```

### 3. Verify It's Running

```powershell
# Check if Ollama is running
ollama list

# Test it
ollama run llama3.1 "Hello, what can you do?"
```

You should see it respond! Press `Ctrl+D` to exit.

### 4. Configure Environment (Optional)

Add to your `.env` file (optional - these are the defaults):

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

### 5. Start Your API

```powershell
cd api
npm run dev
```

That's it! The AI Chat button in your dashboard now works for FREE! 🎉

---

## 📊 Model Comparison

| Model | Size | RAM Needed | Speed | Quality |
|-------|------|------------|-------|---------|
| `llama3.1` | 8B | 8GB | Fast ⚡ | Good ⭐⭐⭐ |
| `mistral` | 7B | 6GB | Fast ⚡ | Good ⭐⭐⭐ |
| `llama3.1:70b` | 70B | 48GB | Slow 🐌 | Excellent ⭐⭐⭐⭐⭐ |
| `codellama` | 7B | 6GB | Fast ⚡ | Good (code focus) ⭐⭐⭐ |

**Recommendation**: Start with `llama3.1` - great balance of speed and quality.

---

## 🔧 Troubleshooting

### "Ollama is not running"

```powershell
# Start Ollama manually
ollama serve
```

### "Model not found"

```powershell
# List downloaded models
ollama list

# Pull the model
ollama pull llama3.1
```

### Slow responses?

- Use a smaller model: `ollama pull mistral`
- Update .env: `OLLAMA_MODEL=mistral`
- Close other applications to free RAM

### Want better quality?

- Use a larger model: `ollama pull llama3.1:70b`
- Update .env: `OLLAMA_MODEL=llama3.1:70b`
- Requires ~48GB RAM

---

## 💡 Advanced: GPU Acceleration

Ollama automatically uses your GPU if available (NVIDIA/AMD). This makes responses **10x faster**!

Check if GPU is being used:
```powershell
ollama ps
```

If you see `GPU: 0/1` it's not using GPU. Update your GPU drivers.

---

## 🆚 Ollama vs OpenAI

| Feature | Ollama | OpenAI GPT-4 |
|---------|--------|--------------|
| **Cost** | FREE ✅ | $50-150/month |
| **Privacy** | 100% local ✅ | Sent to OpenAI |
| **Speed** | Fast (with GPU) | Fast |
| **Quality** | Good ⭐⭐⭐ | Excellent ⭐⭐⭐⭐⭐ |
| **Offline** | Works offline ✅ | Requires internet |

**For SaaS customers**: You can offer Ollama for free tier, GPT-4 for premium!

---

## 🔄 Switching to OpenAI (Optional)

If you want to use OpenAI instead:

1. Install OpenAI package:
```powershell
cd api
npm install openai
```

2. Update `ai-chat-service.ts` to use OpenAI
3. Add `OPENAI_API_KEY` to `.env`

But Ollama is free and works great for most use cases! 🚀
