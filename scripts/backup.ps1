# Copies everything that cannot be recreated into one dated folder:
# the database (users, chats, document index, activity) and the Knowledge Base documents.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 [-To D:\Backups]
param([string]$To = (Join-Path $PSScriptRoot "..\..\backups"))

$app = Resolve-Path (Join-Path $PSScriptRoot "..")
$docs = if ($env:KB_DOCS_DIR) { $env:KB_DOCS_DIR } else { Join-Path $app "..\sample-docs" }
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$target = Join-Path $To "plpa-$stamp"
New-Item -ItemType Directory -Force $target | Out-Null

# The SQLite file may have a -wal file next to it; copy them together.
$data = Join-Path $app "data"
if (Test-Path $data) {
  Copy-Item (Join-Path $data "plpa.db*") $target -Force
  Write-Host "Database copied."
} else {
  Write-Host "No data folder yet - nothing to copy for the database."
}
if (Test-Path $docs) {
  Copy-Item $docs (Join-Path $target "documents") -Recurse -Force
  Write-Host "Documents copied."
}
Write-Host "Backup saved to $target"
Write-Host "To restore: stop the app, copy plpa.db* back into the data folder, copy documents back, start the app."
