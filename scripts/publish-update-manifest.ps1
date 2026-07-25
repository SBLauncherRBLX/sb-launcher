$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if ($env:SB_CLOUD_URL -and $env:SB_CLOUD_URL.Trim()) {
  $cloudUrl = $env:SB_CLOUD_URL.TrimEnd("/")
} else {
  $cloudUrl = "https://sb-launcher-cloud.sblauncherrblx.workers.dev"
}
$token = $env:SB_UPDATE_ADMIN_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Set SB_UPDATE_ADMIN_TOKEN to the Cloudflare Worker secret before publishing."
}

$buildInfoPath = Join-Path $root "release\native\runtime\build-info.json"
if (-not (Test-Path $buildInfoPath)) {
  $buildInfoPath = Join-Path $root "apps\native\runtime\build-info.json"
}
if (-not (Test-Path $buildInfoPath)) {
  throw "build-info.json not found. Run pnpm pack:win first."
}

$buildInfo = Get-Content $buildInfoPath -Raw | ConvertFrom-Json
$version = if ($buildInfo.version) { [string]$buildInfo.version } else { "2.3.2" }
$buildId = if ($buildInfo.buildId) { [string]$buildInfo.buildId } else { "" }

$notesFile = if ($env:SB_UPDATE_NOTES_FILE -and $env:SB_UPDATE_NOTES_FILE.Trim()) {
  $env:SB_UPDATE_NOTES_FILE.Trim()
} else {
  Join-Path $root "scripts\update-notes.txt"
}

if ($env:SB_UPDATE_NOTES) {
  $notes = [string]$env:SB_UPDATE_NOTES
} elseif (Test-Path $notesFile) {
  $notes = [System.IO.File]::ReadAllText($notesFile, [System.Text.Encoding]::UTF8).Trim()
} else {
  $notes = "SB Launcher $version"
}

$title = if ($env:SB_UPDATE_TITLE -and $env:SB_UPDATE_TITLE.Trim()) {
  $env:SB_UPDATE_TITLE.Trim()
} else {
  "SB Launcher $version"
}

$downloadUrl = if ($env:SB_UPDATE_DOWNLOAD_URL) {
  $env:SB_UPDATE_DOWNLOAD_URL
} else {
  "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/"
}

$bodyObj = [ordered]@{
  version     = $version
  buildId     = $buildId
  downloadUrl = $downloadUrl
  notes       = $notes
  title       = $title
  publishedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$body = $bodyObj | ConvertTo-Json -Compress -Depth 5

Write-Host "Publishing update manifest to $cloudUrl/v1/update"
Write-Host "  version=$version buildId=$buildId"
Write-Host "  title=$title"
Write-Host "  notesChars=$($notes.Length)"

$response = Invoke-RestMethod `
  -Method Put `
  -Uri "$cloudUrl/v1/update" `
  -Headers @{ Authorization = "Bearer $token"; Accept = "application/json" } `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

$response | ConvertTo-Json -Depth 5
Write-Host "Update manifest published."
