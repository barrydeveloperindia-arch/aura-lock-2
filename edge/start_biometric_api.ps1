# Clear port 8003 of any stale processes
Write-Host "🔍 Checking port 8003..."
$portProcesses = Get-NetTCPConnection -LocalPort 8003 -ErrorAction SilentlyContinue
if ($portProcesses) {
    Write-Host "🧹 Clearing port 8003..."
    foreach ($proc in $portProcesses) {
        Stop-Process -Id $proc.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Determine Python command
$py = "../.venv/Scripts/python.exe"
if (!(Test-Path $py)) {
    $py = "python"
}

Write-Host "🚀 Starting Biometric API with $py..."
& $py biometric_api.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Biometric API crashed or failed to start. Installing dependencies..."
    & $py -m pip install fastapi uvicorn pillow numpy supabase httpx python-multipart google-generativeai python-dotenv
    Write-Host "🔄 Retrying..."
    & $py biometric_api.py
}
