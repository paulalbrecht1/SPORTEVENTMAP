Set-StrictMode -Version Latest

$script:BackupMagic = [System.Text.Encoding]::ASCII.GetBytes("SEMBACKUP1")
$script:BackupEntropy = [System.Text.Encoding]::UTF8.GetBytes(
  "SportEventMap production backup key v1"
)

function Get-SportEventMapRepoRoot {
  return [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "..")
  )
}

function Get-SupabaseCliPaths {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)

  $node = Get-Command node -ErrorAction Stop
  $cli = Join-Path $RepoRoot "node_modules\supabase\dist\supabase.js"
  if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
    throw "Pinned Supabase CLI not found at $cli. Run npm install first."
  }

  return @{
    Node = $node.Source
    Cli = $cli
  }
}

function Assert-LinkedProductionProject {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectRef
  )

  $linkFile = Join-Path $RepoRoot "supabase\.temp\project-ref"
  if (-not (Test-Path -LiteralPath $linkFile -PathType Leaf)) {
    throw "Supabase project is not linked. Expected $linkFile."
  }

  $actualProjectRef = (Get-Content -LiteralPath $linkFile -Raw).Trim()
  if ($actualProjectRef -ne $ExpectedProjectRef) {
    throw "Refusing remote access: linked project $actualProjectRef is not expected Production project $ExpectedProjectRef."
  }
}

function Invoke-SupabaseCli {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$CliPath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $stderrFile = [System.IO.Path]::GetTempFileName()
  try {
    $previousDoNotTrack = $env:DO_NOT_TRACK
    $previousTelemetry = $env:SUPABASE_TELEMETRY_DISABLED
    $previousErrorActionPreference = $ErrorActionPreference
    $env:DO_NOT_TRACK = "1"
    $env:SUPABASE_TELEMETRY_DISABLED = "1"

    try {
      # Windows PowerShell promotes native stderr to ErrorRecord objects when
      # ErrorActionPreference is Stop. Capture it without aborting early so the
      # actual process exit code remains authoritative.
      $ErrorActionPreference = "Continue"
      Push-Location -LiteralPath $RepoRoot
      try {
        $stdout = & $NodePath $CliPath --workdir $RepoRoot @Arguments 2> $stderrFile
        $exitCode = $LASTEXITCODE
      }
      finally {
        Pop-Location
      }
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
      $env:DO_NOT_TRACK = $previousDoNotTrack
      $env:SUPABASE_TELEMETRY_DISABLED = $previousTelemetry
    }

    if ($exitCode -ne 0) {
      $stderr = (Get-Content -LiteralPath $stderrFile -Raw -ErrorAction SilentlyContinue).Trim()
      $stdoutText = ($stdout -join [Environment]::NewLine).Trim()
      $detail = @($stderr, $stdoutText) | Where-Object { $_ } | Select-Object -Unique
      $detail = ($detail -join [Environment]::NewLine) `
        -replace '(?i)postgres(?:ql)?://[^\s]+', '[REDACTED_DATABASE_URL]'
      throw "$Label failed with exit code $exitCode.$([Environment]::NewLine)$detail"
    }

    return ($stdout -join [Environment]::NewLine)
  }
  finally {
    Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-ProductionBackupKey {
  $keyRoot = Join-Path $env:LOCALAPPDATA "SportEventMap\BackupKeys"
  $keyPath = Join-Path $keyRoot "production-backup-key.dpapi"
  New-Item -ItemType Directory -Path $keyRoot -Force | Out-Null

  if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) {
    $key = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
      $key,
      $script:BackupEntropy,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $temporaryKeyPath = "$keyPath.partial"
    [System.IO.File]::WriteAllBytes($temporaryKeyPath, $protected)
    Move-Item -LiteralPath $temporaryKeyPath -Destination $keyPath -Force
  }

  $protectedKey = [System.IO.File]::ReadAllBytes($keyPath)
  $keyBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedKey,
    $script:BackupEntropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  if ($keyBytes.Length -ne 32) {
    throw "Production backup key has an invalid length."
  }

  return @{
    Bytes = $keyBytes
    Path = $keyPath
  }
}

function Protect-ProductionBackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][byte[]]$Key
  )

  $plaintext = [System.IO.File]::ReadAllBytes($InputPath)
  $nonce = [byte[]]::new(12)
  $tag = [byte[]]::new(16)
  $ciphertext = [byte[]]::new($plaintext.Length)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($nonce)

  $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
  try {
    $aes.Encrypt($nonce, $plaintext, $ciphertext, $tag, $script:BackupMagic)
  }
  finally {
    $aes.Dispose()
  }

  $stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
  try {
    $stream.Write($script:BackupMagic, 0, $script:BackupMagic.Length)
    $stream.Write($nonce, 0, $nonce.Length)
    $stream.Write($tag, 0, $tag.Length)
    $stream.Write($ciphertext, 0, $ciphertext.Length)
  }
  finally {
    $stream.Dispose()
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext)
  }
}

function Unprotect-ProductionBackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][byte[]]$Key
  )

  $payload = [System.IO.File]::ReadAllBytes($InputPath)
  $headerLength = $script:BackupMagic.Length + 12 + 16
  if ($payload.Length -le $headerLength) {
    throw "Encrypted backup is truncated."
  }

  $magic = $payload[0..($script:BackupMagic.Length - 1)]
  if ([System.BitConverter]::ToString($magic) -ne
      [System.BitConverter]::ToString($script:BackupMagic)) {
    throw "Encrypted backup has an unknown format."
  }

  $nonceStart = $script:BackupMagic.Length
  $tagStart = $nonceStart + 12
  $cipherStart = $tagStart + 16
  $nonce = $payload[$nonceStart..($tagStart - 1)]
  $tag = $payload[$tagStart..($cipherStart - 1)]
  $ciphertext = $payload[$cipherStart..($payload.Length - 1)]
  $plaintext = [byte[]]::new($ciphertext.Length)

  $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
  try {
    $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, $script:BackupMagic)
    [System.IO.File]::WriteAllBytes($OutputPath, $plaintext)
  }
  finally {
    $aes.Dispose()
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext)
  }
}

function Assert-SafeDisposablePath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedParent
  )

  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $resolvedParent = [System.IO.Path]::GetFullPath($ExpectedParent).TrimEnd('\') + '\'
  if (-not $resolvedPath.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Disposable path escaped its expected parent: $resolvedPath"
  }
  if ($resolvedPath.TrimEnd('\') -eq $resolvedParent.TrimEnd('\')) {
    throw "Disposable path must not equal its parent: $resolvedPath"
  }
}
