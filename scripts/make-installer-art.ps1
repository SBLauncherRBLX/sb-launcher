$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "installer\assets"
New-Item $assets -ItemType Directory -Force | Out-Null

$logoPath = Join-Path $root "apps\desktop\src\assets\sb-logo.png"
$logo = [System.Drawing.Image]::FromFile($logoPath)

$bgTop = [System.Drawing.Color]::FromArgb(84, 60, 130)
$bgMid = [System.Drawing.Color]::FromArgb(29, 27, 32)
$bgBottom = [System.Drawing.Color]::FromArgb(20, 18, 24)
$accent = [System.Drawing.Color]::FromArgb(154, 130, 219)

function New-Banner([int]$w, [int]$h, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect, $bgMid, $bgBottom, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()

  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddEllipse([single](-0.45 * $w), [single](-0.4 * $h), [single](1.8 * $w), [single](1.05 * $h))
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp)
  $pgb.CenterColor = [System.Drawing.Color]::FromArgb(150, $bgTop)
  $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $bgTop))
  $g.FillPath($pgb, $gp)
  $pgb.Dispose(); $gp.Dispose()

  $gp2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp2.AddEllipse([single](0.08 * $w), [single](0.08 * $h), [single](0.84 * $w), [single](0.4 * $h))
  $pgb2 = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp2)
  $pgb2.CenterColor = [System.Drawing.Color]::FromArgb(80, $accent)
  $pgb2.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $accent))
  $g.FillPath($pgb2, $gp2)
  $pgb2.Dispose(); $gp2.Dispose()

  $ls = [int]($w * 0.52)
  $g.DrawImage($logo, [int](($w - $ls) / 2), [int]($h * 0.18), $ls, $ls)

  $font = New-Object System.Drawing.Font("Segoe UI Semibold", [single]([math]::Max(12, $w / 12.5)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 225, 229))
  $g.DrawString("SB Launcher", $font, $textBrush, ($w / 2), [single]($h * 0.78), $sf)

  $font.Dispose(); $textBrush.Dispose(); $sf.Dispose()
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

function New-SmallImage([int]$w, [int]$h, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect, $bgMid, $bgBottom, [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()
  $pad = [int]($w * 0.1)
  $g.DrawImage($logo, $pad, $pad, ($w - 2 * $pad), ($h - 2 * $pad))
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

New-Banner 164 314 (Join-Path $assets "wizard-banner.bmp")
New-Banner 328 628 (Join-Path $assets "wizard-banner-200.bmp")
New-SmallImage 55 58 (Join-Path $assets "wizard-small.bmp")
New-SmallImage 110 116 (Join-Path $assets "wizard-small-200.bmp")
$logo.Dispose()
Write-Host "Installer art updated."
