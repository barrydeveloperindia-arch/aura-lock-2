param (
    [string]$Target = "production",
    [string]$Version = "",
    [string]$ApiBase = ""
)

$ErrorActionPreference = "Stop"

# Set Environment Variables for Android Studio Bundled Tools
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:JAVA_HOME\bin"

# 1. Configuration Constants
$PROJECT_ROOT = Get-Location
$TERMINAL_DIR = Join-Path $PROJECT_ROOT "terminal-app"
$ASSETS_BASE = Join-Path $TERMINAL_DIR "assets"
$ASSETS_DIR = Join-Path $ASSETS_BASE "builds"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmm"
# Auto-detect active local IP to prevent address mismatches
$detectedIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "vEthernet*" } | Select-Object -First 1).IPAddress
if (!$detectedIP) {
    $detectedIP = "192.168.2.117"
}
$PROD_API = "http://$($detectedIP):8000"

Write-Host "--- AuraLock APK Build Factory ---" -ForegroundColor Cyan

# 2. Prerequisites
if (!(Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm missing" }
if (!(Get-Command java -ErrorAction SilentlyContinue)) { throw "java missing" }

# 3. Versioning
if ([string]::IsNullOrWhiteSpace($Version)) {
    $pkgPath = Join-Path $TERMINAL_DIR "package.json"
    $pkg = Get-Content $pkgPath | ConvertFrom-Json
    $Version = $pkg.version
}
Write-Host "Building version: $Version"

# 4. API Configuration
if ([string]::IsNullOrWhiteSpace($ApiBase)) {
    if ($Target -eq "production") {
        $ApiBase = $PROD_API
    } else {
        $ApiBase = "http://192.168.2.153:8002"
    }
}
Write-Host "Using API: $ApiBase"

# 5. Build Web Service
Write-Host "Step 1: Building Web Assets..."
Set-Location $TERMINAL_DIR
"VITE_API_BASE_URL=$ApiBase" | Out-File ".env.production" -Encoding utf8
npm install
npm run build

# 6. Capacitor Sync
Write-Host "Step 2: Syncing Capacitor..."
npx cap sync android

# 7. Native Build
Write-Host "Step 3: Compiling APK..."
Set-Location (Join-Path $TERMINAL_DIR "android")

# Update Version in build.gradle
$gradleFile = "app/build.gradle"
(Get-Content $gradleFile) | ForEach-Object {
    $_ -replace 'versionName ".*"', "versionName `"$Version`""
} | Set-Content $gradleFile

./gradlew.bat assembleDebug

# 8. Archiving
Write-Host "Step 4: Archiving Artifacts..."
$androidBase = Join-Path $TERMINAL_DIR "android"
$apkPathInAndroid = "app/build/outputs/apk/debug/app-debug.apk"
$apkSrc = Join-Path $androidBase $apkPathInAndroid
$apkName = "englabs-attendance-v$Version-$TIMESTAMP-$Target.apk"
$apkDest = Join-Path $ASSETS_DIR $apkName

if (Test-Path $apkSrc) {
    if (!(Test-Path $ASSETS_DIR)) { New-Item -ItemType Directory -Path $ASSETS_DIR -Force }
    Copy-Item $apkSrc $apkDest -Force
    
    $manifest = @{
        version = $Version
        target = $Target
        api_base = $ApiBase
        timestamp = $TIMESTAMP
        filename = $apkName
    } | ConvertTo-Json
    $manifest | Out-File (Join-Path $ASSETS_DIR "latest_build.json") -Encoding utf8
    
    Write-Host "Success! APK stored in assets/builds/" -ForegroundColor Green
} else {
    throw "Build failed: APK not found"
}

Set-Location $PROJECT_ROOT
