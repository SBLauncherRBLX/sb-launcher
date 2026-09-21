param([ValidateSet("SB-Launcher-3.4.3-demo", "SB-Launcher-3.4.3-local")][string]$OutputName = "SB-Launcher-3.4.3-demo")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$demoFolder = Join-Path $projectRoot ("release\" + $OutputName)
Push-Location $projectRoot
try {
  # Deliberately bypass the normal build/deploy scripts: they update the installed stable app.
  pnpm --filter @sb/desktop typecheck
  if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
  pnpm --filter @sb/desktop exec vite build
  if ($LASTEXITCODE -ne 0) { throw "UI build failed" }
  dotnet publish apps/native/SBLauncher.Native.csproj -c Release -r win-x64 --self-contained true -p:Version=3.4.3-demo -p:AssemblyVersion=3.4.3.0 -p:FileVersion=3.4.3.0 -o $demoFolder
  if ($LASTEXITCODE -ne 0) { throw "Native build failed" }
  $demoWeb = [IO.Path]::GetFullPath((Join-Path $demoFolder "runtime\web"))
  $allowedRoot = [IO.Path]::GetFullPath($demoFolder) + [IO.Path]::DirectorySeparatorChar
  if (-not $demoWeb.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe output path" }
  if (Test-Path -LiteralPath $demoWeb) { Remove-Item -LiteralPath $demoWeb -Recurse -Force }
  New-Item -ItemType Directory -Path $demoWeb -Force | Out-Null
  Copy-Item (Join-Path $projectRoot "apps\desktop\dist\*") $demoWeb -Recurse -Force
  # Rebuild API code, reuse the already packaged dependency tree and Node runtime.
  pnpm exec esbuild apps/api/src/index.ts --bundle --platform=node --target=node22 --format=cjs --minify --external:@prisma/client --external:@prisma/adapter-libsql --external:@libsql/client "--outfile=$demoFolder/runtime/api/index.cjs"
  if ($LASTEXITCODE -ne 0) { throw "API build failed" }
  $buildInfo = @{ version="3.4.3-demo"; channel="private-demo"; buildId=(Get-Date -Format "yyyyMMddHHmmss"); builtAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  $utf8 = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText((Join-Path $demoFolder "runtime\build-info.json"), $buildInfo, $utf8)
  [IO.File]::WriteAllText((Join-Path $demoWeb "build-info.json"), $buildInfo, $utf8)
  $hash = (Get-FileHash -LiteralPath (Join-Path $demoWeb "index.html") -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $demoWeb "integrity.sha256"), $hash)
  [IO.File]::WriteAllText((Join-Path $demoFolder "private-demo.flag"), "3.4.3-demo")
  Copy-Item (Join-Path $projectRoot "apps\native\Assets\SBLauncher.ico") (Join-Path $demoFolder "Assets\SBLauncher.ico") -Force
  Copy-Item (Join-Path $PSScriptRoot "demo-readme.txt") (Join-Path $demoFolder "README.txt") -Force
  Copy-Item (Join-Path $projectRoot "apps\desktop\src\assets\material-symbols\LICENSE.txt") (Join-Path $demoFolder "Assets\Material-Symbols-LICENSE.txt") -Force
  Write-Host "Private demo ready: $demoFolder\SB Launcher.exe"
} finally { Pop-Location }
