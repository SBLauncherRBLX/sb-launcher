using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SBLauncher.Native;

public static class UserDataPaths
{
    public const string AppFolderName = "SB Launcher";

    public static string Root =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppFolderName);

    public static string DatabasePath => Path.Combine(Root, "sb-launcher.db");
    public static string LocalPrefsPath => Path.Combine(Root, "local-prefs.json");
    public static string HostConfigPath => Path.Combine(Root, "host.json");
    public static string WallpapersDirectory => Path.Combine(Root, "wallpapers");
    public static string ProfileAvatarDirectory => Path.Combine(Root, "profile-avatar");
    public static string NickBadgesDirectory => Path.Combine(Root, "nick-badges");
    public static string RobloxAppIconsDirectory => Path.Combine(Root, "roblox-app-icons");
    public static string RobloxModsDirectory => Path.Combine(Root, "roblox-mods");
    public static string RobloxFontsDirectory => Path.Combine(RobloxModsDirectory, "fonts");
    public static string RobloxFontBackupsDirectory => Path.Combine(RobloxModsDirectory, "font-backups");
    public static string LaunchOverlayDirectory => Path.Combine(Root, "launch-overlay");
    /// <summary>Legacy splash texture backups — restored on startup after the feature was removed.</summary>
    public static string RobloxSplashBackupsDirectory => Path.Combine(RobloxModsDirectory, "splash-backups");
    /// <summary>Legacy cursor backups — restored on startup after the feature was removed.</summary>
    public static string RobloxCursorBackupsDirectory => Path.Combine(RobloxModsDirectory, "cursor-backups");
    /// <summary>Legacy sky backups — restored on startup after the feature was removed.</summary>
    public static string RobloxSkyBackupsDirectory => Path.Combine(RobloxModsDirectory, "sky-backups");
    public static string WebView2Directory => Path.Combine(Root, "WebView2");
    public static string MigrationMarkerPath => Path.Combine(Root, "data-layout.json");
    public static string WebBundleMarkerPath => Path.Combine(Root, "web-bundle.txt");
    public static string InstalledBuildMarkerPath => Path.Combine(Root, "installed-build.txt");
    /// <summary>Hot-updated UI overlay written by scripts/sync-web-runtime.ps1.</summary>
    public static string RuntimeWebDirectory => Path.Combine(Root, "runtime-web");

    public static string ResolveWebRoot(string installDirectory)
    {
        var bundled = Path.Combine(installDirectory, "runtime", "web");
        var overlayIndex = Path.Combine(RuntimeWebDirectory, "index.html");
        var bundledIndex = Path.Combine(bundled, "index.html");
        var shippedBuildId = ReadBuildIdFromInstall(installDirectory);

        // Prefer overlay only when it carries matching build-info (written by sync/pack).
        // Mismatched / missing integrity falls back to the signed install bundle.
        if (File.Exists(overlayIndex) && OverlayMatchesInstall(shippedBuildId))
            return RuntimeWebDirectory;
        if (File.Exists(bundledIndex))
            return bundled;
        if (File.Exists(overlayIndex))
            return RuntimeWebDirectory;
        return bundled;
    }

    private static bool OverlayMatchesInstall(string? shippedBuildId)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(shippedBuildId)) return false;
            var overlayInfo = Path.Combine(RuntimeWebDirectory, "build-info.json");
            if (!File.Exists(overlayInfo)) return false;
            var node = JsonNode.Parse(File.ReadAllText(overlayInfo))?.AsObject();
            var overlayBuild = node?["buildId"]?.GetValue<string>()?.Trim();
            if (!string.Equals(overlayBuild, shippedBuildId, StringComparison.Ordinal))
                return false;

            var integrityPath = Path.Combine(RuntimeWebDirectory, "integrity.sha256");
            var indexPath = Path.Combine(RuntimeWebDirectory, "index.html");
            if (!File.Exists(integrityPath) || !File.Exists(indexPath)) return false;
            var expected = File.ReadAllText(integrityPath).Trim().ToLowerInvariant();
            var actual = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(indexPath)))
                .ToLowerInvariant();
            return string.Equals(expected, actual, StringComparison.Ordinal);
        }
        catch
        {
            return false;
        }
    }

    public static string? ReadBuildIdFromInstall(string installDirectory)
        => ReadBuildInfoField(installDirectory, "buildId");

    public static string? ReadVersionFromInstall(string installDirectory)
        => ReadBuildInfoField(installDirectory, "version");

    private static string? ReadBuildInfoField(string installDirectory, string field)
    {
        try
        {
            var path = Path.Combine(installDirectory, "runtime", "build-info.json");
            if (!File.Exists(path))
                path = Path.Combine(installDirectory, "build-info.json");
            if (!File.Exists(path))
                return null;

            var node = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            return node?[field]?.GetValue<string>();
        }
        catch
        {
            return null;
        }
    }

    public static void HandleInstallUpgrade(string installDirectory, Action<string>? log = null)
    {
        EnsureDirectories();
        var shipped = ReadBuildIdFromInstall(installDirectory);
        if (string.IsNullOrWhiteSpace(shipped))
            return;

        var previous = File.Exists(InstalledBuildMarkerPath)
            ? File.ReadAllText(InstalledBuildMarkerPath).Trim()
            : "";

        if (string.Equals(previous, shipped, StringComparison.Ordinal))
            return;

        log?.Invoke($"Launcher build changed ({previous} -> {shipped}). Refreshing interface caches.");

        TryDelete(WebBundleMarkerPath);
        TryDeleteDirectory(WebView2Directory);
        ReseedRuntimeWebFromBundled(installDirectory, log);

        try
        {
            File.WriteAllText(InstalledBuildMarkerPath, shipped);
        }
        catch
        {
            // Non-critical marker.
        }
    }

    /// <summary>
    /// Replace the live UI overlay with the UI shipped next to the EXE.
    /// Called after installer upgrades so reinstall always applies the packaged interface.
    /// </summary>
    public static void ReseedRuntimeWebFromBundled(string installDirectory, Action<string>? log = null)
    {
        try
        {
            var bundled = Path.Combine(installDirectory, "runtime", "web");
            if (!Directory.Exists(bundled) || !File.Exists(Path.Combine(bundled, "index.html")))
            {
                log?.Invoke("Bundled runtime\\web missing; skipped overlay reseed.");
                return;
            }

            TryDeleteDirectory(RuntimeWebDirectory);
            Directory.CreateDirectory(RuntimeWebDirectory);
            CopyDirectory(bundled, RuntimeWebDirectory);
            WriteWebIntegrity(RuntimeWebDirectory);
            log?.Invoke($"Reseeded live UI overlay from {bundled}");
        }
        catch (Exception ex)
        {
            log?.Invoke($"Failed to reseed runtime-web: {ex.Message}");
        }
    }

    public static void WriteWebIntegrity(string webRoot)
    {
        try
        {
            var indexPath = Path.Combine(webRoot, "index.html");
            if (!File.Exists(indexPath)) return;
            var hash = Convert.ToHexString(
                    System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(indexPath)))
                .ToLowerInvariant();
            File.WriteAllText(Path.Combine(webRoot, "integrity.sha256"), hash);
        }
        catch
        {
            // Non-critical for bundled path; overlay simply won't be preferred.
        }
    }

    private static void CopyDirectory(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, file);
            var dest = Path.Combine(destDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Copy(file, dest, overwrite: true);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // ignore
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, true);
        }
        catch
        {
            // ignore
        }
    }

    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(WallpapersDirectory);
        Directory.CreateDirectory(ProfileAvatarDirectory);
        Directory.CreateDirectory(NickBadgesDirectory);
        Directory.CreateDirectory(RobloxAppIconsDirectory);
        Directory.CreateDirectory(RobloxModsDirectory);
        Directory.CreateDirectory(RobloxFontsDirectory);
        Directory.CreateDirectory(RobloxFontBackupsDirectory);
        Directory.CreateDirectory(LaunchOverlayDirectory);
    }

    public static IReadOnlyList<string> MigrateLegacyData(string installDirectory, Action<string>? log = null)
    {
        var migrated = new List<string>();
        EnsureDirectories();

        var legacyFiles = new (string Source, string Target)[]
        {
            (Path.Combine(installDirectory, "sb-launcher.db"), DatabasePath),
            (Path.Combine(installDirectory, "runtime", "api", "sb-launcher.db"), DatabasePath),
            (Path.Combine(installDirectory, "runtime", "api", "dev.db"), DatabasePath),
            (Path.Combine(installDirectory, "local-prefs.json"), LocalPrefsPath),
            (Path.Combine(installDirectory, "host.json"), HostConfigPath),
            (Path.Combine(installDirectory, "data", "sb-launcher.db"), DatabasePath),
            (Path.Combine(installDirectory, "data", "local-prefs.json"), LocalPrefsPath),
            (Path.Combine(installDirectory, "data", "host.json"), HostConfigPath),
        };

        foreach (var (source, target) in legacyFiles)
        {
            if (!File.Exists(source) || File.Exists(target))
                continue;

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Copy(source, target);
                migrated.Add($"{source} -> {target}");
                log?.Invoke($"Migrated data file: {source} -> {target}");
            }
            catch (Exception ex)
            {
                log?.Invoke($"Failed to migrate {source}: {ex.Message}");
            }
        }

        var legacyDirs = new (string Source, string Target)[]
        {
            (Path.Combine(installDirectory, "wallpapers"), WallpapersDirectory),
            (Path.Combine(installDirectory, "profile-avatar"), ProfileAvatarDirectory),
            (Path.Combine(installDirectory, "data", "wallpapers"), WallpapersDirectory),
            (Path.Combine(installDirectory, "data", "profile-avatar"), ProfileAvatarDirectory),
        };

        foreach (var (source, target) in legacyDirs)
        {
            if (!Directory.Exists(source))
                continue;

            try
            {
                foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
                {
                    var relative = Path.GetRelativePath(source, file);
                    var dest = Path.Combine(target, relative);
                    if (File.Exists(dest))
                        continue;

                    Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                    File.Copy(file, dest);
                }

                migrated.Add($"{source}\\ -> {target}\\");
                log?.Invoke($"Merged legacy folder: {source} -> {target}");
            }
            catch (Exception ex)
            {
                log?.Invoke($"Failed to merge {source}: {ex.Message}");
            }
        }

        WriteMigrationMarker(migrated);
        return migrated;
    }

    private static void WriteMigrationMarker(IReadOnlyList<string> migrated)
    {
        try
        {
            var marker = new JsonObject
            {
                ["version"] = 1,
                ["root"] = Root,
                ["updatedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            };

            if (migrated.Count > 0)
            {
                var items = new JsonArray();
                foreach (var entry in migrated)
                    items.Add(entry);
                marker["lastMigration"] = items;
            }

            File.WriteAllText(
                MigrationMarkerPath,
                marker.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Marker is diagnostic only.
        }
    }
}
