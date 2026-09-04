<#
.SYNOPSIS
  Prateek-Term installer for Windows.

.DESCRIPTION
  Installs Prateek-Term for the current user from the official GitHub releases.
  Extracts a zip rather than running an installer, which means Windows
  SmartScreen never appears — the app is not code-signed, so the NSIS installer
  from the releases page does trigger it.

.EXAMPLE
  irm https://raw.githubusercontent.com/tripathiprateek/prateek-term/main/install.ps1 | iex

.EXAMPLE
  # `irm | iex` cannot take parameters, so pass them like this:
  & ([scriptblock]::Create((irm https://raw.githubusercontent.com/tripathiprateek/prateek-term/main/install.ps1))) -Channel rc
#>
[CmdletBinding()]
param(
  [ValidateSet('stable', 'rc')] [string] $Channel,
  [string] $Version,
  [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
$Repo    = 'tripathiprateek/prateek-term'
$Root    = Join-Path $env:LOCALAPPDATA 'Programs\Prateek-Term'
$Shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Prateek-Term.lnk'
$StateFile = Join-Path $Root '.install-state.json'

function Write-Step($m) { Write-Host $m -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host $m -ForegroundColor Green }

# ── uninstall ───────────────────────────────────────────────────────────────
if ($Uninstall) {
  if (Test-Path $Root)     { Remove-Item -Recurse -Force $Root }
  if (Test-Path $Shortcut) { Remove-Item -Force $Shortcut }
  Write-Ok 'Prateek-Term removed.'
  Write-Host ''
  Write-Host 'Your settings and connection profiles were kept. To delete them too:'
  Write-Host "  Remove-Item -Recurse `"$env:APPDATA\Prateek-Term`""
  exit 0
}

# Re-running with no -Channel keeps whatever channel this machine is on.
if (-not $Channel) {
  $Channel = if (Test-Path $StateFile) {
    (Get-Content $StateFile -Raw | ConvertFrom-Json).channel
  } else { 'stable' }
}

$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { 'x64' }
  'ARM64' { 'arm64' }
  default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
}

# ── resolve the tag ─────────────────────────────────────────────────────────
$headers = @{ 'User-Agent' = 'prateek-term-installer'; Accept = 'application/vnd.github.v3+json' }
if ($Version) {
  $tag = $Version
} elseif ($Channel -eq 'rc') {
  # Newest of {stable + pre-release} — the releases list is newest-first.
  $tag = (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases?per_page=10" -Headers $headers |
          Where-Object { -not $_.draft } | Select-Object -First 1).tag_name
} else {
  # /releases/latest excludes pre-releases by definition.
  $tag = (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers).tag_name
}
if (-not $tag) { throw "Could not determine the latest $Channel release." }

$ver  = $tag -replace '^v', ''
$file = "Prateek-Term-$ver-$Arch.zip"
$base = "https://github.com/$Repo/releases/download/$tag"

if (Test-Path $StateFile) {
  $state = Get-Content $StateFile -Raw | ConvertFrom-Json
  if ($state.version -eq $ver) {
    Write-Ok "Prateek-Term $ver is already installed. Nothing to do."
    exit 0
  }
}

# ── download + verify ───────────────────────────────────────────────────────
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("prateek-term-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  Write-Step "Installing Prateek-Term $ver ($Arch, $Channel channel)..."
  $zip = Join-Path $tmp $file
  Invoke-WebRequest "$base/$file" -OutFile $zip -Headers $headers

  try {
    $sums = (Invoke-WebRequest "$base/SHA256SUMS" -Headers $headers).Content
    # SHA256SUMS carries bare filenames, two spaces before the name.
    $want = ($sums -split "`n" | Where-Object { $_ -match "\s\Q$file\E$" }) -split '\s+' | Select-Object -First 1
    if ($want) {
      $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
      if ($got -ne $want.ToLower()) {
        throw "Checksum verification FAILED for $file - refusing to install."
      }
      Write-Ok 'Checksum verified.'
    }
  } catch [System.Net.WebException] {
    Write-Warning "SHA256SUMS not published for $tag - skipping verification."
  }

  # Replace cleanly: a stale file from an older version would otherwise survive.
  if (Test-Path $Root) { Remove-Item -Recurse -Force $Root }
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  Expand-Archive -Path $zip -DestinationPath $Root -Force

  $exe = Get-ChildItem -Path $Root -Filter 'Prateek-Term.exe' -Recurse |
         Select-Object -First 1 -ExpandProperty FullName
  if (-not $exe) { throw 'Prateek-Term.exe not found in the downloaded archive.' }

  @{ version = $ver; channel = $Channel } | ConvertTo-Json | Set-Content $StateFile

  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($Shortcut)
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = Split-Path $exe
  $lnk.Description = 'Terminal emulator and SSH/serial connection manager'
  $lnk.Save()

  Write-Host ''
  Write-Ok "Prateek-Term $ver installed."
  Write-Host "  Launch:    Start Menu -> Prateek-Term"
  Write-Host "  Path:      $exe"
  Write-Host "  Upgrade:   re-run this installer"
  Write-Host "  Uninstall: ... | iex, with -Uninstall"
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
