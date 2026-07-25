$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$pngPath = (Join-Path $root "apps\desktop\src\assets\sb-logo.png")
$icoPath = Join-Path $root "apps\native\Assets\SBLauncher.ico"
$pngCopy = Join-Path $root "apps\native\Assets\SBLauncher.png"
$uiCopy = Join-Path $root "packages\ui\src\assets\sb-logo.png"

if (-not (Test-Path $pngPath)) { throw "Logo source not found: $pngPath" }

Copy-Item -Force $pngPath $pngCopy
$uiDir = Split-Path $uiCopy -Parent
if (-not (Test-Path $uiDir)) { New-Item $uiDir -ItemType Directory -Force | Out-Null }
Copy-Item -Force $pngPath $uiCopy

$png = [System.Drawing.Image]::FromFile($pngPath)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]

foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($png, 0, 0, $s, $s)
  $g.Dispose()
  $images.Add($bmp) | Out-Null
}

$icoStream = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $icoStream
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$images.Count)

$payloads = New-Object System.Collections.Generic.List[byte[]]
$offset = 6 + (16 * $images.Count)
for ($i = 0; $i -lt $images.Count; $i++) {
  $imgMs = New-Object System.IO.MemoryStream
  $images[$i].Save($imgMs, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $imgMs.ToArray()
  $payloads.Add($bytes) | Out-Null
  $s = $sizes[$i]
  $dim = 0
  if ($s -lt 256) { $dim = $s }
  $bw.Write([byte]$dim)
  $bw.Write([byte]$dim)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$bytes.Length)
  $bw.Write([uint32]$offset)
  $offset += $bytes.Length
  $imgMs.Dispose()
}
foreach ($p in $payloads) { $bw.Write($p) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $icoStream.ToArray())
$bw.Dispose(); $icoStream.Dispose(); $png.Dispose()
foreach ($img in $images) { $img.Dispose() }

Write-Host "Wrote $icoPath ($((Get-Item $icoPath).Length) bytes)"
