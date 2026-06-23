@echo off
echo Starting backend...
start "Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe main.py"

echo Starting frontend (dev mode with hot reload)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
