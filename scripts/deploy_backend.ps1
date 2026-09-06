<#
.SYNOPSIS
  Deploy the backend to Cloud Run (auralock-backend, asia-south1) safely.

.USAGE
  # 1. Build + deploy a NEW revision that gets NO live traffic (tag "photos"):
  .\scripts\deploy_backend.ps1 -Stage

  # 2. After testing the tagged URL it prints, send 100% traffic to it:
  .\scripts\deploy_backend.ps1 -Promote

  # If anything is wrong, go back to the previous revision instantly:
  .\scripts\deploy_backend.ps1 -Rollback

.NOTES
  - Env vars are read from backend\.env and set on the Cloud Run service
    explicitly (the .env file itself is NOT baked into the image; .dockerignore
    excludes it). PORT is skipped (Cloud Run sets it). PYTHON_ENGINE_URL and
    BACKEND_URL are overridden with the production Cloud Run URLs.
  - Requires: gcloud auth login done, and backend\public\admin refreshed from
    admin-panel\dist if the dashboard changed.
#>
param(
    [switch]$Stage,
    [switch]$Promote,
    [switch]$Rollback,
    [string]$PreviousRevision = "auralock-backend-00029-cph"
)

$ErrorActionPreference = "Stop"
$Project = "auralock-system-2026"
$Region  = "asia-south1"
$Service = "auralock-backend"
$Root    = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"

if (-not ($Stage -or $Promote -or $Rollback)) {
    Write-Host "Usage: .\scripts\deploy_backend.ps1 -Stage | -Promote | -Rollback" -ForegroundColor Yellow
    exit 1
}

if ($Stage) {
    $envFile = Join-Path $Backend ".env"
    if (-not (Test-Path $envFile)) { throw "backend\.env not found" }

    $pairs = @()
    foreach ($line in Get-Content $envFile) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $idx = $t.IndexOf("=")
        if ($idx -lt 1) { continue }
        $k = $t.Substring(0, $idx).Trim()
        $v = $t.Substring($idx + 1).Trim().Trim('"')
        if ($k -in @("PORT", "PYTHON_ENGINE_URL", "BACKEND_URL")) { continue }
        if ($v -eq "") { Write-Host "  skipping empty $k" -ForegroundColor DarkYellow; continue }
        $pairs += "$k=$v"
    }
    $pairs += "PYTHON_ENGINE_URL=https://auralock-biometric-engine-50851729985.asia-south1.run.app"
    $pairs += "BACKEND_URL=https://auralock-backend-50851729985.asia-south1.run.app"

    $keys = ($pairs | ForEach-Object { $_.Split("=")[0] }) -join ", "
    Write-Host "Env vars to set: $keys" -ForegroundColor Cyan

    # "^|^" tells gcloud to split on | instead of , (values may contain commas)
    $envArg = "^|^" + ($pairs -join "|")

    Write-Host "`nBuilding and deploying $Service (no traffic, tag 'photos')..." -ForegroundColor Cyan
    Push-Location $Backend
    try {
        gcloud run deploy $Service --source . --region $Region --project $Project `
            --no-traffic --tag photos --set-env-vars $envArg --quiet
        if ($LASTEXITCODE -ne 0) { throw "gcloud run deploy failed" }
    } finally { Pop-Location }

    $tagUrl = gcloud run services describe $Service --region $Region --project $Project `
        --format="value(status.traffic.filter(tag:photos).extract(url).flatten())"
    Write-Host "`nStaged. Test it here (no live traffic yet):" -ForegroundColor Green
    Write-Host "  $tagUrl/api/stats"
    Write-Host "  $tagUrl/api/biometrics/health"
    Write-Host "`nWhen happy:  .\scripts\deploy_backend.ps1 -Promote" -ForegroundColor Yellow
}

if ($Promote) {
    Write-Host "Sending 100% traffic to the latest revision..." -ForegroundColor Cyan
    gcloud run services update-traffic $Service --region $Region --project $Project --to-latest --quiet
    if ($LASTEXITCODE -ne 0) { throw "update-traffic failed" }
    Write-Host "Live." -ForegroundColor Green
}

if ($Rollback) {
    Write-Host "Rolling traffic back to $PreviousRevision..." -ForegroundColor Cyan
    gcloud run services update-traffic $Service --region $Region --project $Project `
        --to-revisions "$PreviousRevision=100" --quiet
    if ($LASTEXITCODE -ne 0) { throw "rollback failed" }
    Write-Host "Rolled back." -ForegroundColor Green
}
