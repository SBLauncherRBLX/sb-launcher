using System.IO;

namespace SBLauncher.Native;

/// <summary>
/// Local Roblox client appearance mods (fonts only).
/// </summary>
internal static class RobloxAppearance
{
    public static IReadOnlyList<string> ResolveAllPlayerDirectories()
    {
        var versionsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Roblox",
            "Versions");
        if (!Directory.Exists(versionsPath))
            return [];

        return Directory
            .EnumerateDirectories(versionsPath)
            .Where(directory => File.Exists(Path.Combine(directory, "RobloxPlayerBeta.exe")))
            .OrderByDescending(directory =>
                File.GetLastWriteTimeUtc(Path.Combine(directory, "RobloxPlayerBeta.exe")))
            .ToList();
    }

    public static string? ResolvePlayerDirectory() =>
        ResolveAllPlayerDirectories().FirstOrDefault();

    public static object? PickCustomFont()
    {
        UserDataPaths.EnsureDirectories();
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Font files|*.ttf;*.otf",
            Title = "Choose a custom Roblox font",
        };
        if (dialog.ShowDialog() != true)
            return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".ttf" or ".otf"))
            throw new ArgumentException("Use a .ttf or .otf font file.");

        var id = $"font-{Guid.NewGuid():N}";
        var file = $"{id}{extension}";
        var target = Path.Combine(UserDataPaths.RobloxFontsDirectory, file);
        File.Copy(dialog.FileName, target, true);
        return new
        {
            id,
            name = Path.GetFileNameWithoutExtension(dialog.FileName),
            path = target,
            url = $"https://robloxfonts.sblauncher/{file}?v={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
        };
    }

    public static void ApplyFromGraphics(System.Text.Json.Nodes.JsonObject graphics, List<string> applied)
    {
        var players = ResolveAllPlayerDirectories();
        if (players.Count == 0)
        {
            applied.Add("Roblox player folder not found (font skipped)");
            return;
        }

        foreach (var playerDirectory in players)
        {
            var versionKey = Path.GetFileName(playerDirectory);
            ApplyFontMode(graphics, playerDirectory, versionKey, applied);
        }
    }

    /// <summary>
    /// Restore stock files left by removed SB Launcher features (cursor / sky / splash textures).
    /// </summary>
    public static void RestoreLegacyModBackupsIfPresent()
    {
        RestoreLegacyBackups(UserDataPaths.RobloxCursorBackupsDirectory);
        RestoreLegacyBackups(UserDataPaths.RobloxSkyBackupsDirectory, isSky: true);
        RestoreLegacyBackups(UserDataPaths.RobloxSplashBackupsDirectory);
    }

    private static void RestoreLegacyBackups(string backupRoot, bool isSky = false)
    {
        try
        {
            if (!Directory.Exists(backupRoot))
                return;

            foreach (var playerDirectory in ResolveAllPlayerDirectories())
            {
                var versionKey = Path.GetFileName(playerDirectory);
                var backupDir = Path.Combine(backupRoot, versionKey);
                if (!Directory.Exists(backupDir))
                    continue;

                if (isSky)
                {
                    var skyDir = Path.Combine(playerDirectory, "PlatformContent", "pc", "textures", "sky");
                    if (!Directory.Exists(skyDir))
                        continue;
                    foreach (var file in Directory.EnumerateFiles(backupDir, "*.tex"))
                    {
                        try
                        {
                            var dest = Path.Combine(skyDir, Path.GetFileName(file));
                            if (File.Exists(dest))
                                File.SetAttributes(dest, FileAttributes.Normal);
                            File.Copy(file, dest, true);
                        }
                        catch
                        {
                            // ignore locked
                        }
                    }
                    continue;
                }

                foreach (var file in Directory.EnumerateFiles(backupDir, "*", SearchOption.AllDirectories))
                {
                    var relative = Path.GetRelativePath(backupDir, file);
                    var dest = Path.Combine(playerDirectory, relative);
                    try
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                        if (File.Exists(dest))
                            File.SetAttributes(dest, FileAttributes.Normal);
                        File.Copy(file, dest, true);
                    }
                    catch
                    {
                        // ignore locked
                    }
                }
            }
        }
        catch
        {
            // best-effort
        }
    }

    private static void ApplyFontMode(
        System.Text.Json.Nodes.JsonObject graphics,
        string playerDirectory,
        string versionKey,
        List<string> applied)
    {
        var mode = graphics["robloxFontMode"]?.GetValue<string>() ?? "vanilla";
        var fontsDir = Path.Combine(playerDirectory, "content", "fonts");
        if (!Directory.Exists(fontsDir))
        {
            applied.Add("Roblox fonts folder missing");
            return;
        }

        EnsureFontBackup(fontsDir, versionKey);

        if (mode != "custom")
        {
            RestoreFontBackup(fontsDir, versionKey);
            applied.Add("Roblox font: vanilla");
            return;
        }

        var fontId = graphics["robloxCustomFontId"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(fontId))
        {
            applied.Add("Custom font selected but no file chosen");
            return;
        }

        var source = FindStoredFont(fontId);
        if (source is null)
        {
            applied.Add("Custom font file missing — pick it again in Settings");
            return;
        }

        foreach (var dest in EnumerateLocalFontFiles(fontsDir))
            File.Copy(source, dest, true);

        applied.Add($"Roblox font: custom ({versionKey})");
    }

    /// <summary>
    /// Data-URL for WebView font preview (avoids CORS on the virtual host).
    /// </summary>
    public static string? GetFontPreviewDataUrl(string? fontId)
    {
        if (string.IsNullOrWhiteSpace(fontId)) return null;
        UserDataPaths.EnsureDirectories();
        var path = FindStoredFont(fontId.Trim());
        if (path is null || !File.Exists(path)) return null;

        var bytes = File.ReadAllBytes(path);
        if (bytes.Length == 0 || bytes.Length > 12 * 1024 * 1024) return null;
        var mime = Path.GetExtension(path).Equals(".otf", StringComparison.OrdinalIgnoreCase)
            ? "font/otf"
            : "font/ttf";
        return $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
    }

    private static string? FindStoredFont(string fontId)
    {
        foreach (var ext in new[] { ".ttf", ".otf" })
        {
            var path = Path.Combine(UserDataPaths.RobloxFontsDirectory, fontId + ext);
            if (File.Exists(path))
                return path;
        }

        return Directory
            .EnumerateFiles(UserDataPaths.RobloxFontsDirectory)
            .FirstOrDefault(path =>
                Path.GetFileNameWithoutExtension(path)
                    .Equals(fontId, StringComparison.OrdinalIgnoreCase));
    }

    private static IEnumerable<string> EnumerateLocalFontFiles(string fontsDir) =>
        Directory
            .EnumerateFiles(fontsDir, "*.*", SearchOption.TopDirectoryOnly)
            .Where(path =>
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                return ext is ".ttf" or ".otf";
            });

    private static void EnsureFontBackup(string fontsDir, string versionKey)
    {
        var backupDir = Path.Combine(UserDataPaths.RobloxFontBackupsDirectory, versionKey);
        if (Directory.Exists(backupDir) && Directory.EnumerateFiles(backupDir).Any())
            return;

        Directory.CreateDirectory(backupDir);
        foreach (var file in EnumerateLocalFontFiles(fontsDir))
            File.Copy(file, Path.Combine(backupDir, Path.GetFileName(file)), true);
    }

    private static void RestoreFontBackup(string fontsDir, string versionKey)
    {
        var backupDir = Path.Combine(UserDataPaths.RobloxFontBackupsDirectory, versionKey);
        if (!Directory.Exists(backupDir))
            return;

        foreach (var file in Directory.EnumerateFiles(backupDir))
            File.Copy(file, Path.Combine(fontsDir, Path.GetFileName(file)), true);
    }
}
