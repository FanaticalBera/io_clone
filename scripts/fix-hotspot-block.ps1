$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$nodePath=(Get-Item -LiteralPath (Join-Path $taskRoot '.tools\node-v24.21.0-win-x64\node.exe')).FullName
$ruleName='{CF8FB3FE-D440-493C-A3C8-969B17A137BF}'
$rule=Get-NetFirewallRule -Name $ruleName -ErrorAction Stop
$app=$rule | Get-NetFirewallApplicationFilter
$port=$rule | Get-NetFirewallPortFilter
if($rule.Action -ne 'Block' -or $rule.Direction -ne 'Inbound' -or $app.Program -ne $nodePath -or $port.Protocol -ne 'TCP'){throw 'The existing rule does not match the reviewed Node TCP block'}
$backupPath=Join-Path $taskRoot '.local/hotspot-block-backup.json'
if(-not(Test-Path -LiteralPath $backupPath)){
 @{rule=$ruleName;program=$nodePath;localPort=@($port.LocalPort)} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $backupPath -Encoding utf8
}
$port | Set-NetFirewallPortFilter -LocalPort @('0-3002','3004-65535') | Out-Null
@{ok=$true;changedRule=$ruleName;excludedPort=3003;preservedBlockPorts=@('0-3002','3004-65535')} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskRoot '.local/hotspot-fix.json') -Encoding utf8

