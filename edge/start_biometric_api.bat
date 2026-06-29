@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File start_biometric_api.ps1
