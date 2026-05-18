$ErrorActionPreference = "Stop"

$device_name = "OnePlus Nord 4"
$apk_path = "C:\Users\SAM\Documents\Antigravity\aura-lock-2\terminal-app\android\app\build\outputs\apk\debug\app-debug.apk"

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
            Write-Host "Success! APK transferred to your phone's Download folder."
        } else {
            Write-Host "Download folder not found on device."
        }
    } else {
        Write-Host "Internal shared storage not found."
    }
} else {
    Write-Host "Device not found. Please ensure it is connected and screen is unlocked."
}
