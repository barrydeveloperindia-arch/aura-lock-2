New-NetFirewallRule -DisplayName "AuraLock API 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "AuraLock Biometric 8001" -Direction Inbound -LocalPort 8001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "AuraLock Backend 8002" -Direction Inbound -LocalPort 8002 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "AuraLock Engine 8003" -Direction Inbound -LocalPort 8003 -Protocol TCP -Action Allow
