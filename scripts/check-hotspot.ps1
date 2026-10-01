$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$nodePath=(Get-Item -LiteralPath (Join-Path $taskRoot '.tools\node-v24.21.0-win-x64\node.exe')).FullName
$rule=Get-NetFirewallRule -Name 'HEXHOLD-Hotspot-3003' -PolicyStore ActiveStore
$block=@(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Block | Where-Object {
 $app=$_ | Get-NetFirewallApplicationFilter
 $app.Program -eq $nodePath
})
$result=@{
 rule=($rule | Select-Object Name,Enabled,Direction,Action,Profile,PolicyStoreSourceType)
 address=($rule | Get-NetFirewallAddressFilter | Select-Object LocalAddress,RemoteAddress)
 port=($rule | Get-NetFirewallPortFilter | Select-Object Protocol,LocalPort,RemotePort)
 program=($rule | Get-NetFirewallApplicationFilter | Select-Object Program)
 matchingBlockRules=@($block | ForEach-Object { @{rule=($_ | Select-Object Name,DisplayName,Enabled,Profile);ports=($_ | Get-NetFirewallPortFilter | Select-Object Protocol,LocalPort);address=($_ | Get-NetFirewallAddressFilter | Select-Object LocalAddress,RemoteAddress)} })
 profiles=@(Get-NetFirewallProfile -PolicyStore ActiveStore | Select-Object Name,Enabled,AllowLocalFirewallRules,DefaultInboundAction)
}
$result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $taskRoot '.local/hotspot-audit.json') -Encoding utf8

