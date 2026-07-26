using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Threading;

namespace SBLauncher.Native;

/// <summary>
/// Downloads the Setup package (GitHub Pages parts or direct .exe), verifies SHA-256,
/// then hands off to a helper script that runs Inno Setup silently and relaunches.
/// </summary>
internal sealed class Updater
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(30),
        DefaultRequestVersion = new Version(2, 0),
    };

    private static readonly HashSet<string> AllowedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "sblauncherrblx.github.io",
        "github.com",
        "raw.githubusercontent.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    };

    private readonly Action<string> _log;
    private readonly Action<JsonObject> _push;
    private readonly Dispatcher _dispatcher;
    private CancellationTokenSource? _cts;
    private bool _busy;

    public Updater(Action<string> log, Action<JsonObject> push, Dispatcher dispatcher)
    {
        _log = log;
        _push = push;
        _dispatcher = dispatcher;
    }

    public bool IsBusy => _busy;

    public void Cancel()
    {
        try { _cts?.Cancel(); } catch { /* ignore */ }
    }

    public async Task StartAsync(string downloadUrl, string version, bool keepPresets)
    {
        if (_busy)
            throw new InvalidOperationException("An update is already in progress.");

        _busy = true;
        _cts?.Dispose();
        _cts = new CancellationTokenSource();
        var token = _cts.Token;

        try
        {
            Report("preparing", 0, "Preparing update…");
            var staging = Path.Combine(Path.GetTempPath(), "SBLauncher-Update");
            Directory.CreateDirectory(staging);
            foreach (var stale in Directory.EnumerateFiles(staging, "SB-Launcher-Setup-*.exe"))
            {
                try { File.Delete(stale); } catch { /* ignore */ }
            }

            var setupPath = await DownloadSetupAsync(downloadUrl, version, staging, token);
            token.ThrowIfCancellationRequested();

            Report("verifying", 0.97, "Installer verified.");
            if (!keepPresets)
            {
                Report("preparing", 0.98, "Resetting presets…");
                WipePresets();
            }

            Report("installing", 1, "Installing update…");
            LaunchApplyHelper(setupPath, AppContext.BaseDirectory.TrimEnd('\\', '/'));
            _log($"Update helper launched for {setupPath}");

            await _dispatcher.InvokeAsync(() =>
            {
                Application.Current.Shutdown();
            });
        }
        catch (OperationCanceledException)
        {
            Report("cancelled", 0, "Update cancelled.");
            throw;
        }
        catch (Exception ex)
        {
            _log($"Update failed: {ex}");
            Report("error", 0, ex.Message);
            throw;
        }
        finally
        {
            _busy = false;
        }
    }

    private async Task<string> DownloadSetupAsync(
        string downloadUrl,
        string version,
        string staging,
        CancellationToken token)
    {
        var url = (downloadUrl ?? "").Trim();
        if (string.IsNullOrWhiteSpace(url))
            url = "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/";

        if (!IsAllowedUrl(url))
            throw new InvalidOperationException("Download URL is not on the allowlist.");

        // Direct Setup.exe (e.g. GitHub Releases asset).
        if (url.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(new Uri(url).AbsolutePath);
            if (string.IsNullOrWhiteSpace(name))
                name = $"SB-Launcher-Setup-{version}.exe";
            var dest = Path.Combine(staging, name);
            await DownloadFileAsync(url, dest, token, startFraction: 0, endFraction: 0.95);
            return dest;
        }

        // GitHub Pages parts (same protocol as docs/site/download.js).
        try
        {
            return await DownloadFromPagesPartsAsync(url, version, staging, token);
        }
        catch (Exception partsEx) when (!token.IsCancellationRequested)
        {
            _log($"Parts download failed ({partsEx.Message}); trying GitHub Release…");
            var releaseUrl =
                $"https://github.com/SBLauncherRBLX/sb-launcher/releases/download/v{version}/SB-Launcher-Setup-{version}.exe";
            if (!IsAllowedUrl(releaseUrl))
                throw;
            var dest = Path.Combine(staging, $"SB-Launcher-Setup-{version}.exe");
            await DownloadFileAsync(releaseUrl, dest, token, startFraction: 0, endFraction: 0.95);
            return dest;
        }
    }

    private async Task<string> DownloadFromPagesPartsAsync(
        string pageUrl,
        string version,
        string staging,
        CancellationToken token)
    {
        var bases = BuildPartsBases(pageUrl);
        JsonObject? manifest = null;
        string partsBase = bases[0];

        foreach (var candidate in bases)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                var manifestUrl = candidate.TrimEnd('/') + "/manifest.json";
                Report("downloading", 0.02, "Fetching update manifest…");
                using var response = await Http.GetAsync(manifestUrl, token);
                if (!response.IsSuccessStatusCode) continue;
                var text = await response.Content.ReadAsStringAsync(token);
                manifest = JsonNode.Parse(text)?.AsObject();
                if (manifest is not null)
                {
                    partsBase = candidate.TrimEnd('/') + "/";
                    break;
                }
            }
            catch
            {
                // try next base
            }
        }

        if (manifest is null)
            throw new InvalidOperationException("Could not find update manifest on the download site.");

        var fileName = manifest["fileName"]?.GetValue<string>() ?? $"SB-Launcher-Setup-{version}.exe";
        var expectedSha = manifest["sha256"]?.GetValue<string>()?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrWhiteSpace(expectedSha))
            throw new InvalidOperationException("Manifest is missing sha256.");

        var parts = manifest["parts"]?.AsArray()
            ?? throw new InvalidOperationException("Manifest has no parts list.");
        var partHashes = manifest["partSha256"]?.AsArray();
        var totalBytes = manifest["totalBytes"]?.GetValue<long>() ?? 0;

        var dest = Path.Combine(staging, fileName);
        await using var output = new FileStream(
            dest, FileMode.Create, FileAccess.Write, FileShare.None, 1024 * 128, useAsync: true);

        long written = 0;
        for (var i = 0; i < parts.Count; i++)
        {
            token.ThrowIfCancellationRequested();
            var partName = parts[i]?.GetValue<string>()
                ?? throw new InvalidOperationException($"Invalid part name at index {i}.");
            var partUrl = partsBase + partName;
            Report(
                "downloading",
                0.05 + 0.85 * (i / (double)Math.Max(parts.Count, 1)),
                $"Downloading part {i + 1} of {parts.Count}…");

            using var response = await Http.GetAsync(
                partUrl, HttpCompletionOption.ResponseHeadersRead, token);
            response.EnsureSuccessStatusCode();
            var bytes = await response.Content.ReadAsByteArrayAsync(token);

            if (partHashes is not null && i < partHashes.Count)
            {
                var expectedPart = partHashes[i]?.GetValue<string>()?.Trim().ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(expectedPart))
                {
                    var actualPart = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
                    if (!string.Equals(actualPart, expectedPart, StringComparison.Ordinal))
                        throw new InvalidOperationException($"Integrity check failed for {partName}.");
                }
            }

            await output.WriteAsync(bytes, token);
            written += bytes.Length;
            var fraction = totalBytes > 0
                ? 0.05 + 0.85 * (written / (double)totalBytes)
                : 0.05 + 0.85 * ((i + 1) / (double)parts.Count);
            Report("downloading", Math.Min(0.92, fraction), $"Downloading part {i + 1} of {parts.Count}…");
        }

        await output.FlushAsync(token);
        output.Close();

        if (totalBytes > 0 && written != totalBytes)
            throw new InvalidOperationException($"Size mismatch ({written} vs {totalBytes}).");

        Report("verifying", 0.94, "Verifying installer…");
        var actualSha = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(dest, token)))
            .ToLowerInvariant();
        if (!string.Equals(actualSha, expectedSha, StringComparison.Ordinal))
            throw new InvalidOperationException("Installer SHA-256 mismatch. Download aborted.");

        return dest;
    }

    private async Task DownloadFileAsync(
        string url,
        string dest,
        CancellationToken token,
        double startFraction,
        double endFraction)
    {
        Report("downloading", startFraction, "Downloading installer…");
        using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
        response.EnsureSuccessStatusCode();
        var total = response.Content.Headers.ContentLength ?? 0;
        await using var input = await response.Content.ReadAsStreamAsync(token);
        await using var output = new FileStream(
            dest, FileMode.Create, FileAccess.Write, FileShare.None, 1024 * 128, useAsync: true);

        var buffer = new byte[1024 * 128];
        long written = 0;
        int read;
        while ((read = await input.ReadAsync(buffer.AsMemory(0, buffer.Length), token)) > 0)
        {
            await output.WriteAsync(buffer.AsMemory(0, read), token);
            written += read;
            var t = total > 0 ? written / (double)total : 0.5;
            Report(
                "downloading",
                startFraction + (endFraction - startFraction) * t,
                total > 0
                    ? $"Downloading… {FormatBytes(written)} / {FormatBytes(total)}"
                    : $"Downloading… {FormatBytes(written)}");
        }
    }

    private void LaunchApplyHelper(string setupPath, string installDir)
    {
        var staging = Path.GetDirectoryName(setupPath)
            ?? Path.Combine(Path.GetTempPath(), "SBLauncher-Update");
        var scriptPath = Path.Combine(staging, "apply-update.ps1");
        var exePath = Path.Combine(installDir, "SB Launcher.exe");

        // PowerShell waits for Inno to finish, then relaunches. skipifsilent skips [Run] launch.
        var script = $$"""
$ErrorActionPreference = 'Continue'
$setup = {{PsQuote(setupPath)}}
$installDir = {{PsQuote(installDir)}}
$exe = {{PsQuote(exePath)}}
Start-Sleep -Seconds 2
Get-Process -Name 'SB Launcher' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$setupArgs = @(
  '/VERYSILENT',
  '/NORESTART',
  '/CLOSEAPPLICATIONS',
  '/FORCECLOSEAPPLICATIONS',
  '/SUPPRESSMSGBOXES',
  ('/DIR=' + $installDir)
)
$p = Start-Process -FilePath $setup -ArgumentList $setupArgs -PassThru -Wait
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath $exe) {
  Start-Process -FilePath $exe
}
Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
""";
        File.WriteAllText(scriptPath, script, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{scriptPath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = staging,
        };
        Process.Start(psi);
    }

    internal static void WipePresets()
    {
        TryDelete(UserDataPaths.LocalPrefsPath);
        TryDeleteDirectory(UserDataPaths.WallpapersDirectory);
        TryDeleteDirectory(UserDataPaths.ProfileAvatarDirectory);
        TryDeleteDirectory(UserDataPaths.NickBadgesDirectory);
        TryDeleteDirectory(UserDataPaths.RobloxAppIconsDirectory);
        TryDeleteDirectory(UserDataPaths.LaunchOverlayDirectory);
        TryDeleteDirectory(UserDataPaths.RobloxModsDirectory);
        TryDeleteDirectory(UserDataPaths.RuntimeWebDirectory);
        // Keep database (login) and host.json (OAuth client config).
    }

    private void Report(string phase, double fraction, string message)
    {
        var percent = (int)Math.Round(Math.Clamp(fraction, 0, 1) * 100);
        _push(new JsonObject
        {
            ["type"] = "update-progress",
            ["phase"] = phase,
            ["percent"] = percent,
            ["message"] = message,
        });
    }

    private static List<string> BuildPartsBases(string pageUrl)
    {
        var list = new List<string>();
        try
        {
            var uri = new Uri(pageUrl);
            var root = $"{uri.Scheme}://{uri.Authority}";
            var path = uri.AbsolutePath.TrimEnd('/');
            // https://host/repo/ or https://host/repo/index.html
            if (path.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                path = path[..path.LastIndexOf('/')];
            if (!string.IsNullOrEmpty(path))
                list.Add(root + path);
            list.Add(root + path + "/downloads/parts");
            list.Add(root);
        }
        catch
        {
            list.Add("https://sblauncherrblx.github.io/SB-launcher-for-Roblox");
        }

        return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static bool IsAllowedUrl(string raw)
    {
        try
        {
            var url = new Uri(raw);
            if (url.Scheme != Uri.UriSchemeHttps) return false;
            if (!string.IsNullOrEmpty(url.UserInfo)) return false;
            return AllowedHosts.Contains(url.Host);
        }
        catch
        {
            return false;
        }
    }

    private static string PsQuote(string value)
        => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

    private static string FormatBytes(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB"];
        double size = bytes;
        var unit = 0;
        while (size >= 1024 && unit < units.Length - 1)
        {
            size /= 1024;
            unit++;
        }
        return $"{size:0.#} {units[unit]}";
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch { /* ignore */ }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        catch { /* ignore */ }
    }
}
