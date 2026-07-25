using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace SBLauncher.Native;

/// <summary>
/// Changes the Windows shortcut icon for Roblox Player (not the person's profile avatar).
/// </summary>
internal static class RobloxAppIcon
{
    public static object Apply(string mode, string? customUrl)
    {
        UserDataPaths.EnsureDirectories();
        Directory.CreateDirectory(UserDataPaths.RobloxAppIconsDirectory);

        var iconLocation = ResolveIconLocation(mode, customUrl);
        if (iconLocation is null)
        {
            return new
            {
                ok = false,
                message = "Could not build that Roblox app icon.",
                updated = Array.Empty<string>(),
            };
        }

        var shortcuts = FindRobloxShortcuts().ToList();
        if (shortcuts.Count == 0)
        {
            return new
            {
                ok = true,
                message = "Icon prepared, but no Roblox Player shortcuts were found yet. Launch Roblox once, then Apply again.",
                iconPath = iconLocation,
                updated = Array.Empty<string>(),
            };
        }

        var updated = new List<string>();
        foreach (var shortcut in shortcuts)
        {
            if (TrySetShortcutIcon(shortcut, iconLocation))
                updated.Add(shortcut);
        }

        NotifyShellIconsChanged();
        return new
        {
            ok = updated.Count > 0,
            message = updated.Count > 0
                ? $"Roblox app icon updated on {updated.Count} shortcut(s)."
                : "Could not update Roblox shortcuts. Try running SB Launcher as administrator.",
            iconPath = iconLocation,
            updated = updated.ToArray(),
        };
    }

    public static object? PickCustomIcon()
    {
        UserDataPaths.EnsureDirectories();
        Directory.CreateDirectory(UserDataPaths.RobloxAppIconsDirectory);
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.ico",
            Title = "Choose a Roblox app icon",
        };
        if (dialog.ShowDialog() != true)
            return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp" or ".ico"))
            throw new ArgumentException("Unsupported icon format.");

        var id = $"custom-{Guid.NewGuid():N}";
        var target = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, $"{id}{extension}");
        File.Copy(dialog.FileName, target, true);

        var ico = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, $"{id}.ico");
        if (extension == ".ico")
            File.Copy(target, ico, true);
        else
            WritePngAsIco(DecodeToPngBytes(target), ico);

        return new
        {
            id,
            url = $"https://appicons.sblauncher/{Path.GetFileName(target)}?v={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            icoPath = ico,
        };
    }

    private static string? ResolveIconLocation(string mode, string? customUrl)
    {
        return mode switch
        {
            "classic" => EnsureBundledIco("roblox-classic.png", "classic.ico"),
            "launcher" => EnsureBundledIco("sb-logo.png", "launcher.ico"),
            "custom" => ResolveCustomIco(customUrl),
            _ => ResolveDefaultRobloxIcon(),
        };
    }

    private static string? ResolveDefaultRobloxIcon()
    {
        var player = RobloxAppearance.ResolvePlayerDirectory();
        if (player is null)
            return null;
        var exe = Path.Combine(player, "RobloxPlayerBeta.exe");
        return File.Exists(exe) ? exe : null;
    }

    private static string? EnsureBundledIco(string pngFileName, string icoFileName)
    {
        var icoPath = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, icoFileName);
        var pngPath = Path.Combine(AppContext.BaseDirectory, "Assets", pngFileName);
        if (!File.Exists(pngPath))
            pngPath = Path.Combine(AppContext.BaseDirectory, pngFileName);
        if (!File.Exists(pngPath))
            return File.Exists(icoPath) ? icoPath : null;

        WritePngAsIco(File.ReadAllBytes(pngPath), icoPath);
        return icoPath;
    }

    private static string? ResolveCustomIco(string? customUrl)
    {
        if (string.IsNullOrWhiteSpace(customUrl))
            return null;

        var fileName = Path.GetFileName(customUrl.Split('?', 2)[0]);
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        var source = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, fileName);
        if (!File.Exists(source))
            return null;

        var ico = Path.Combine(
            UserDataPaths.RobloxAppIconsDirectory,
            Path.GetFileNameWithoutExtension(fileName) + ".ico");
        if (Path.GetExtension(source).Equals(".ico", StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(source, ico, true);
            return ico;
        }

        WritePngAsIco(DecodeToPngBytes(source), ico);
        return ico;
    }

    private static IEnumerable<string> FindRobloxShortcuts()
    {
        var roots = new List<string>
        {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                @"Microsoft\Windows\Start Menu\Programs"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                @"Microsoft\Windows\Start Menu\Programs"),
        };

        foreach (var root in roots.Where(Directory.Exists).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories);
            }
            catch
            {
                continue;
            }

            foreach (var link in files)
            {
                var name = Path.GetFileNameWithoutExtension(link);
                if (name.Contains("Roblox", StringComparison.OrdinalIgnoreCase) &&
                    !name.Contains("Studio", StringComparison.OrdinalIgnoreCase))
                {
                    yield return link;
                }
            }
        }
    }

    private static bool TrySetShortcutIcon(string shortcutPath, string iconPath)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type is null) return false;
            dynamic shell = Activator.CreateInstance(type)!;
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.IconLocation = iconPath + ",0";
            shortcut.Save();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static byte[] DecodeToPngBytes(string path)
    {
        BitmapSource source;
        using (var stream = File.OpenRead(path))
        {
            var decoder = BitmapDecoder.Create(
                stream,
                BitmapCreateOptions.PreservePixelFormat,
                BitmapCacheOption.OnLoad);
            source = decoder.Frames[0];
        }

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(source));
        using var ms = new MemoryStream();
        encoder.Save(ms);
        return ms.ToArray();
    }

    private static void WritePngAsIco(byte[] sourcePng, string icoPath)
    {
        var sizes = new[] { 256, 48, 32, 16 };
        var images = new List<byte[]>();
        foreach (var size in sizes)
            images.Add(ResizePng(sourcePng, size));

        using var fs = File.Create(icoPath);
        using var bw = new BinaryWriter(fs);
        bw.Write((short)0);
        bw.Write((short)1);
        bw.Write((short)images.Count);

        var offset = 6 + (16 * images.Count);
        for (var i = 0; i < images.Count; i++)
        {
            var size = sizes[i];
            bw.Write((byte)(size >= 256 ? 0 : size));
            bw.Write((byte)(size >= 256 ? 0 : size));
            bw.Write((byte)0);
            bw.Write((byte)0);
            bw.Write((short)1);
            bw.Write((short)32);
            bw.Write(images[i].Length);
            bw.Write(offset);
            offset += images[i].Length;
        }

        foreach (var image in images)
            bw.Write(image);
    }

    private static byte[] ResizePng(byte[] pngBytes, int size)
    {
        using var input = new MemoryStream(pngBytes);
        var decoder = BitmapDecoder.Create(
            input,
            BitmapCreateOptions.PreservePixelFormat,
            BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        var scaled = new TransformedBitmap(
            frame,
            new ScaleTransform(size / (double)frame.PixelWidth, size / (double)frame.PixelHeight));
        scaled.Freeze();
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(scaled));
        using var output = new MemoryStream();
        encoder.Save(output);
        return output.ToArray();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    private static void NotifyShellIconsChanged()
    {
        try
        {
            SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
        }
        catch
        {
            // ignore
        }
    }
}
