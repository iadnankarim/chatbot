# One command to get the PLPA AI Assistant ready for a demo (production build, not dev).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1 [-Rebuild] [-Port 3000]
#
# 1. starts the local model server (models on D:, kept in memory)
# 2. builds the app if needed, then starts it
# 3. loads both models into memory so the first question is not slow
# 4. reads any new documents into the Knowledge Base
# 5. prints what is left to check by hand

param(
  [switch]$Rebuild,
  [int]$Port = 3000,
  [string]$AdminPassword = "Plpa@2026"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$url = "http://localhost:$Port"

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

Step "1/5 Model server"
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\start-ollama.ps1"
if ($LASTEXITCODE -ne 0) { throw "Model server did not start." }

Step "2/5 App"
$inUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
  Write-Host "Something is already listening on port $Port, stopping it."
  $inUse | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
if ($Rebuild -or -not (Test-Path ".next\BUILD_ID")) {
  Write-Host "Building (a few minutes)..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}
Start-Process cmd -ArgumentList "/c", "npx next start -p $Port > `"$env:TEMP\plpa-app.log`" 2>&1" -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest "$url/login" -UseBasicParsing -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep -Seconds 2 }
  if ($i -eq 59) { throw "App did not start. See $env:TEMP\plpa-app.log" }
}
Write-Host "App is up at $url"

Step "3/5 Warming the models"
$sw = [Diagnostics.Stopwatch]::StartNew()
$null = Invoke-RestMethod "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" `
  -Body (@{ model = "gemma3:4b"; prompt = ""; keep_alive = -1 } | ConvertTo-Json) -TimeoutSec 300
$null = Invoke-RestMethod "http://127.0.0.1:11434/api/embed" -Method Post -ContentType "application/json" `
  -Body (@{ model = "bge-m3"; input = "warm up"; keep_alive = -1 } | ConvertTo-Json) -TimeoutSec 300
Write-Host ("Both models loaded in {0:N0} s" -f $sw.Elapsed.TotalSeconds)

Step "4/5 Knowledge Base"
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\reindex.ps1" -Url $url -Password $AdminPassword

Step "5/5 Ready. Check by hand:"
$freeGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
Write-Host "  Free RAM: $freeGb GB  (below 3 GB: close the browser tabs, VS Code and other apps)"
Write-Host "  Open $url in ONE browser window (use 'localhost', not the IP address)"
Write-Host "  Log in as ahmed / sara / usman / admin  (password in lib\demo-users.ts)"
Write-Host "  Ask one test question first so the first real answer is not the first request."
