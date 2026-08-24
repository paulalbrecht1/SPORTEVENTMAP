[CmdletBinding()]
param(
  [string]$BackupFile,
  [string]$BackupRoot,
  [switch]$KeepLocalEnvironment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "production-backup-common.ps1")

$repoRoot = Get-SportEventMapRepoRoot
if (-not $BackupRoot) {
  $BackupRoot = Join-Path $repoRoot "backups\production"
}
$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)
if (-not $BackupFile) {
  $latest = Get-ChildItem -LiteralPath $BackupRoot -Filter "sporteventmap-production-*.sembackup" -File `
    | Sort-Object LastWriteTimeUtc -Descending `
    | Select-Object -First 1
  if (-not $latest) {
    throw "No encrypted Production backup found in $BackupRoot."
  }
  $BackupFile = $latest.FullName
}
$BackupFile = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw "Backup file does not exist: $BackupFile"
}

$manifestPath = [System.IO.Path]::ChangeExtension($BackupFile, "manifest.json")
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Backup manifest does not exist: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$encryptedHash = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($encryptedHash -ne $manifest.encrypted_sha256) {
  throw "Encrypted backup hash does not match its manifest."
}

$cliPaths = Get-SupabaseCliPaths -RepoRoot $repoRoot
$drillId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$drillProjectId = "sport-event-map-recovery-drill-$drillId"
$drillParent = Join-Path $env:LOCALAPPDATA "SportEventMap\RestoreDrill"
$drillRoot = Join-Path $drillParent "$drillProjectId-$([guid]::NewGuid().ToString('N'))"
$drillSupabase = Join-Path $drillRoot "supabase"
$decryptedArchive = Join-Path $drillRoot "backup.zip"
$extractedRoot = Join-Path $drillRoot "extracted"
$localRestoreSql = Join-Path $drillRoot "restore-local.sql"
$reportRoot = Join-Path $BackupRoot "restore-reports"
$reportPath = Join-Path $reportRoot "$($manifest.backup_name)-restore-report.json"
$startedAt = (Get-Date).ToUniversalTime()
$localStarted = $false

Assert-SafeDisposablePath -Path $drillRoot -ExpectedParent $drillParent

function Replace-TopLevelConfigValue {
  param([string]$Config, [string]$Key, [string]$Value)
  $expression = "(?m)^($([regex]::Escape($Key))\s*=\s*).+$"
  if ($Config -notmatch $expression) {
    throw "Missing top-level Supabase config key $Key."
  }
  return $Config -replace $expression, ('${1}' + $Value)
}

function Replace-SectionConfigValue {
  param([string]$Config, [string]$Section, [string]$Key, [string]$Value)
  $sectionPattern = "(?ms)(^\[$([regex]::Escape($Section))\]\s*.*?)(?=^\[|\z)"
  $sectionMatch = [regex]::Match($Config, $sectionPattern)
  if (-not $sectionMatch.Success) {
    throw "Missing Supabase config section [$Section]."
  }
  $body = $sectionMatch.Value
  $keyPattern = "(?m)^($([regex]::Escape($Key))\s*=\s*).+$"
  if ($body -notmatch $keyPattern) {
    throw "Missing Supabase config key $Key in [$Section]."
  }
  $replacement = $body -replace $keyPattern, ('${1}' + $Value)
  return $Config.Substring(0, $sectionMatch.Index) + $replacement + `
    $Config.Substring($sectionMatch.Index + $sectionMatch.Length)
}

function Invoke-LocalSupabase {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if ($Arguments -contains "--linked" -or $Arguments -contains "--db-url") {
    throw "Restore drill rejected a cloud-capable Supabase argument."
  }
  return Invoke-SupabaseCli `
    -RepoRoot $drillRoot `
    -NodePath $cliPaths.Node `
    -CliPath $cliPaths.Cli `
    -Arguments $Arguments `
    -Label $Label
}

function Invoke-LocalJsonQueryFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $json = Invoke-LocalSupabase `
    -Arguments @("db", "query", "--local", "--output", "json", "--file", $Path) `
    -Label "Local restore verification query"
  return $json | ConvertFrom-Json
}

function Assert-EmptyArray {
  param([object]$Value, [string]$Label)
  if ($null -ne $Value -and @($Value).Count -ne 0) {
    throw "$Label failed: $($Value | ConvertTo-Json -Compress)"
  }
}

function Stop-LocalDrill {
  try {
    Invoke-LocalSupabase `
      -Arguments @("stop", "--project-id", $drillProjectId) `
      -Label "Local restore drill cleanup" | Out-Null
  }
  catch {
    Write-Warning $_.Exception.Message
  }
  try {
    & $cliPaths.Node (Join-Path $repoRoot "tools\remove-local-supabase-volumes.mjs") $drillProjectId
    if ($LASTEXITCODE -ne 0) {
      throw "Exact Docker volume cleanup exited with code $LASTEXITCODE."
    }
  }
  catch {
    Write-Warning $_.Exception.Message
  }
}

try {
  New-Item -ItemType Directory -Path $drillSupabase -Force | Out-Null
  New-Item -ItemType Directory -Path $extractedRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null

  $keyInfo = Get-ProductionBackupKey
  Unprotect-ProductionBackupArchive -InputPath $BackupFile -OutputPath $decryptedArchive -Key $keyInfo.Bytes
  $archiveHash = (Get-FileHash -LiteralPath $decryptedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($archiveHash -ne $manifest.plaintext_archive_sha256) {
    throw "Decrypted archive hash does not match the manifest."
  }
  Expand-Archive -LiteralPath $decryptedArchive -DestinationPath $extractedRoot

  $metadataPath = Join-Path $extractedRoot "backup-metadata.json"
  $restoreSqlPath = Join-Path $extractedRoot "restore.sql"
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $restoreSqlPath -PathType Leaf)) {
    throw "Decrypted backup is missing metadata or restore.sql."
  }
  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  foreach ($file in $metadata.files) {
    $path = Join-Path $extractedRoot $file.name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Backup archive is missing $($file.name)."
    }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $file.sha256) {
      throw "Backup archive member $($file.name) failed its SHA-256 check."
    }
  }

  $localRestoreHeader = @(
    '\set ON_ERROR_STOP on',
    'BEGIN;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;'
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText(
    $localRestoreSql,
    "$localRestoreHeader$([Environment]::NewLine)"
  )
  foreach ($localDumpName in @(
    "schema.sql", "history-schema.sql", "data.sql", "history-data.sql"
  )) {
    $localDumpPath = Join-Path $extractedRoot $localDumpName
    [System.IO.File]::AppendAllText(
      $localRestoreSql,
      [System.IO.File]::ReadAllText($localDumpPath) + [Environment]::NewLine
    )
  }
  [System.IO.File]::AppendAllText(
    $localRestoreSql,
    "COMMIT;$([Environment]::NewLine)"
  )

  foreach ($storageCount in @(
    "storage_buckets", "storage_objects", "storage_buckets_analytics",
    "storage_buckets_vectors", "storage_vector_indexes",
    "storage_multipart_uploads", "storage_multipart_upload_parts"
  )) {
    if ([long]$metadata.snapshot_before.counts.$storageCount -ne 0 -or
        [long]$metadata.snapshot_after.counts.$storageCount -ne 0) {
      throw "Local drill cannot omit non-empty Storage metadata field $storageCount."
    }
  }

  $config = Get-Content -LiteralPath (Join-Path $repoRoot "supabase\config.toml") -Raw
  $config = Replace-TopLevelConfigValue -Config $config -Key "project_id" -Value "`"$drillProjectId`""
  $config = Replace-SectionConfigValue -Config $config -Section "api" -Key "port" -Value "56321"
  $config = Replace-SectionConfigValue -Config $config -Section "db" -Key "port" -Value "56322"
  $config = Replace-SectionConfigValue -Config $config -Section "db" -Key "shadow_port" -Value "56320"
  $config = Replace-SectionConfigValue -Config $config -Section "db.pooler" -Key "port" -Value "56329"
  $config = Replace-SectionConfigValue -Config $config -Section "studio" -Key "port" -Value "56323"
  $config = Replace-SectionConfigValue -Config $config -Section "local_smtp" -Key "port" -Value "56324"
  $config = Replace-SectionConfigValue -Config $config -Section "edge_runtime" -Key "inspector_port" -Value "28083"
  $config = Replace-SectionConfigValue -Config $config -Section "analytics" -Key "port" -Value "56327"
  $config = Replace-SectionConfigValue -Config $config -Section "db.migrations" -Key "enabled" -Value "false"
  $config = Replace-SectionConfigValue -Config $config -Section "storage" -Key "enabled" -Value "true"
  [System.IO.File]::WriteAllText((Join-Path $drillSupabase "config.toml"), $config)

  if (Test-Path -LiteralPath (Join-Path $drillSupabase ".temp\project-ref")) {
    throw "Restore workdir unexpectedly contains a linked project reference."
  }

  Invoke-LocalSupabase `
    -Arguments @(
      "start", "-x",
      "edge-runtime,gotrue,imgproxy,logflare,mailpit,postgres-meta,postgrest,realtime,studio,supavisor,vector"
    ) `
    -Label "Start isolated local Supabase database and Storage schema" | Out-Null
  $localStarted = $true

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction Stop `
    | Where-Object { $_.LocalPort -in @(56321, 56322) }
  foreach ($port in @(56321, 56322)) {
    $portListeners = @($listeners | Where-Object { $_.LocalPort -eq $port })
    if ($portListeners.Count -eq 0) {
      throw "No local restore listener found on port $port."
    }
    if (@($portListeners | Where-Object { $_.LocalAddress -notin @("127.0.0.1", "::1") }).Count -ne 0) {
      throw "Local restore port $port is exposed beyond loopback."
    }
  }

  & $cliPaths.Node `
    (Join-Path $repoRoot "tools\import-sql-into-local-supabase.mjs") `
    $drillProjectId `
    $localRestoreSql
  if ($LASTEXITCODE -ne 0) {
    throw "Local psql restore exited with code $LASTEXITCODE."
  }

  $verificationResult = Invoke-LocalJsonQueryFile -Path (Join-Path $repoRoot "tools\verify-production-restore.sql")
  if (-not $verificationResult.rows -or $verificationResult.rows.Count -ne 1) {
    throw "Restore verification did not return exactly one result row."
  }
  $verification = $verificationResult.rows[0].restore_verification

  foreach ($field in @(
    "events", "event_editions", "event_sources", "profiles", "favorites",
    "season_planner_events", "auth_users", "migration_count",
    "storage_buckets", "storage_objects", "storage_buckets_analytics",
    "storage_buckets_vectors", "storage_vector_indexes",
    "storage_multipart_uploads", "storage_multipart_upload_parts"
  )) {
    $expected = [long]$metadata.snapshot_before.counts.$field
    $actual = [long]$verification.counts.$field
    if ($expected -ne $actual) {
      throw "Restored count $field differs from backup snapshot ($expected != $actual)."
    }
  }

  foreach ($field in @(
    "event_detail_sources", "validation_issues", "data_workflow_runs",
    "data_workflow_alerts", "source_crawl_jobs", "source_crawl_results",
    "source_review_tasks"
  )) {
    $before = [long]$metadata.snapshot_before.counts.$field
    $after = [long]$metadata.snapshot_after.counts.$field
    $actual = [long]$verification.counts.$field
    if ($actual -lt [Math]::Min($before, $after) -or $actual -gt [Math]::Max($before, $after)) {
      throw "Restored operational count $field ($actual) is outside the dump window ($before..$after)."
    }
  }

  Assert-EmptyArray -Value $verification.missing_tables -Label "Required tables"
  Assert-EmptyArray -Value $verification.missing_views -Label "Required views"
  Assert-EmptyArray -Value $verification.missing_functions -Label "Required functions"
  Assert-EmptyArray -Value $verification.missing_rls_tables -Label "Required RLS tables"
  Assert-EmptyArray -Value $verification.missing_core_policies -Label "Core policies"
  Assert-EmptyArray -Value $verification.unsafe_public_views -Label "Security-invoker public views"

  if ([long]$verification.public_policy_count -le 0 -or
      [long]$verification.public_constraint_count -le 0 -or
      [long]$verification.public_foreign_key_count -le 0) {
    throw "Restore is missing policies, constraints, or foreign keys."
  }
  if ([long]$verification.orphan_editions -ne 0 -or
      [long]$verification.source_edition_event_mismatches -ne 0) {
    throw "Restore contains orphan editions or source/edition mismatches."
  }
  if ([bool]$verification.auto_publish_enabled -or [bool]$verification.auto_result_publish_enabled) {
    throw "Restore unexpectedly enabled automatic publication."
  }
  if (-not [bool]$verification.validator.security_definer -or
      [bool]$verification.validator.anon_execute -or
      -not [bool]$verification.validator.authenticated_execute -or
      -not [bool]$verification.validator.service_role_execute) {
    throw "run_event_validation() grants or SECURITY DEFINER state differ from the hardened baseline."
  }
  if ([bool]$verification.authenticated_bypass_rls -or
      -not [bool]$verification.service_role_bypass_rls) {
    throw "Authenticated/service-role RLS boundaries are invalid after restore."
  }

  & $cliPaths.Node `
    (Join-Path $repoRoot "tools\import-sql-into-local-supabase.mjs") `
    $drillProjectId `
    (Join-Path $repoRoot "tools\verify-production-restore-security.sql")
  if ($LASTEXITCODE -ne 0) {
    throw "Transactional restore security test exited with code $LASTEXITCODE."
  }

  if ([long]$verification.public_discovery_rows -le 0 -or
      [long]$verification.public_archive_rows -le 0) {
    throw "Restored public Discovery or archive view returned no data."
  }

  $completedAt = (Get-Date).ToUniversalTime()
  $report = [ordered]@{
    backup_name = $manifest.backup_name
    backup_file = [System.IO.Path]::GetFileName($BackupFile)
    backup_point_from_utc = $metadata.dump_started_at_utc
    backup_point_to_utc = $metadata.dump_completed_at_utc
    restore_started_at_utc = $startedAt.ToString("o")
    restore_completed_at_utc = $completedAt.ToString("o")
    restore_duration_seconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    isolated_local_project = $drillProjectId
    data_integrity_verified = $true
    schema_verified = $true
    rls_and_policies_verified = $true
    user_isolation_verified = $true
    run_event_validation_denied_for_normal_user = $true
    application_views_verified = $true
    counts = $verification.counts
    production_unchanged = $true
  }
  $reportTemporaryPath = "$reportPath.partial"
  $report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $reportTemporaryPath -Encoding UTF8
  Move-Item -LiteralPath $reportTemporaryPath -Destination $reportPath -Force

  Write-Host "Local restore drill completed successfully."
  $report | ConvertTo-Json -Depth 20
}
finally {
  if (-not $KeepLocalEnvironment) {
    Stop-LocalDrill
  }
  if (-not $KeepLocalEnvironment -and (Test-Path -LiteralPath $drillRoot)) {
    Assert-SafeDisposablePath -Path $drillRoot -ExpectedParent $drillParent
    Remove-Item -LiteralPath $drillRoot -Recurse -Force
  }
}
