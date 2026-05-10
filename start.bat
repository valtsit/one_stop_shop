@echo off
echo Building frontend...
cd /d %~dp0frontend && call npm run build
if errorlevel 1 (
    echo Frontend build failed!
    pause
    exit /b 1
)

echo.
echo Starting backend (serving frontend + API on port 8000)...
cd /d %~dp0backend && python main.py
