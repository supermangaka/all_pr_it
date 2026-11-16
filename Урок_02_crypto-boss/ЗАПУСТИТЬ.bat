@echo off
setlocal
cd /d "%~dp0"
title Crypto Boss 5.0

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" goto install_packages
if not exist "node_modules\socket.io\package.json" goto install_packages
goto start_game

:install_packages
echo Installing required packages. Internet is needed for this first step.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Package installation failed.
  echo Check your internet connection, then run this file again.
  pause
  exit /b 1
)

:start_game
echo.
echo Starting Crypto Boss 5.0...
echo Keep this window open while playing.
echo The server will print the local Wi-Fi addresses below.
echo.
call npm start
pause
