@echo off
echo Starting Aura Lock 2 Services...

start "Aura Backend" cmd /k "cd /d %~dp0backend && title Aura Backend (8002) && npm run dev"
timeout /t 2 /nobreak >nul

start "Aura Biometrics" cmd /k "cd /d %~dp0edge && title Aura Biometrics (8003) && start_biometric_api.bat"
timeout /t 2 /nobreak >nul

start "Aura Admin" cmd /k "cd /d %~dp0admin-panel && title Aura Admin (5181) && npm run dev"
timeout /t 2 /nobreak >nul

start "Aura Frontend" cmd /k "cd /d %~dp0frontend && title Aura Frontend (5180) && npm run dev"

echo All services started!
pause
