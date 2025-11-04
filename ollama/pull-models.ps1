# PowerShell script to pull Ollama models after container starts

Write-Host "Waiting for Ollama to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "Pulling llama3.1 model (recommended)..." -ForegroundColor Cyan
docker exec ollama ollama pull llama3.1

Write-Host "`nModels pulled successfully!" -ForegroundColor Green
Write-Host "You can now use Ollama at http://localhost:11434" -ForegroundColor Green
Write-Host "Web UI available at http://localhost:3005" -ForegroundColor Green
