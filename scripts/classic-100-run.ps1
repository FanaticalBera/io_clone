# Reproduce the complete production + paired-control experiment and report.
# Runtime can exceed one hour on the recorded Ryzen 5 5600X.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = Join-Path $taskRoot '.tools\node-v24.21.0-win-x64\node.exe'
$taskCli = Join-Path $taskRoot 'node_modules\tsx\dist\cli.mjs'
$taskHarness = Join-Path $taskRoot 'scripts\classic-100-validation.ts'
$taskDirectory = Join-Path $taskRoot '.local\classic-100-validation'
if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Project Node 24 runtime is missing.' }
$taskExisting = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*classic-100-validation.ts*' })
if ($taskExisting.Count) { throw 'A validation is already running. Preserve that run before starting another.' }
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$taskJobs = @()
foreach ($taskWorker in 0..3) {
 $taskFirst = 1 + 25 * $taskWorker
 $taskOutput = Join-Path $taskDirectory "production-$taskWorker.json"
 $taskStdout = Join-Path $taskDirectory "production-$taskWorker.stdout.log"
 $taskStderr = Join-Path $taskDirectory "production-$taskWorker.stderr.log"
 $taskArguments = '"' + $taskCli + '" "' + $taskHarness + '" --seeds=25 --minutes=20 --first=' + $taskFirst + ' --output="' + $taskOutput + '"'
 $taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
 $taskJobs += [PSCustomObject]@{Worker=$taskWorker;FirstSeed=$taskFirst;Count=25;ProcessId=$taskProcess.Id;Output=$taskOutput;Stdout=$taskStdout;Stderr=$taskStderr;Process=$taskProcess}
}
$taskJobs | Select-Object Worker,FirstSeed,Count,ProcessId,Output,Stdout,Stderr | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDirectory 'processes.json') -Encoding utf8
$taskControlArguments = '"' + $taskCli + '" "' + $taskHarness + '" --seeds=8 --minutes=20 --first=1 --variant=no-respawn --output="' + (Join-Path $taskDirectory 'control.json') + '"'
$taskControlProcess = Start-Process -FilePath $taskNode -ArgumentList $taskControlArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskDirectory 'control.stdout.log') -RedirectStandardError (Join-Path $taskDirectory 'control.stderr.log')
$taskAllProcesses = @($taskJobs | ForEach-Object Process) + @($taskControlProcess)
while (@($taskAllProcesses | Where-Object { -not $_.HasExited }).Count) {
 $taskCompleted = 0
 foreach ($taskWorker in 0..3) { $taskCompleted += @(Get-Content -LiteralPath (Join-Path $taskDirectory "production-$taskWorker.stdout.log")).Count }
 Write-Host "Production seeds completed: $taskCompleted/100"
 Start-Sleep -Seconds 30
}
foreach ($taskProcess in $taskAllProcesses) { $taskProcess.WaitForExit(); if ($taskProcess.ExitCode -ne 0) { throw "Experiment process $($taskProcess.Id) failed; inspect stderr logs." } }
Push-Location -LiteralPath $taskRoot
try {
 & $taskNode $taskCli scripts/classic-100-timing.ts
 if ($LASTEXITCODE -ne 0) { throw 'Isolated timing failed.' }
 & $taskNode $taskCli scripts/classic-100-report.ts
 if ($LASTEXITCODE -ne 0) { throw 'Report validation failed.' }
} finally { Pop-Location }
