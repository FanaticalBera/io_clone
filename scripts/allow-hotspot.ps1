$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$resultDirectory=Join-Path $taskRoot '.local'
New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
try {
 $ruleName='HEXHOLD-Hotspot-3003'
 if(-not(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)){
  New-NetFirewallRule -Name $ruleName -DisplayName 'HEXHOLD hotspot test (TCP 3003)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3003 -LocalAddress 192.168.137.1 -RemoteAddress 192.168.137.0/24 -Program (Join-Path $taskRoot '.tools\node-v24.21.0-win-x64\node.exe') -Profile Any | Out-Null
 }
 @{ok=$true;rule=$ruleName;port=3003;localAddress='192.168.137.1';remoteAddress='192.168.137.0/24'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resultDirectory 'hotspot-rule.json') -Encoding utf8
} catch {
 @{ok=$false;message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resultDirectory 'hotspot-rule.json') -Encoding utf8
 exit 1
}
