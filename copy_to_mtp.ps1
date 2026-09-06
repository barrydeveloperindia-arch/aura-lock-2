$ErrorActionPreference = "Stop"

$device_name = "OPPO A72 5G"

$builds_dir = Join-Path $PSScriptRoot "terminal-app\assets\builds"
$latest_apk = Get-ChildItem -Path $builds_dir -Filter *.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest_apk) {
    Write-Host "No APK found in $builds_dir"
    exit 1
}
$apk_path = $latest_apk.FullName
Write-Host "Selected latest APK from assets: $($latest_apk.Name)"

Write-Host "Searching for MTP Device: $device_name..."
$shell = New-Object -ComObject Shell.Application
$computer = $shell.NameSpace(17) # ssfDRIVES

$device = $computer.Items() | Where-Object { $_.Name -match $device_name }

if ($device) {
    Write-Host "Found Device: $($device.Name)"
    $internalStorage = $device.GetFolder.Items() | Where-Object { $_.Name -match "Internal shared storage" }
    
    if ($internalStorage) {
        Write-Host "Found Storage: $($internalStorage.Name)"
        $downloadFolder = $internalStorage.GetFolder.Items() | Where-Object { $_.Name -match "Download" }
        
        if ($downloadFolder) {
            Write-Host "Found target folder: $($downloadFolder.Name). Transferring APK..."
            # 4 = Do not display a progress dialog box
            # 16 = Respond with "Yes to All" for any dialog box that is displayed
            $downloadFolder.GetFolder.CopyHere($apk_path, 20)
            
            # Wait for copy to complete (since CopyHere is asynchronous)
            $destFileName = [System.IO.Path]::GetFileName($apk_path)
            $destFileNameWithoutExtension = [System.IO.Path]::GetFileNameWithoutExtension($apk_path)
            $copied = $false
            Write-Host "Waiting for transfer to complete..."
            for ($i = 0; $i -lt 30; $i++) {
                Start-Sleep -Seconds 1
                $destItem = $downloadFolder.GetFolder.Items() | Where-Object { $_.Name -eq $destFileName -or $_.Name -eq $destFileNameWithoutExtension }
                if ($destItem) {
                    Write-Host "Success! APK transferred to your phone's Download folder."
                    $copied = $true
                    break
                }
            }
            if (-not $copied) {
                Write-Host "Transfer timed out or failed."
            }
        } else {
            Write-Host "Download folder not found on device."
        }
    } else {
        Write-Host "Internal shared storage not found."
    }
} else {
    Write-Host "Device not found. Please ensure it is connected and screen is unlocked."
}
