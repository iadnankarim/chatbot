# Reads the documents folder (sample-docs by default, or KB_DOCS_DIR) into the Knowledge Base.
# Only new or changed files are processed. The app must be running.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\reindex.ps1 [-Password <admin password>] [-Url http://localhost:3000]

param(
  [string]$Url = "http://localhost:3000",
  [string]$Password = "Plpa@2026"
)

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ username = "admin"; password = $Password } | ConvertTo-Json
Invoke-RestMethod "$Url/api/auth/login" -Method Post -Body $body -ContentType "application/json" -WebSession $session | Out-Null

Write-Host "Reindexing (this can take a minute for new files)..."
$r = Invoke-RestMethod "$Url/api/kb/reindex" -Method Post -WebSession $session -TimeoutSec 600
Write-Host "Folder : $($r.dir)"
Write-Host "Added  : $($r.added -join ', ')"
Write-Host "Skipped: $($r.skipped.Count) unchanged"
Write-Host "Removed: $($r.removed -join ', ')"
if ($r.failed.Count -gt 0) {
  Write-Host "FAILED:" -ForegroundColor Red
  $r.failed | ForEach-Object { Write-Host "  $($_.file): $($_.error)" -ForegroundColor Red }
}
