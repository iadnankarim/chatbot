# Starts the local model server for the PLPA demo.
# - Models live on D: (the Ollama tray app ignores OLLAMA_MODELS and would show an empty list).
# - KEEP_ALIVE -1 keeps the models in memory so answers never wait for a reload.
# - Checks that the models are really visible and retries if another Ollama grabbed the port.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-ollama.ps1
#
# Tip: turn off "Ollama" in Task Manager > Startup apps, otherwise the tray app starts at every
# Windows login with the wrong model folder.

$ErrorActionPreference = "Stop"
$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$required = @("gemma3:4b", "bge-m3:latest")

function Stop-Ollama {
  # The tray app can start a new server right after the old one stops, so repeat until none is left.
  for ($i = 0; $i -lt 10; $i++) {
    $running = Get-Process "ollama app", "ollama", "ollama_llama_server" -ErrorAction SilentlyContinue
    if (-not $running) { return }
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
}

function Wait-PortFree {
  for ($i = 0; $i -lt 15; $i++) {
    if (-not (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Seconds 1
  }
}

for ($attempt = 1; $attempt -le 3; $attempt++) {
  Stop-Ollama
  Wait-PortFree

  $env:OLLAMA_MODELS = "D:\ollama-models"
  $env:OLLAMA_KEEP_ALIVE = "-1"
  Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden

  $names = @()
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $names = @((Invoke-RestMethod http://127.0.0.1:11434/api/tags -TimeoutSec 2).models.name)
      if ($names.Count -gt 0) { break }
    } catch { }
    Start-Sleep -Seconds 1
  }

  $missing = $required | Where-Object { $names -notcontains $_ }
  if ($names.Count -gt 0 -and -not $missing) {
    Write-Host "Ollama is up. Models: $($names -join ', ')"
    exit 0
  }
  Write-Host "Attempt $attempt/3: server is up but models are missing ($($missing -join ', ')). Retrying..." -ForegroundColor Yellow
}
Write-Error "Ollama did not start with the required models: $($required -join ', ')"
exit 1
