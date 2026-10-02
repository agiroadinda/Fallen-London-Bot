@echo off
title Fallen London Bot — Control Panel
cd /d "%~dp0"

echo.
echo ========================================
echo    Fallen London Bot — Control Panel
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install it from https://nodejs.org ^(LTS version^)
    echo.
    pause
    exit
)

:: Check node_modules
if not exist "node_modules\" (
    echo Installing dependencies for the first time...
    echo This will take a minute, please wait...
    echo.
    npm install
    echo.
    echo Installing Chromium browser...
    npx playwright install chromium
    echo.
    echo Setup complete!
    echo.
)

:: Check .env
if not exist ".env" (
    echo ERROR: The .env file is missing.
    echo Please create a .env file in this folder.
    echo See README.md for instructions.
    echo.
    pause
    exit
)

echo Starting control panel server...
echo The GUI will open in your browser automatically.
echo.
echo To stop everything, close this window or press Ctrl+C
echo.

node server.js

pause