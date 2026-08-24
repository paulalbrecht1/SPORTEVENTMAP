[CmdletBinding()]
param(
  [string]$BackupRoot,
  [ValidateRange(1, 30)][int]$RetentionDays = 7,
  [string]$ProjectRef = "fztupxyxvhvhtihhmtnk",
  [switch]$DumpSnapshotOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "production-backup-common.ps1")

$repoRoot = Get-SportEventMapRepoRoot
if (-not $BackupRoot) {
  $BackupRoot = Join-Path $repoRoot "backups\production"
}
$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)
$cliPaths = Get-SupabaseCliPaths -RepoRoot $repoRoot
Assert-LinkedProductionProject -RepoRoot $repoRoot -ExpectedProjectRef $ProjectRef

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$backupName = "sporteventmap-production-$timestamp"
$temporaryParent = Join-Path $env:LOCALAPPDATA "SportEventMap\BackupTemp"
$temporaryRoot = Join-Path $temporaryParent "$backupName-$([guid]::NewGuid().ToString('N'))"
Assert-SafeDisposablePath -Path $temporaryRoot -ExpectedParent $temporaryParent

$logRoot = Join-Path $BackupRoot "logs"
$logPath = Join-Path $logRoot "production-backup.log"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-BackupLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "{0} {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Host $Message
}

function Invoke-ProductionQuery {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $json = Invoke-SupabaseCli `
    -RepoRoot $repoRoot `
    -NodePath $cliPaths.Node `
    -CliPath $cliPaths.Cli `
    -Arguments @("db", "query", "--linked", "--output", "json", $Sql) `
    -Label "Production read-only snapshot"
  $parsed = $json | ConvertFrom-Json
  if (-not ($parsed.PSObject.Properties.Name -contains "rows") -or
      -not $parsed.rows -or $parsed.rows.Count -ne 1) {
    $safeReason = if ($parsed.PSObject.Properties.Name -contains "error") {
      ($parsed.error | ConvertTo-Json -Compress) `
        -replace '(?i)postgres(?:ql)?://[^\s]+', '[REDACTED_DATABASE_URL]' `
        -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]'
    }
    else {
      "no rows property"
    }
    throw "Production snapshot did not return exactly one row: $safeReason"
  }
  return $parsed.rows[0].recovery_snapshot
}

function Assert-FileContent {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Patterns,
    [Parameter(Mandatory = $true)][string]$Label,
    [long]$MinimumBytes = 1
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label was not created: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinimumBytes) {
    throw "$Label is unexpectedly small ($($item.Length) bytes)."
  }
  $content = Get-Content -LiteralPath $Path -Raw
  foreach ($pattern in $Patterns) {
    if ($content -notmatch $pattern) {
      throw "$Label is missing required marker: $pattern"
    }
  }
}

function Get-CopyRowCount {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Schema,
    [Parameter(Mandatory = $true)][string]$Table
  )
  $content = Get-Content -LiteralPath $Path -Raw
  $pattern = '(?ms)^COPY\s+"' + [regex]::Escape($Schema) +
    '"\."' + [regex]::Escape($Table) +
    '"(?:\s+\([^\r\n]*\))?\s+FROM stdin;\r?\n(?<rows>.*?)^\\\.\r?$'
  $match = [regex]::Match($content, $pattern)
  if (-not $match.Success) {
    throw "COPY section $Schema.$Table is missing from $([System.IO.Path]::GetFileName($Path))."
  }
  $rows = $match.Groups['rows'].Value.TrimEnd([char[]]"`r`n")
  if ($rows.Length -eq 0) {
    return [long]0
  }
  return [long](($rows -split "\r?\n").Count)
}

function New-DumpSnapshot {
  param(
    [Parameter(Mandatory = $true)][datetime]$CapturedAt,
    [Parameter(Mandatory = $true)][string]$SchemaDump,
    [Parameter(Mandatory = $true)][string]$ApplicationDataDump,
    [Parameter(Mandatory = $true)][string]$StorageDataDump,
    [Parameter(Mandatory = $true)][string]$MigrationDataDump
  )
  $counts = [ordered]@{
    events = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "events"
    event_editions = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "event_editions"
    event_sources = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "event_sources"
    event_detail_sources = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "event_detail_sources"
    validation_issues = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "validation_issues"
    data_workflow_runs = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "data_workflow_runs"
    data_workflow_alerts = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "data_workflow_alerts"
    source_crawl_jobs = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "source_crawl_jobs"
    source_crawl_results = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "source_crawl_results"
    source_review_tasks = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "source_review_tasks"
    profiles = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "profiles"
    favorites = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "favorites"
    season_planner_events = Get-CopyRowCount -Path $ApplicationDataDump -Schema "public" -Table "season_planner_events"
    auth_users = Get-CopyRowCount -Path $ApplicationDataDump -Schema "auth" -Table "users"
    migration_count = Get-CopyRowCount -Path $MigrationDataDump -Schema "supabase_migrations" -Table "schema_migrations"
    storage_buckets = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "buckets"
    storage_objects = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "objects"
    storage_buckets_analytics = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "buckets_analytics"
    storage_buckets_vectors = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "buckets_vectors"
    storage_vector_indexes = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "vector_indexes"
    storage_multipart_uploads = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "s3_multipart_uploads"
    storage_multipart_upload_parts = Get-CopyRowCount -Path $StorageDataDump -Schema "storage" -Table "s3_multipart_uploads_parts"
  }
  $schemaContent = Get-Content -LiteralPath $SchemaDump -Raw
  return [pscustomobject][ordered]@{
    captured_at_utc = $CapturedAt.ToUniversalTime().ToString("o")
    project_ref = $ProjectRef
    snapshot_source = "verified pg_dump COPY sections"
    counts = [pscustomobject]$counts
    schema = [pscustomobject][ordered]@{
      public_tables = [regex]::Matches($schemaContent, '(?m)^CREATE TABLE IF NOT EXISTS "public"\."').Count
      public_views = [regex]::Matches($schemaContent, '(?m)^CREATE OR REPLACE VIEW "public"\."').Count
      public_functions = [regex]::Matches($schemaContent, '(?m)^CREATE OR REPLACE FUNCTION "public"\."').Count
      public_policies = [regex]::Matches($schemaContent, '(?m)^CREATE POLICY .* ON "public"\."').Count
      public_rls_tables = [regex]::Matches($schemaContent, '(?m)^ALTER TABLE ONLY "public"\."[^\r\n]+ ENABLE ROW LEVEL SECURITY;').Count
      public_foreign_keys = [regex]::Matches($schemaContent, '(?ms)^ALTER TABLE ONLY "public"\.".*?^    ADD CONSTRAINT [^\r\n]+ FOREIGN KEY').Count
    }
  }
}

$snapshotSql = @'
select jsonb_build_object(
  'captured_at_utc', now(),
  'project_ref', 'fztupxyxvhvhtihhmtnk',
  'database_size_bytes', pg_database_size(current_database()),
  'counts', jsonb_build_object(
    'events', (select count(*) from public.events),
    'event_editions', (select count(*) from public.event_editions),
    'event_sources', (select count(*) from public.event_sources),
    'event_detail_sources', (select count(*) from public.event_detail_sources),
    'validation_issues', (select count(*) from public.validation_issues),
    'data_workflow_runs', (select count(*) from public.data_workflow_runs),
    'data_workflow_alerts', (select count(*) from public.data_workflow_alerts),
    'source_crawl_jobs', (select count(*) from public.source_crawl_jobs),
    'source_crawl_results', (select count(*) from public.source_crawl_results),
    'source_review_tasks', (select count(*) from public.source_review_tasks),
    'profiles', (select count(*) from public.profiles),
    'favorites', (select count(*) from public.favorites),
    'season_planner_events', (select count(*) from public.season_planner_events),
    'auth_users', (select count(*) from auth.users),
    'migration_count', (select count(*) from supabase_migrations.schema_migrations),
    'storage_buckets', (select count(*) from storage.buckets),
    'storage_objects', (select count(*) from storage.objects),
    'storage_buckets_analytics', (select count(*) from storage.buckets_analytics),
    'storage_buckets_vectors', (select count(*) from storage.buckets_vectors),
    'storage_vector_indexes', (select count(*) from storage.vector_indexes),
    'storage_multipart_uploads', (select count(*) from storage.s3_multipart_uploads),
    'storage_multipart_upload_parts', (select count(*) from storage.s3_multipart_uploads_parts)
  ),
  'schema', jsonb_build_object(
    'public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'public_views', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'),
    'public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'public_policies', (select count(*) from pg_policies where schemaname='public'),
    'public_rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
    'public_foreign_keys', (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='f')
  ),
  'automation', jsonb_build_object(
    'active_cron_jobs', (select count(*) from cron.job where active),
    'auto_publish_enabled', coalesce((select (to_jsonb(s)->>'auto_publish_enabled')::boolean from public.edition_lifecycle_settings s where s.singleton), false),
    'auto_result_publish_enabled', coalesce((select (to_jsonb(s)->>'auto_result_publish_enabled')::boolean from public.edition_lifecycle_settings s where s.singleton), false)
  ),
  'validator', (
    select jsonb_build_object(
      'signature', p.oid::regprocedure::text,
      'security_definer', p.prosecdef,
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'service_role_execute', has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='run_event_validation'
    order by p.oid
    limit 1
  )
) as recovery_snapshot;
'@

$rolesPath = Join-Path $temporaryRoot "roles.sql"
$schemaPath = Join-Path $temporaryRoot "schema.sql"
$historySchemaPath = Join-Path $temporaryRoot "history-schema.sql"
$dataPath = Join-Path $temporaryRoot "data.sql"
$storageDataPath = Join-Path $temporaryRoot "storage-data.sql"
$historyDataPath = Join-Path $temporaryRoot "history-data.sql"
$restorePath = Join-Path $temporaryRoot "restore.sql"
$metadataPath = Join-Path $temporaryRoot "backup-metadata.json"
$archivePath = Join-Path $temporaryParent "$backupName.zip"
$encryptedPartialPath = Join-Path $BackupRoot "$backupName.sembackup.partial"
$encryptedFinalPath = Join-Path $BackupRoot "$backupName.sembackup"
$manifestFinalPath = Join-Path $BackupRoot "$backupName.manifest.json"

$primaryError = $null
try {
  New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
  Write-BackupLog "Starting encrypted Production backup $backupName."
  $dumpStartedAt = (Get-Date).ToUniversalTime()

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $rolesPath, "--role-only") `
    -Label "Role dump" | Out-Null

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $schemaPath) `
    -Label "Application schema dump" | Out-Null

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $historySchemaPath, "--schema", "supabase_migrations") `
    -Label "Migration history schema dump" | Out-Null

  if (-not $DumpSnapshotOnly) {
    $snapshotBefore = Invoke-ProductionQuery -Sql $snapshotSql
  }

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $dataPath, "--data-only", "--use-copy", "--schema", "auth,public,private") `
    -Label "Production data dump" | Out-Null

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $storageDataPath, "--data-only", "--use-copy", "--schema", "storage") `
    -Label "Storage metadata dump" | Out-Null

  Invoke-SupabaseCli -RepoRoot $repoRoot -NodePath $cliPaths.Node -CliPath $cliPaths.Cli `
    -Arguments @("db", "dump", "--linked", "--file", $historyDataPath, "--data-only", "--use-copy", "--schema", "supabase_migrations") `
    -Label "Migration history data dump" | Out-Null

  $dumpCompletedAt = (Get-Date).ToUniversalTime()
  $dumpSnapshot = New-DumpSnapshot `
    -CapturedAt $dumpCompletedAt `
    -SchemaDump $schemaPath `
    -ApplicationDataDump $dataPath `
    -StorageDataDump $storageDataPath `
    -MigrationDataDump $historyDataPath

  if ($DumpSnapshotOnly) {
    $snapshotBefore = $dumpSnapshot.PSObject.Copy()
    $snapshotBefore.captured_at_utc = $dumpStartedAt.ToString("o")
    $snapshotAfter = $dumpSnapshot
  }
  else {
    $snapshotAfter = Invoke-ProductionQuery -Sql $snapshotSql
  }

  foreach ($stableCount in @(
    "events", "event_editions", "event_sources", "profiles", "favorites",
    "season_planner_events", "auth_users", "migration_count",
    "storage_buckets", "storage_objects", "storage_buckets_analytics",
    "storage_buckets_vectors", "storage_vector_indexes",
    "storage_multipart_uploads", "storage_multipart_upload_parts"
  )) {
    $before = [long]$snapshotBefore.counts.$stableCount
    $after = [long]$snapshotAfter.counts.$stableCount
    if ($before -ne $after) {
      throw "Production count $stableCount changed during the dump ($before -> $after); backup rejected for consistency."
    }
    $dumpCount = [long]$dumpSnapshot.counts.$stableCount
    if ($dumpCount -ne $before) {
      throw "Dump count $stableCount differs from its Production snapshot ($dumpCount != $before); backup rejected."
    }
  }

  foreach ($operationalCount in @(
    "event_detail_sources", "validation_issues", "data_workflow_runs",
    "data_workflow_alerts", "source_crawl_jobs", "source_crawl_results",
    "source_review_tasks"
  )) {
    $before = [long]$snapshotBefore.counts.$operationalCount
    $after = [long]$snapshotAfter.counts.$operationalCount
    $dumpCount = [long]$dumpSnapshot.counts.$operationalCount
    if ($dumpCount -lt [Math]::Min($before, $after) -or
        $dumpCount -gt [Math]::Max($before, $after)) {
      throw "Dump count $operationalCount ($dumpCount) is outside its Production snapshot window ($before..$after)."
    }
  }

  Assert-FileContent -Path $rolesPath -Label "Role dump" -MinimumBytes 100 `
    -Patterns @('ALTER ROLE')
  Assert-FileContent -Path $schemaPath -Label "Schema dump" -MinimumBytes 10000 `
    -Patterns @(
      'CREATE TABLE IF NOT EXISTS "public"\."events"',
      'CREATE TABLE IF NOT EXISTS "public"\."event_editions"',
      'CREATE TABLE IF NOT EXISTS "public"\."event_sources"',
      'CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions"',
      'CREATE OR REPLACE FUNCTION "public"\."run_event_validation"',
      'CREATE OR REPLACE VIEW "public"\."public_event_discovery"',
      'CREATE POLICY',
      'ENABLE ROW LEVEL SECURITY',
      'FOREIGN KEY'
    )
  Assert-FileContent -Path $historySchemaPath -Label "Migration history schema dump" -MinimumBytes 500 `
    -Patterns @('CREATE TABLE IF NOT EXISTS "supabase_migrations"\."schema_migrations"')
  Assert-FileContent -Path $dataPath -Label "Data dump" -MinimumBytes 10000 `
    -Patterns @(
      'Data for Name: users; Type: TABLE DATA; Schema: auth',
      'Data for Name: events; Type: TABLE DATA; Schema: public',
      'Data for Name: event_editions; Type: TABLE DATA; Schema: public',
      'Data for Name: event_sources; Type: TABLE DATA; Schema: public',
      'Data for Name: favorites; Type: TABLE DATA; Schema: public',
      'Data for Name: season_planner_events; Type: TABLE DATA; Schema: public'
    )
  Assert-FileContent -Path $historyDataPath -Label "Migration history data dump" -MinimumBytes 500 `
    -Patterns @('Data for Name: schema_migrations; Type: TABLE DATA; Schema: supabase_migrations')
  Assert-FileContent -Path $storageDataPath -Label "Storage metadata dump" -MinimumBytes 500 `
    -Patterns @('Data for Name: buckets; Type: TABLE DATA; Schema: storage')

  $dumpFiles = @(
    $rolesPath, $schemaPath, $historySchemaPath, $dataPath,
    $storageDataPath, $historyDataPath
  )
  $fileMetadata = foreach ($file in $dumpFiles) {
    $item = Get-Item -LiteralPath $file
    [ordered]@{
      name = $item.Name
      bytes = $item.Length
      sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $metadata = [ordered]@{
    format_version = 1
    project_ref = $ProjectRef
    backup_name = $backupName
    dump_started_at_utc = $snapshotBefore.captured_at_utc
    dump_completed_at_utc = $snapshotAfter.captured_at_utc
    retention_days = $RetentionDays
    encryption = "AES-256-GCM; key protected by Windows DPAPI CurrentUser"
    snapshot_before = $snapshotBefore
    snapshot_after = $snapshotAfter
    files = $fileMetadata
  }
  $metadata | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

  $restoreHeader = @(
    '\set ON_ERROR_STOP on',
    'BEGIN;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;'
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($restorePath, "$restoreHeader$([Environment]::NewLine)")
  foreach ($file in $dumpFiles) {
    [System.IO.File]::AppendAllText(
      $restorePath,
      [System.IO.File]::ReadAllText($file) + [Environment]::NewLine
    )
  }
  [System.IO.File]::AppendAllText($restorePath, "COMMIT;$([Environment]::NewLine)")

  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  Compress-Archive -LiteralPath @($metadataPath, $restorePath, $rolesPath, $schemaPath, $historySchemaPath, $dataPath, $storageDataPath, $historyDataPath) `
    -DestinationPath $archivePath -CompressionLevel Optimal

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entryNames = @($zip.Entries | ForEach-Object { $_.FullName })
    foreach ($requiredEntry in @("backup-metadata.json", "restore.sql", "schema.sql", "data.sql")) {
      if ($requiredEntry -notin $entryNames) {
        throw "Backup archive is missing $requiredEntry."
      }
    }
  }
  finally {
    $zip.Dispose()
  }

  $keyInfo = Get-ProductionBackupKey
  if (Test-Path -LiteralPath $encryptedPartialPath) {
    Remove-Item -LiteralPath $encryptedPartialPath -Force
  }
  Protect-ProductionBackupArchive -InputPath $archivePath -OutputPath $encryptedPartialPath -Key $keyInfo.Bytes

  $decryptionProbe = Join-Path $temporaryParent "$backupName.verify.zip"
  try {
    Unprotect-ProductionBackupArchive -InputPath $encryptedPartialPath -OutputPath $decryptionProbe -Key $keyInfo.Bytes
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $probeHash = (Get-FileHash -LiteralPath $decryptionProbe -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne $probeHash) {
      throw "Encrypted backup decryption probe did not match the source archive."
    }
  }
  finally {
    Remove-Item -LiteralPath $decryptionProbe -Force -ErrorAction SilentlyContinue
  }

  Move-Item -LiteralPath $encryptedPartialPath -Destination $encryptedFinalPath
  $encryptedItem = Get-Item -LiteralPath $encryptedFinalPath
  if ($encryptedItem.Length -le 1024) {
    throw "Final encrypted backup is unexpectedly small."
  }

  $manifest = [ordered]@{
    format_version = 1
    backup_name = $backupName
    project_ref = $ProjectRef
    created_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    encrypted_file = $encryptedItem.Name
    encrypted_bytes = $encryptedItem.Length
    encrypted_sha256 = (Get-FileHash -LiteralPath $encryptedFinalPath -Algorithm SHA256).Hash.ToLowerInvariant()
    plaintext_archive_sha256 = $archiveHash
    retention_days = $RetentionDays
    snapshot_before = $snapshotBefore
    snapshot_after = $snapshotAfter
  }
  $manifestTemporaryPath = "$manifestFinalPath.partial"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestTemporaryPath -Encoding UTF8
  Move-Item -LiteralPath $manifestTemporaryPath -Destination $manifestFinalPath

  $cutoff = (Get-Date).ToUniversalTime().AddDays(-$RetentionDays)
  foreach ($oldBackup in Get-ChildItem -LiteralPath $BackupRoot -Filter "sporteventmap-production-*.sembackup" -File) {
    if ($oldBackup.FullName -ne $encryptedFinalPath -and $oldBackup.LastWriteTimeUtc -lt $cutoff) {
      $oldManifest = [System.IO.Path]::ChangeExtension($oldBackup.FullName, "manifest.json")
      Remove-Item -LiteralPath $oldBackup.FullName -Force
      Remove-Item -LiteralPath $oldManifest -Force -ErrorAction SilentlyContinue
      Write-BackupLog "Removed expired backup $($oldBackup.Name)."
    }
  }

  Write-BackupLog "Backup completed and verified: $encryptedFinalPath ($($encryptedItem.Length) bytes)."
  [pscustomobject]@{
    Success = $true
    BackupFile = $encryptedFinalPath
    ManifestFile = $manifestFinalPath
    Bytes = $encryptedItem.Length
    RetentionDays = $RetentionDays
    KeyFile = $keyInfo.Path
  } | ConvertTo-Json -Depth 5
}
catch {
  $primaryError = $_
  Write-BackupLog "BACKUP FAILED: $($_.Exception.Message) Existing verified backups were not rotated."
  throw
}
finally {
  Remove-Item -LiteralPath $encryptedPartialPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $temporaryRoot) {
    Assert-SafeDisposablePath -Path $temporaryRoot -ExpectedParent $temporaryParent
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
