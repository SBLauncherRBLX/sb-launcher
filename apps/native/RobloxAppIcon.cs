using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace SBLauncher.Native;

/// <summary>
/// Changes the Windows shortcut icon for Roblox Player (not the person's profile avatar).
/// Must run on an STA thread (WPF UI dispatcher) — WScript / ShellLink COM is STA-only.
/// </summary>
internal static class RobloxAppIcon
{
    public static object Apply(string mode, string? customUrl)
    {
        UserDataPaths.EnsureDirectories();
        Directory.CreateDirectory(UserDataPaths.RobloxAppIconsDirectory);

        var iconLocation = ResolveIconLocation(mode, customUrl);
        if (string.IsNullOrWhiteSpace(iconLocation) || !File.Exists(iconLocation))
        {
            return new
            {
                ok = false,
                message = "Could not build that Roblox app icon.",
                updated = Array.Empty<string>(),
            };
        }

        // Absolute path; never allow empty IconLocation (produces broken ",0" shortcuts).
        iconLocation = Path.GetFullPath(iconLocation);

        var playerExe = ResolvePlayerExe();
        EnsureManagedShortcuts(playerExe);

        var shortcuts = FindRobloxShortcuts(playerExe).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (shortcuts.Count == 0)
        {
            return new
            {
                ok = false,
                message = playerExe is null
                    ? "Roblox Player was not found. Install or launch Roblox once, then Apply again."
                    : "No Roblox Player shortcuts were found. Launch Roblox once, then Apply again.",
                iconPath = iconLocation,
                updated = Array.Empty<string>(),
            };
        }

        var updated = new List<string>();
        var failed = 0;
        foreach (var shortcut in shortcuts)
        {
            if (TrySetShortcutIcon(shortcut, iconLocation, playerExe))
                updated.Add(shortcut);
            else
                failed++;
        }

        NotifyShellIconsChanged(updated);

        return new
        {
            ok = updated.Count > 0,
            message = updated.Count > 0
                ? failed > 0
                    ? $"Roblox icon updated on {updated.Count} shortcut(s); {failed} could not be changed."
                    : $"Roblox app icon updated on {updated.Count} shortcut(s). If an icon still looks old, refresh the desktop (F5) or unpin/repin Roblox."
                : "Could not update Roblox shortcuts. Close Roblox and try again.",
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
            WriteImageAsIco(DecodeToPngBytes(target), ico);

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
            "classic" => EnsureBundledIco("roblox-classic.png", "classic"),
            "launcher" => EnsureBundledIco("sb-logo.png", "launcher"),
            "custom" => ResolveCustomIco(customUrl),
            _ => ResolveDefaultRobloxIcon(),
        };
    }

    private static string? ResolvePlayerExe()
    {
        var player = RobloxAppearance.ResolvePlayerDirectory();
        if (player is null) return null;
        var exe = Path.Combine(player, "RobloxPlayerBeta.exe");
        return File.Exists(exe) ? exe : null;
    }

    private static string? ResolveDefaultRobloxIcon() => ResolvePlayerExe();

    private static string? EnsureBundledIco(string pngFileName, string stem)
    {
        var pngPath = Path.Combine(AppContext.BaseDirectory, "Assets", pngFileName);
        if (!File.Exists(pngPath))
            pngPath = Path.Combine(AppContext.BaseDirectory, pngFileName);
        if (!File.Exists(pngPath))
        {
            // Fall back to any previously built ICO for this stem.
            var existing = Directory.Exists(UserDataPaths.RobloxAppIconsDirectory)
                ? Directory.EnumerateFiles(UserDataPaths.RobloxAppIconsDirectory, $"{stem}*.ico")
                    .OrderByDescending(File.GetLastWriteTimeUtc)
                    .FirstOrDefault()
                : null;
            return existing;
        }

        var pngBytes = File.ReadAllBytes(pngPath);
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(pngBytes))[..10].ToLowerInvariant();
        var icoPath = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, $"{stem}-{hash}.ico");
        if (!File.Exists(icoPath))
            WriteImageAsIco(pngBytes, icoPath);

        // Stable alias so older messages / docs still resolve.
        var alias = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, $"{stem}.ico");
        try { File.Copy(icoPath, alias, true); } catch { /* ignore */ }
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

        var stem = Path.GetFileNameWithoutExtension(fileName);
        var ico = Path.Combine(UserDataPaths.RobloxAppIconsDirectory, stem + ".ico");
        if (Path.GetExtension(source).Equals(".ico", StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(source, ico, true);
            return Path.GetFullPath(ico);
        }

        WriteImageAsIco(DecodeToPngBytes(source), ico);
        return Path.GetFullPath(ico);
    }

    private static void EnsureManagedShortcuts(string? playerExe)
    {
        if (string.IsNullOrWhiteSpace(playerExe) || !File.Exists(playerExe))
            return;

        var candidates = new[]
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "Roblox Player.lnk"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                @"Microsoft\Windows\Start Menu\Programs",
                "Roblox Player.lnk"),
        };

        foreach (var path in candidates)
        {
            try
            {
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);
                if (!File.Exists(path))
                    CreateShortcut(path, playerExe);
                else
                    TryRetargetShortcut(path, playerExe);
            }
            catch
            {
                // ignore
            }
        }
    }

    private static IEnumerable<string> FindRobloxShortcuts(string? playerExe)
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
                if (name.Contains("Studio", StringComparison.OrdinalIgnoreCase))
                    continue;

                var nameHit = name.Contains("Roblox", StringComparison.OrdinalIgnoreCase);
                var targetHit = false;
                if (!nameHit && !string.IsNullOrWhiteSpace(playerExe))
                {
                    if (TryReadShortcut(link, out var target, out _) &&
                        !string.IsNullOrWhiteSpace(target) &&
                        target.Contains("RobloxPlayerBeta", StringComparison.OrdinalIgnoreCase) &&
                        !target.Contains("Studio", StringComparison.OrdinalIgnoreCase))
                    {
                        targetHit = true;
                    }
                }

                if (nameHit || targetHit)
                    yield return link;
            }
        }
    }

    private static bool TrySetShortcutIcon(string shortcutPath, string iconPath, string? playerExe)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(iconPath) || !File.Exists(iconPath))
                return false;

            // IShellLink on STA is more reliable than WScript.Shell IconLocation writes.
            var link = (IShellLinkW)new ShellLink();
            var file = (IPersistFile)link;
            file.Load(shortcutPath, 0);

            if (!string.IsNullOrWhiteSpace(playerExe) && File.Exists(playerExe))
                link.SetPath(playerExe);

            link.SetIconLocation(iconPath, 0);
            file.Save(shortcutPath, true);

            // Verify write stuck (guards against empty ",0" regressions).
            if (TryReadShortcut(shortcutPath, out _, out var icon) &&
                !string.IsNullOrWhiteSpace(icon) &&
                icon.StartsWith(iconPath, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            // Fallback: WScript.Shell (still on STA).
            return TrySetShortcutIconViaWscript(shortcutPath, iconPath);
        }
        catch
        {
            return TrySetShortcutIconViaWscript(shortcutPath, iconPath);
        }
    }

    private static bool TrySetShortcutIconViaWscript(string shortcutPath, string iconPath)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type is null) return false;
            dynamic shell = Activator.CreateInstance(type)!;
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.IconLocation = iconPath + ",0";
            shortcut.Save();
            Marshal.FinalReleaseComObject(shortcut);
            Marshal.FinalReleaseComObject(shell);
            return TryReadShortcut(shortcutPath, out _, out var icon) &&
                   !string.IsNullOrWhiteSpace(icon) &&
                   icon.Contains(".ico", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static void CreateShortcut(string shortcutPath, string targetExe)
    {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(targetExe);
        link.SetWorkingDirectory(Path.GetDirectoryName(targetExe) ?? "");
        link.SetDescription("Roblox Player");
        ((IPersistFile)link).Save(shortcutPath, true);
    }

    private static void TryRetargetShortcut(string shortcutPath, string playerExe)
    {
        try
        {
            var link = (IShellLinkW)new ShellLink();
            var file = (IPersistFile)link;
            file.Load(shortcutPath, 0);
            link.SetPath(playerExe);
            link.SetWorkingDirectory(Path.GetDirectoryName(playerExe) ?? "");
            file.Save(shortcutPath, true);
        }
        catch
        {
            // ignore
        }
    }

    private static bool TryReadShortcut(string shortcutPath, out string target, out string icon)
    {
        target = "";
        icon = "";
        try
        {
            var link = (IShellLinkW)new ShellLink();
            ((IPersistFile)link).Load(shortcutPath, 0);
            var targetSb = new StringBuilder(260);
            link.GetPath(targetSb, targetSb.Capacity, IntPtr.Zero, 0);
            target = targetSb.ToString();
            var iconSb = new StringBuilder(260);
            link.GetIconLocation(iconSb, iconSb.Capacity, out _);
            icon = iconSb.ToString();
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

    private static void WriteImageAsIco(byte[] sourcePng, string icoPath)
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

        // Render to an exact pixel buffer so Windows gets a clean PNG-in-ICO frame.
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
            dc.DrawImage(scaled, new System.Windows.Rect(0, 0, size, size));
        var rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(dv);
        rtb.Freeze();

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(rtb));
        using var output = new MemoryStream();
        encoder.Save(output);
        return output.ToArray();
    }

    private static void NotifyShellIconsChanged(IReadOnlyList<string> shortcuts)
    {
        try
        {
            // Global icon overlay refresh.
            SHChangeNotify(0x08000000 /*SHCNE_ASSOCCHANGED*/, 0x1000 /*SHCNF_FLUSH*/, IntPtr.Zero, IntPtr.Zero);
            foreach (var path in shortcuts)
            {
                SHChangeNotify(0x00002000 /*SHCNE_UPDATEITEM*/, 0x0005 /*SHCNF_PATHW | SHCNF_FLUSH*/, path, null);
            }
        }
        catch
        {
            // ignore
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, string? dwItem1, string? dwItem2);

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink
    {
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
}
