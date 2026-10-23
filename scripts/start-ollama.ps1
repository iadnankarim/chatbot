# Starts the local model server for the PLPA demo.
# - Models live on D: (the Ollama tray app ignores OLLAMA_MODELS and would show an empty list).
# - KEEP_ALIVE -1 keeps the model in memory so answers never wait for a reload.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-ollama.ps1

$ErrorActionPreference = "Stop"
$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

# Stop the tray app and any server that was started with the wrong settings.
Get-Process "ollama app", ollama -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$env:OLLAMA_MODELS = "D:\ollama-models"
$env:OLLAMA_KEEP_ALIVE = "-1"
Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden

for ($i = 0; $i -lt 30; $i++) {
  try {
    $tags = Invoke-RestMethod http://127.0.0.1:11434/api/tags -TimeoutSec 2
    Write-Host "Ollama is up. Models: $($tags.models.name -join ', ')"
    exit 0
  } catch { Start-Sleep -Seconds 1 }
}
Write-Error "Ollama did not start."
