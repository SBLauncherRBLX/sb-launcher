$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root "apps\native"
$runtime = Join-Path $native "runtime"
$apiRuntime = Join-Path $runtime "api"
$webRuntime = Join-Path $runtime "web"
$release = Join-Path $root "release\native"

function Get-FolderSizeMB([string]$Path) {
  if (-not (Test-Path $Path)) { return 0 }
  $sum = (Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum
  if ($null -eq $sum) { return 0 }
  return [math]::Round($sum / 1MB, 2)
}

function Remove-HeavyJunk([string]$RootPath) {
  if (-not (Test-Path $RootPath)) { return }
  $patterns = @(
    "*.md", "*.markdown", "*.map", "*.ts", "*.tsx", "*.flow", "*.d.mts",
    "LICENSE*", "CHANGELOG*", "HISTORY*", "NOTICE*", "README*",
    ".DS_Store", "Thumbs.db"
  )
  foreach ($pattern in $patterns) {
    Get-ChildItem $RootPath -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
  $dirs = @(
    ".cache", "docs", "doc", "examples", "example", "test", "tests",
    "__tests__", "coverage", ".github", "man", "website"
  )
  foreach ($name in $dirs) {
    Get-ChildItem $RootPath -Recurse -Force -Directory -Filter $name -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Get-BundledNodeExe {
  param([string]$RootPath)
  $nodeCache = Join-Path $RootPath ".cache\node-win-x64"
  $nodeExe = Join-Path $nodeCache "node.exe"
  if (-not (Test-Path $nodeExe)) {
    $nodeVersion = "22.14.0"
    $nodeZip = Join-Path $nodeCache "node-v$nodeVersion-win-x64.zip"
    New-Item $nodeCache -ItemType Directory -Force | Out-Null
    if (-not (Test-Path $nodeZip)) {
      Write-Host "Downloading Node.js v$nodeVersion win-x64"
      Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip" -OutFile $nodeZip
    }
    $sumsUrl = "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt"
    $sums = Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing
    $expectedLine = ($sums.Content -split "`n" | Where-Object { $_ -match "node-v$nodeVersion-win-x64\.zip$" } | Select-Object -First 1)
    if (-not $expectedLine) { throw "Could not find Node SHASUM for win-x64 zip." }
    $expectedHash = ($expectedLine -split "\s+")[0].Trim().ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -Path $nodeZip).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      Remove-Item $nodeZip -Force -ErrorAction SilentlyContinue
      throw "Node.js zip SHA-256 mismatch (got $actualHash, expected $expectedHash)."
    }
    Expand-Archive $nodeZip (Join-Path $nodeCache "extract") -Force
    Copy-Item (Join-Path $nodeCache "extract\node-v$nodeVersion-win-x64\node.exe") $nodeExe -Force
  }
  return $nodeExe
}

Write-Host "[1/9] Cleaning native runtime"
Remove-Item $runtime -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $release -Recurse -Force -ErrorAction SilentlyContinue
New-Item $apiRuntime -ItemType Directory -Force | Out-Null
New-Item $webRuntime -ItemType Directory -Force | Out-Null

Write-Host "[2/9] Building React interface"
Push-Location $root
pnpm --filter @sb/desktop build
if ($LASTEXITCODE -ne 0) { throw "Web interface build failed." }
Remove-Item "$webRuntime\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root "apps\desktop\dist\*") $webRuntime -Recurse -Force

$buildId = Get-Date -Format "yyyyMMddHHmmss"
$buildInfo = @{
  version = "2.3.7"
  buildId = $buildId
  builtAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Compress
$buildInfoPath = Join-Path $runtime "build-info.json"
[System.IO.File]::WriteAllText($buildInfoPath, $buildInfo, [System.Text.UTF8Encoding]::new($false))
Copy-Item $buildInfoPath (Join-Path $webRuntime "build-info.json") -Force
$webIndex = Join-Path $webRuntime "index.html"
$webHash = (Get-FileHash -Algorithm SHA256 -Path $webIndex).Hash.ToLowerInvariant()
Set-Content -Path (Join-Path $webRuntime "integrity.sha256") -Value $webHash -NoNewline -Encoding ascii
Write-Host "Build ID: $buildId"

Write-Host "[3/9] Bundling local API"
pnpm exec esbuild "apps/api/src/index.ts" `
  --bundle `
  --platform=node `
  --target=node22 `
  --format=cjs `
  --minify `
  --external:@prisma/client `
  --external:@prisma/adapter-libsql `
  --external:@libsql/client `
  --outfile="$apiRuntime/index.cjs"
if ($LASTEXITCODE -ne 0) { throw "API bundle failed." }

Copy-Item (Join-Path $root "apps\api\prisma\schema.prisma") $apiRuntime -Force
Copy-Item (Join-Path $root "apps\api\prisma\dev.db") (Join-Path $apiRuntime "template.db") -Force

$runtimePackageJson = @'
{
  "name": "sb-launcher-native-api",
  "private": true,
  "type": "commonjs",
  "dependencies": {
    "@prisma/adapter-libsql": "6.19.3",
    "@prisma/client": "6.19.3",
    "@libsql/client": "0.14.0"
  },
  "devDependencies": {
    "prisma": "6.19.3"
  }
}
'@
[System.IO.File]::WriteAllText(
  (Join-Path $apiRuntime "package.json"),
  $runtimePackageJson,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "[4/9] Installing slim Prisma client"
Push-Location $apiRuntime
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"
$env:PRISMA_SKIP_POSTINSTALL_GENERATE = "1"
npm install --omit=dev --package-lock-only
if ($LASTEXITCODE -ne 0) { throw "Prisma lockfile generation failed." }
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw "Prisma client install failed." }
npm install --no-save prisma@6.19.3
if ($LASTEXITCODE -ne 0) { throw "Prisma CLI install failed." }
npx prisma generate --schema schema.prisma
if ($LASTEXITCODE -ne 0) { throw "Prisma client generation failed." }

Write-Host "[5/9] Pruning Prisma runtime weight"
# Only remove known-safe bulk. Keep the full dependency tree so the
# API runs outside this monorepo (friends / Program Files install).
@(
  "node_modules\prisma",
  "node_modules\@prisma\engines",
  "node_modules\.cache"
) | ForEach-Object {
  $target = Join-Path $apiRuntime $_
  if (Test-Path $target) {
    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Non-Windows native bindings are dead weight on this build.
Get-ChildItem (Join-Path $apiRuntime "node_modules") -Recurse -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(darwin|linux|android|win32-ia32|win32-arm64|freebsd)' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem $apiRuntime -Recurse -Directory -Filter "lib-esm" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$adapterDist = Join-Path $apiRuntime "node_modules\@prisma\adapter-libsql\dist"
if (Test-Path $adapterDist) {
  Get-ChildItem $adapterDist -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'web|\.mjs$' } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

Remove-HeavyJunk $apiRuntime
# Drop package metadata we do not need at runtime.
Remove-Item (Join-Path $apiRuntime "package-lock.json") -Force -ErrorAction SilentlyContinue
$slimPackageJson = @'
{
  "name": "sb-launcher-native-api",
  "private": true,
  "type": "commonjs",
  "dependencies": {
    "@prisma/adapter-libsql": "6.19.3",
    "@prisma/client": "6.19.3",
    "@libsql/client": "0.14.0"
  }
}
'@
[System.IO.File]::WriteAllText(
  (Join-Path $apiRuntime "package.json"),
  $slimPackageJson,
  [System.Text.UTF8Encoding]::new($false)
)
Pop-Location

Write-Host "[6/9] Adding private Node runtime"
$nodeExe = Get-BundledNodeExe $root
Copy-Item $nodeExe (Join-Path $runtime "node.exe") -Force
Remove-HeavyJunk $webRuntime

Write-Host "[6.5/9] Regenerating application icon"
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "make-app-icon.ps1")
if ($LASTEXITCODE -ne 0) { throw "Application icon generation failed." }
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "make-installer-art.ps1")
if ($LASTEXITCODE -ne 0) { throw "Installer art generation failed." }

Write-Host "[7/9] Publishing native Windows executable"
dotnet publish (Join-Path $native "SBLauncher.Native.csproj") `
  -c Release `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true `
  -p:PublishReadyToRun=false `
  -p:DebugType=None `
  -p:DebugSymbols=false `
  -o $release
if ($LASTEXITCODE -ne 0) { throw "Native publish failed." }

# Force-packaged runtime (do not rely on PreserveNewest alone — stale publish folders
# previously shipped old UI inside the installer).
Write-Host "Refreshing packaged runtime next to published EXE"
$releaseRuntime = Join-Path $release "runtime"
New-Item $releaseRuntime -ItemType Directory -Force | Out-Null
Remove-Item (Join-Path $releaseRuntime "*") -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $runtime "*") $releaseRuntime -Recurse -Force

# Ensure desktop/installer icon file is next to the EXE (shortcuts reference it).
$iconSrc = Join-Path $native "Assets\SBLauncher.ico"
$iconDir = Join-Path $release "Assets"
$iconDst = Join-Path $iconDir "SBLauncher.ico"
if (-not (Test-Path $iconSrc)) { throw "Missing application icon: $iconSrc" }
New-Item $iconDir -ItemType Directory -Force | Out-Null
Copy-Item $iconSrc $iconDst -Force

Remove-HeavyJunk $release
# Drop leftover PDBs / XML docs if any slipped through.
Get-ChildItem $release -Recurse -Include *.pdb,*.xml -File -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[8/9] Creating portable package"
$zip = Join-Path $root "release\SB-Launcher-Native-2.3.7-win-x64.zip"
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $release "*") -DestinationPath $zip -CompressionLevel Optimal
Pop-Location

Write-Host "[9/9] Creating Windows installer"
$isccCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
  (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
  & $iscc (Join-Path $root "installer\SBLauncher.iss")
  if ($LASTEXITCODE -ne 0) { throw "Windows installer build failed." }
} else {
  Write-Warning "Inno Setup was not found; portable EXE package is still available."
}

$installTest = Join-Path $root "release\install-test"
if (Test-Path $installTest) {
  Write-Host "Refreshing install-test preview folder"
  foreach ($relative in @("runtime\web", "runtime\api\index.cjs", "runtime\build-info.json", "SB Launcher.exe", "Assets")) {
    $source = Join-Path $release $relative
    $target = Join-Path $installTest $relative
    if (-not (Test-Path $source)) { continue }
    if ((Get-Item $source).PSIsContainer) {
      if (Test-Path $target) { Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue }
      Copy-Item $source $target -Recurse -Force
    } else {
      $targetDir = Split-Path $target -Parent
      if (-not (Test-Path $targetDir)) { New-Item $targetDir -ItemType Directory -Force | Out-Null }
      try {
        Copy-Item $source $target -Force
      } catch {
        Write-Warning "Could not refresh $relative (file may be in use): $($_.Exception.Message)"
      }
    }
  }
}

Write-Host "[final] Syncing live UI overlay + deploying into installed app"
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-web-runtime.ps1")
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "deploy-to-install.ps1")

$totalMb = Get-FolderSizeMB $release
$apiMb = Get-FolderSizeMB (Join-Path $release "runtime\api")
$webMb = Get-FolderSizeMB (Join-Path $release "runtime\web")
$exeItem = Get-Item (Join-Path $release "SB Launcher.exe") -ErrorAction SilentlyContinue
$exeMb = if ($exeItem) { [math]::Round($exeItem.Length / 1MB, 2) } else { 0 }
$nodeItem = Get-Item (Join-Path $release "runtime\node.exe") -ErrorAction SilentlyContinue
$nodeMb = if ($nodeItem) { [math]::Round($nodeItem.Length / 1MB, 2) } else { 0 }

Write-Host ""
Write-Host "Native executable: $release\SB Launcher.exe"
Write-Host "Portable package:  $zip"
Write-Host "Windows installer:  $root\release\SB-Launcher-Setup-2.3.7.exe"
Write-Host ("Size total={0} MB | exe={1} MB | node={2} MB | api={3} MB | web={4} MB" -f $totalMb, $exeMb, $nodeMb, $apiMb, $webMb)
