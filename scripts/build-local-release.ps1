$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseFolder = Join-Path $projectRoot "release\SB-Launcher-3.5.1"
Push-Location $projectRoot
try {
  if (Test-Path (Join-Path $releaseFolder "private-demo.flag")) { throw "Release folder contains a demo marker" }
  # Deliberately bypass the normal build/deploy scripts: they update the installed stable app.
  pnpm --filter @sb/desktop typecheck
  if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
  pnpm --filter @sb/desktop exec vite build
  if ($LASTEXITCODE -ne 0) { throw "UI build failed" }
  dotnet publish apps/native/SBLauncher.Native.csproj -c Release -r win-x64 --self-contained true -p:Version=3.5.1 -p:AssemblyVersion=3.5.1.0 -p:FileVersion=3.5.1.0 -o $releaseFolder
  if ($LASTEXITCODE -ne 0) { throw "Native build failed" }
  $releaseWeb = [IO.Path]::GetFullPath((Join-Path $releaseFolder "runtime\web"))
  $allowedRoot = [IO.Path]::GetFullPath($releaseFolder) + [IO.Path]::DirectorySeparatorChar
  if (-not $releaseWeb.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe output path" }
  if (Test-Path -LiteralPath $releaseWeb) { Remove-Item -LiteralPath $releaseWeb -Recurse -Force }
  New-Item -ItemType Directory -Path $releaseWeb -Force | Out-Null
  Copy-Item (Join-Path $projectRoot "apps\desktop\dist\*") $releaseWeb -Recurse -Force
  # Rebuild API code, reuse the already packaged dependency tree and Node runtime.
  pnpm exec esbuild apps/api/src/index.ts --bundle --platform=node --target=node22 --format=cjs --minify --external:@prisma/client --external:@prisma/adapter-libsql --external:@libsql/client "--outfile=$releaseFolder/runtime/api/index.cjs"
  if ($LASTEXITCODE -ne 0) { throw "API build failed" }
  $buildInfo = @{ version="3.5.1"; channel="stable"; buildId=(Get-Date -Format "yyyyMMddHHmmss"); builtAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  $utf8 = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText((Join-Path $releaseFolder "runtime\build-info.json"), $buildInfo, $utf8)
  [IO.File]::WriteAllText((Join-Path $releaseWeb "build-info.json"), $buildInfo, $utf8)
  $hash = (Get-FileHash -LiteralPath (Join-Path $releaseWeb "index.html") -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $releaseWeb "integrity.sha256"), $hash)
  Copy-Item (Join-Path $projectRoot "apps\native\Assets\SBLauncher.ico") (Join-Path $releaseFolder "Assets\SBLauncher.ico") -Force
  Copy-Item (Join-Path $PSScriptRoot "release-readme.txt") (Join-Path $releaseFolder "README.txt") -Force
  Copy-Item (Join-Path $projectRoot "apps\desktop\src\assets\material-symbols\LICENSE.txt") (Join-Path $releaseFolder "Assets\Material-Symbols-LICENSE.txt") -Force
  $iscc = @((Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),(Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),(Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")) | Where-Object {Test-Path $_} | Select-Object -First 1
  if ($iscc) {
    & $iscc "/Q" "/DMyAppSource=$releaseFolder" (Join-Path $projectRoot "installer\SBLauncher.iss")
    if ($LASTEXITCODE -ne 0) {throw "Installer build failed"}
  } else { Write-Warning "Inno Setup is not installed; unpacked release is ready." }
  Write-Host "Local release ready: $releaseFolder\SB Launcher.exe"
} finally { Pop-Location }
