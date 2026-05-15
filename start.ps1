$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Story Graph ===" -ForegroundColor Cyan
Write-Host ""

# ── Python venv ───────────────────────────────────────────
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

Write-Host "Activating venv and installing Python deps..." -ForegroundColor Yellow
& ".venv\Scripts\pip.exe" install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "pip install failed" -ForegroundColor Red; Read-Host; exit 1 }

# ── Frontend build ────────────────────────────────────────
if (-not (Test-Path "frontend\dist")) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: npm not found. Install Node.js from https://nodejs.org" -ForegroundColor Red
        Read-Host; exit 1
    }
    Write-Host "Building frontend (first run only)..." -ForegroundColor Yellow
    Push-Location frontend
    npm install --silent
    npm run build
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed" -ForegroundColor Red; Read-Host; exit 1 }
}

# ── Start server ──────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "*Ethernet*","*Wi-Fi*" -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike "169.*" } |
       Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green
Write-Host "  Local:   http://localhost:8000" -ForegroundColor White
if ($ip) { Write-Host "  Network: http://${ip}:8000" -ForegroundColor White }
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

& ".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
