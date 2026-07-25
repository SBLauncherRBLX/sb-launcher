# Deploys the current built UI + published native package into the live install
# folder (%LOCALAPPDATA%\Programs\SB Launcher) and reseeds the runtime-web overlay.
# Use after UI or native changes so reinstall/live launch always match source.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release\native"
$dist = Join-Path $root "apps\desktop\dist"
$nativeRuntimeWeb = Join-Path $root "apps\native\runtime\web"
$install = Join-Path $env:LOCALAPPDATA "Programs\SB Launcher"
$overlay = Join-Path $env:LOCALAPPDATA "SB Launcher\runtime-web"

function Stop-Launcher {
  Get-Process -Name "SB Launcher" -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 600
}

function Sync-Dir([string]$Source, [string]$Target) {
  if (-not (Test-Path $Source)) { return $false }
  New-Item $Target -ItemType Directory -Force | Out-Null
  Get-ChildItem $Target -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $Source "*") $Target -Recurse -Force
  return $true
}

if (-not (Test-Path (Join-Path $dist "index.html"))) {
  throw "Desktop dist missing. Run: pnpm --filter @sb/desktop build"
}

Stop-Launcher

# Keep every runtime\web copy identical to dist (installer source of truth).
foreach ($webTarget in @(
  $nativeRuntimeWeb,
  (Join-Path $release "runtime\web"),
  (Join-Path $install "runtime\web"),
  $overlay
)) {
  $parent = Split-Path $webTarget -Parent
  if (-not (Test-Path $parent)) { continue }
  if (Sync-Dir $dist $webTarget) {
    Write-Host "Deployed UI -> $webTarget"
  }
}

# Copy published EXE + Assets when available.
$exeSrc = Join-Path $release "SB Launcher.exe"
if ((Test-Path $exeSrc) -and (Test-Path $install)) {
  $exeDst = Join-Path $install "SB Launcher.exe"
  try {
    Copy-Item $exeSrc $exeDst -Force
    Write-Host "Deployed EXE -> $exeDst"
  } catch {
    Write-Warning "Could not replace EXE (still locked?): $($_.Exception.Message)"
  }

  $iconSrc = Join-Path $release "Assets\SBLauncher.ico"
  if (Test-Path $iconSrc) {
    $iconDir = Join-Path $install "Assets"
    New-Item $iconDir -ItemType Directory -Force | Out-Null
    Copy-Item $iconSrc (Join-Path $iconDir "SBLauncher.ico") -Force
  }

  $buildInfoSrc = Join-Path $release "runtime\build-info.json"
  if (-not (Test-Path $buildInfoSrc)) {
    $buildInfoSrc = Join-Path $root "apps\native\runtime\build-info.json"
  }
  if (Test-Path $buildInfoSrc) {
    $runtimeDir = Join-Path $install "runtime"
    New-Item $runtimeDir -ItemType Directory -Force | Out-Null
    Copy-Item $buildInfoSrc (Join-Path $runtimeDir "build-info.json") -Force
    Copy-Item $buildInfoSrc (Join-Path $overlay "build-info.json") -Force -ErrorAction SilentlyContinue
  }
}

# Force WebView2 to reload.
Remove-Item (Join-Path $env:LOCALAPPDATA "SB Launcher\web-bundle.txt") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA "SB Launcher\WebView2") -Recurse -Force -ErrorAction SilentlyContinue

# Next launch should treat this as the installed build.
$buildInfo = Join-Path $install "runtime\build-info.json"
if (Test-Path $buildInfo) {
  try {
    $id = (Get-Content $buildInfo -Raw | ConvertFrom-Json).buildId
    if ($id) {
      Set-Content (Join-Path $env:LOCALAPPDATA "SB Launcher\installed-build.txt") $id -NoNewline
      Write-Host "Marked installed-build: $id"
    }
  } catch {}
}

Write-Host "Deploy to install complete."
