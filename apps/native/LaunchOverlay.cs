using System.IO;
using System.Text.Json.Nodes;
using System.Windows;

namespace SBLauncher.Native;

/// <summary>
/// Pre-launch overlay shown by SB Launcher when joining an experience.
/// </summary>
internal static class LaunchOverlay
{
    public static object? PickMedia()
    {
        UserDataPaths.EnsureDirectories();
        Directory.CreateDirectory(UserDataPaths.LaunchOverlayDirectory);
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif",
            Title = "Choose launch overlay background",
        };
        if (dialog.ShowDialog() != true)
            return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp" or ".gif"))
            throw new ArgumentException("Unsupported image format.");

        var id = $"overlay-{Guid.NewGuid():N}";
        var file = $"{id}{extension}";
        var target = Path.Combine(UserDataPaths.LaunchOverlayDirectory, file);
        File.Copy(dialog.FileName, target, true);
        return new
        {
            id,
            name = Path.GetFileNameWithoutExtension(dialog.FileName),
            url = $"https://launchoverlay.sblauncher/{file}?v={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            kind = extension == ".gif" ? "gif" : "image",
        };
    }

    public static string? FindMediaPath(string mediaId)
    {
        if (string.IsNullOrWhiteSpace(mediaId)) return null;
        var dir = UserDataPaths.LaunchOverlayDirectory;
        if (!Directory.Exists(dir)) return null;

        foreach (var path in Directory.EnumerateFiles(dir))
        {
            var name = Path.GetFileNameWithoutExtension(path);
            if (name.Equals(mediaId, StringComparison.OrdinalIgnoreCase) ||
                Path.GetFileName(path).Equals(mediaId, StringComparison.OrdinalIgnoreCase))
                return path;
        }

        return null;
    }

    public static async Task ShowDuringLaunchAsync(
        Window owner,
        JsonObject graphics,
        Func<Task> launchAction)
    {
        var enabled = graphics["launchOverlayEnabled"]?.GetValue<bool>() ?? true;
        if (!enabled)
        {
            await launchAction();
            return;
        }

        var duration = graphics["launchOverlayDurationMs"]?.GetValue<int>() ?? 4000;
        duration = Math.Clamp(duration, 2000, 8000);

        LaunchOverlayWindow? overlay = null;
        await owner.Dispatcher.InvokeAsync(() =>
        {
            overlay = new LaunchOverlayWindow(graphics)
            {
                Owner = owner,
            };
            overlay.Show();
        });

        try
        {
            await launchAction();
            await Task.Delay(duration);
        }
        finally
        {
            await owner.Dispatcher.InvokeAsync(() =>
            {
                try { overlay?.Close(); } catch { /* ignore */ }
            });
        }
    }
}
