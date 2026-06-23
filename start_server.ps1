$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting backend (serving frontend + API on port 8000)..." -ForegroundColor Green
Write-Host "Close this window or press Ctrl+C to stop the server." -ForegroundColor Yellow
Write-Host ""

Set-Location "$root\backend"
try {
    & "$root\backend\venv\Scripts\python.exe" main.py
}
finally {
    Write-Host ""
    Write-Host "Stopping server..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%main.py%'" | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Server stopped." -ForegroundColor Green
    Start-Sleep -Seconds 2
}
