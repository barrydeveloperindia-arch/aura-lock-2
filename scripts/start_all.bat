@echo off
SETLOCAL EnableDelayedExpansion
echo 🚀 Starting Smart Door Lock System...
echo.

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js not found! Please install Node.js from https://nodejs.org/
    pause
    exit /b
)

:: 1. Start Backend API (Port 8000)
echo 🛠️ Starting Backend API...
start "Backend API" cmd /k "cd /d %~dp0backend && echo [BACKEND] Starting... && npm run dev"

:: 2. Start Biometric API (Port 8001)
echo 🧬 Starting Biometric API...
start "Biometric API" cmd /k "cd /d %~dp0edge && echo [BIOMETRIC] Starting... && start_biometric_api.bat"

:: 3. Start User Portal (Port 5180)
echo 🌐 Starting User Portal...
start "User Portal" cmd /k "cd /d %~dp0frontend && echo [FRONTEND] Starting... && npm run dev"

:: 4. Start Admin Dashboard (Port 5181)
echo 📊 Starting Admin Dashboard...
start "Admin Dashboard" cmd /k "cd /d %~dp0admin-panel && echo [ADMIN] Starting... && npm run dev"

echo.
echo ✅ Startup commands sent! 
echo.
echo ⚠️  IMPORTANT: Please check the 4 newly opened black windows.
echo    If any of them say "Error" or "Crashed", please let me know.
echo.
echo 🔗 Links:
echo - Frontend Portal:  http://localhost:5180
echo - Admin Dashboard: http://localhost:5181
echo - Backend API:     http://localhost:8000
echo - Biometric API:   http://localhost:8001
echo.
pause
