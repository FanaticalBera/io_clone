$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$backupPath=Join-Path $taskRoot '.local/hotspot-block-backup.json'
if(Test-Path -LiteralPath $backupPath){
 $backup=Get-Content -Raw -LiteralPath $backupPath | ConvertFrom-Json
 $rule=Get-NetFirewallRule -Name $backup.rule -ErrorAction Stop
 $app=$rule | Get-NetFirewallApplicationFilter
 if($app.Program -ne $backup.program -or $rule.Action -ne 'Block'){throw 'Refusing to change a different application rule'}
 $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort $backup.localPort | Out-Null
}
Get-NetFirewallRule -Name 'HEXHOLD-Hotspot-3003' -ErrorAction SilentlyContinue | Remove-NetFirewallRule

