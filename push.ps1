$ErrorActionPreference = "Stop"

Write-Host "📦 Staging changes..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) { Write-Error "Git Add failed"; exit 1 }

Write-Host "📝 Committing..." -ForegroundColor Cyan
$msg = "fix: Biometric mirror fallback and backend Cloud Run proxy routing"
git commit -m "$msg"

Write-Host "🚀 Pushing to remote..." -ForegroundColor Cyan
$branch = git branch --show-current
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Push failed. Trying to set upstream..." -ForegroundColor Yellow
    git push -u origin $branch
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Success!" -ForegroundColor Green
} else {
    Write-Error "Push failed final attempt."
    exit 1
}
