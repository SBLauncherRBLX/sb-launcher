$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$setup = Get-ChildItem (Join-Path $root "release") -Filter "SB-Launcher-Setup-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) { throw "No Setup exe in release/. Run pnpm pack:win first." }

$partsDir = Join-Path $root "docs\site\downloads\parts"
$uploadDir = Join-Path $root "docs\site\pages-upload"
New-Item $partsDir -ItemType Directory -Force | Out-Null
New-Item $uploadDir -ItemType Directory -Force | Out-Null
Get-ChildItem $partsDir -Filter "setup.part*.bin" -ErrorAction SilentlyContinue | Remove-Item -Force

$chunk = 20MB
$bytes = [System.IO.File]::ReadAllBytes($setup.FullName)
$total = $bytes.Length
$partNames = New-Object System.Collections.Generic.List[string]
$partHashes = New-Object System.Collections.Generic.List[string]
$index = 1
$offset = 0
while ($offset -lt $total) {
  $len = [Math]::Min($chunk, $total - $offset)
  $name = "setup.part{0:D2}.bin" -f $index
  $path = Join-Path $partsDir $name
  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $fs.Write($bytes, $offset, $len)
  $fs.Close()
  $partNames.Add($name) | Out-Null
  $partHashes.Add((Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()) | Out-Null
  $offset += $len
  $index++
}

$sha256 = (Get-FileHash -Algorithm SHA256 -Path $setup.FullName).Hash.ToLowerInvariant()
$version = if ($setup.BaseName -match "(\d+\.\d+\.\d+)$") { $Matches[1] } else { "0.0.0" }

$manifestObj = [ordered]@{
  fileName   = $setup.Name
  parts      = @($partNames)
  partSha256 = @($partHashes)
  version    = $version
  totalBytes = $total
  sha256     = $sha256
}
$manifestJson = $manifestObj | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $partsDir "manifest.json"), $manifestJson, $utf8NoBom)

# Refresh site copy (must read/write UTF-8 so fancy punctuation is not corrupted)
$siteIndex = Join-Path $root "docs\site\index.html"
if (Test-Path $siteIndex) {
  $text = [System.IO.File]::ReadAllText($siteIndex, [System.Text.Encoding]::UTF8)
  $text = $text -replace "Version \d+\.\d+\.\d+", "Version $version"
  $text = $text -replace "SB Launcher \d+\.\d+\.\d+", "SB Launcher $version"
  $text = $text -replace "Setup \d+\.\d+\.\d+", "Setup $version"
  $text = $text -replace "Get SB Launcher \d+\.\d+\.\d+", "Get SB Launcher $version"
  [System.IO.File]::WriteAllText($siteIndex, $text, $utf8NoBom)
}

Copy-Item (Join-Path $partsDir "manifest.json") (Join-Path $uploadDir "manifest.json") -Force
Copy-Item (Join-Path $root "docs\site\download.js") (Join-Path $uploadDir "download.js") -Force
Copy-Item (Join-Path $root "docs\site\index.html") (Join-Path $uploadDir "index.html") -Force
Copy-Item (Join-Path $root "docs\site\styles.css") (Join-Path $uploadDir "styles.css") -Force
if (Test-Path (Join-Path $root "docs\site\logo.png")) {
  Copy-Item (Join-Path $root "docs\site\logo.png") (Join-Path $uploadDir "logo.png") -Force
}
foreach ($page in @("privacy.html", "terms.html")) {
  $src = Join-Path $root "docs\site\$page"
  if (Test-Path $src) { Copy-Item $src (Join-Path $uploadDir $page) -Force }
}
Get-ChildItem $partsDir -Filter "setup.part*.bin" | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $uploadDir $_.Name) -Force
}

Write-Host "Pages upload ready: $uploadDir"
Write-Host "  file=$($setup.Name) sha256=$sha256 parts=$($partNames.Count)"
Get-Content (Join-Path $uploadDir "manifest.json")
