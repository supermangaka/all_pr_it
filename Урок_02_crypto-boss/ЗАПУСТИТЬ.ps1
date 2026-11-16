$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js was not found. Install Node.js LTS from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm was not found. Reinstall Node.js with npm included." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$expressPath = Join-Path $PSScriptRoot "node_modules/express/package.json"
$socketPath = Join-Path $PSScriptRoot "node_modules/socket.io/package.json"
if (-not (Test-Path $expressPath) -or -not (Test-Path $socketPath)) {
    Write-Host "Installing packages (internet is needed for the first run)..." -ForegroundColor Cyan
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Package installation failed. Check your internet connection and try again." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "Starting Crypto Boss 5.0..." -ForegroundColor Green
Write-Host "Keep this window open while playing. The server prints Wi-Fi addresses."
npm start
Read-Host "Press Enter to close"
