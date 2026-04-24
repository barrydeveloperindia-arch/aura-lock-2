@echo off
echo 🧹 Cleaning up stuck Node.js and Python processes for Smart Door Lock...
echo.

echo Killing processes on Port 5180 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5180') do taskkill /F /PID %%a 2>nul

echo Killing processes on Port 5181 (Admin Dashboard)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5181') do taskkill /F /PID %%a 2>nul

echo Killing processes on Port 8000 (Backend API)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do taskkill /F /PID %%a 2>nul

echo Killing processes on Port 8001 (Biometric API)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001') do taskkill /F /PID %%a 2>nul

echo.
echo ✅ Cleanup complete! You can now safely run 'start_all.bat'.
echo.
pause
