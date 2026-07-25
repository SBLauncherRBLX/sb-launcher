$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "apps\desktop\dist"
if (-not (Test-Path (Join-Path $dist "index.html"))) {
  throw "Desktop dist missing. Run: pnpm --filter @sb/desktop build"
}

# Running WebView2 locks runtime-web files; without this, index.html can stay stale
# while new hashed assets are only partially copied.
Get-Process "SB Launcher" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400

$targets = @(
  (Join-Path $env:LOCALAPPDATA "SB Launcher\runtime-web"),
  (Join-Path $root "apps\native\runtime\web"),
  (Join-Path $root "release\native\runtime\web"),
  (Join-Path $root "release\install-test\runtime\web"),
  (Join-Path $env:LOCALAPPDATA "Programs\SB Launcher\runtime\web")
)

function Sync-WebTo([string]$target) {
  $parent = Split-Path $target -Parent
  if (-not (Test-Path $parent)) { return $false }
  New-Item $target -ItemType Directory -Force | Out-Null
  Get-ChildItem $target -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $dist "*") $target -Recurse -Force

  $expected = Get-Content (Join-Path $dist "index.html") -Raw
  $actual = Get-Content (Join-Path $target "index.html") -Raw -ErrorAction SilentlyContinue
  if ($actual -ne $expected) {
    throw "Failed to sync index.html into $target (file may still be locked)."
  }

  $indexPath = Join-Path $target "index.html"
  $hash = (Get-FileHash -Algorithm SHA256 -Path $indexPath).Hash.ToLowerInvariant()
  Set-Content -Path (Join-Path $target "integrity.sha256") -Value $hash -NoNewline -Encoding ascii
  return $true
}

$synced = @()
foreach ($target in $targets) {
  if (Sync-WebTo $target) {
    $synced += $target
    Write-Host "Synced UI -> $target"
  }
}

# Keep build-info next to every web root when available so upgrades detect the UI build.
$buildInfoCandidates = @(
  (Join-Path $root "apps\native\runtime\build-info.json"),
  (Join-Path $root "release\native\runtime\build-info.json")
)
$buildInfo = $buildInfoCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($buildInfo) {
  foreach ($target in $synced) {
    $webInfo = Join-Path $target "build-info.json"
    if ((Resolve-Path $buildInfo).Path -ne (Join-Path (Resolve-Path $target).Path "build-info.json")) {
      Copy-Item $buildInfo $webInfo -Force
    }
    $runtimeParent = Split-Path $target -Parent
    if ((Split-Path $target -Leaf) -eq "web" -and (Split-Path $runtimeParent -Leaf) -eq "runtime") {
      $runtimeInfo = Join-Path $runtimeParent "build-info.json"
      $srcFull = (Resolve-Path $buildInfo).Path
      $dstFull = $runtimeInfo
      if ($srcFull -ne $dstFull) {
        Copy-Item $buildInfo $runtimeInfo -Force
      }
    }
  }
}

# Force WebView2 to reload the new index.html hash on next launch.
$marker = Join-Path $env:LOCALAPPDATA "SB Launcher\web-bundle.txt"
$wv = Join-Path $env:LOCALAPPDATA "SB Launcher\WebView2"
Remove-Item $marker -Force -ErrorAction SilentlyContinue
Remove-Item $wv -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleared WebView2 cache markers."

if ($synced.Count -eq 0) {
  throw "No UI sync targets were available."
}

Write-Host "UI sync complete ($($synced.Count) targets)."
