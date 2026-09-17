@echo off
cd /d "%~dp0"
node build.js
if errorlevel 1 (
    echo.
    echo Build FAILED. Check if Node.js is installed.
)
pause
