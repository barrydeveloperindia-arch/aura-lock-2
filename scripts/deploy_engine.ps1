<#
.SYNOPSIS
  Deploy the Python face engine to Cloud Run (auralock-biometric-engine, asia-south1).

.USAGE
  .\scripts\deploy_engine.ps1 -Stage      # build + new revision with NO traffic (tag "next")
  .\scripts\deploy_engine.ps1 -Promote    # send 100% traffic to the latest revision
  .\scripts\deploy_engine.ps1 -Rollback   # back to the previous revision

.NOTES
  - Keeps the service's existing env (SUPABASE_URL / SUPABASE_KEY) and sets
    ENGINE_KEY, FACE_THRESHOLD and AMBIGUITY_GAP from backend\.env.
  - The dlib build takes ~10 minutes.
#>
param([switch]$Stage, [switch]$Promote, [switch]$Rollback, [string]$PreviousRevision = "")
$ErrorActionPreference = "Continue"
$Project = "auralock-system-2026"; $Region = "asia-south1"; $Service = "auralock-biometric-engine"
$Root = Split-Path -Parent $PSScriptRoot
$Edge = Join-Path $Root "edge"
$EnvFile = Join-Path $Root "backend\.env"

if (-not ($Stage -or $Promote -or $Rollback)) { Write-Host "Usage: -Stage | -Promote | -Rollback" -ForegroundColor Yellow; exit 1 }

if ($Stage) {
    $key = ""
    # Match limits travel with the deploy so a rebuild never resets a calibrated threshold
    $thr = "0.90"; $gap = "0.10"
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^ENGINE_KEY=(.+)$') { $key = $Matches[1].Trim() }
        if ($line -match '^FACE_THRESHOLD=(.+)$') { $thr = $Matches[1].Trim() }
        if ($line -match '^AMBIGUITY_GAP=(.+)$') { $gap = $Matches[1].Trim() }
    }
    if (-not $key) { throw "ENGINE_KEY not found in backend\.env" }
    Write-Host "FACE_THRESHOLD=$thr AMBIGUITY_GAP=$gap" -ForegroundColor DarkGray
    Write-Host "Building and deploying $Service (no traffic, tag 'next')..." -ForegroundColor Cyan
    Push-Location $Edge
    try {
        gcloud run deploy $Service --source . --region $Region --project $Project `
            --no-traffic --tag next --update-env-vars "ENGINE_KEY=$key,FACE_THRESHOLD=$thr,AMBIGUITY_GAP=$gap" --quiet
        if ($LASTEXITCODE -ne 0) { throw "gcloud run deploy failed" }
    } finally { Pop-Location }
    $tagUrl = gcloud run services describe $Service --region $Region --project $Project `
        --format="value(status.traffic.filter(tag:next).extract(url).flatten())"
    Write-Host "`nStaged. Health (503 until faces are loaded, then 200):" -ForegroundColor Green
    Write-Host "  $tagUrl/health"
    Write-Host "`nWhen happy:  .\scripts\deploy_engine.ps1 -Promote" -ForegroundColor Yellow
}
if ($Promote) {
    gcloud run services update-traffic $Service --region $Region --project $Project --to-latest --quiet
    if ($LASTEXITCODE -ne 0) { throw "update-traffic failed" }
    Write-Host "Live." -ForegroundColor Green
}
if ($Rollback) {
    if (-not $PreviousRevision) {
        $PreviousRevision = (gcloud run revisions list --service $Service --region $Region --project $Project --format="value(name)" --limit 2 | Select-Object -Last 1)
    }
    gcloud run services update-traffic $Service --region $Region --project $Project --to-revisions "$PreviousRevision=100" --quiet
    Write-Host "Rolled back to $PreviousRevision" -ForegroundColor Green
}
