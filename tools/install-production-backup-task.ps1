[CmdletBinding()]
param(
  [string]$TaskName = "SportEventMap Production Backup",
  [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backupScript = Join-Path $repoRoot "tools\backup-production.ps1"
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
  throw "Backup script not found: $backupScript"
}

$powerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$actionArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`" -DumpSnapshotOnly"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $actionArguments -WorkingDirectory $repoRoot
$triggers = @(
  New-ScheduledTaskTrigger -Daily -At "00:30"
  New-ScheduledTaskTrigger -Daily -At "06:30"
  New-ScheduledTaskTrigger -Daily -At "12:30"
  New-ScheduledTaskTrigger -Daily -At "18:30"
)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Encrypted logical backup of SportEventMap Production Supabase; seven-day rotation."
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Select-Object LastRunTime, LastTaskResult, NextRunTime
