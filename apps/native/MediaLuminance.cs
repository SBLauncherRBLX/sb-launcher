using System.IO;
using System.Net.Http;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace SBLauncher.Native;

/// <summary>
/// Samples average relative luminance of an image (first frame for GIF) for profile text contrast.
/// </summary>
internal static class MediaLuminance
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };

    public static async Task<double?> SampleUrlAsync(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        try
        {
            if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
                return null;
            if (uri.Scheme is not ("https" or "http"))
                return null;

            // Local virtual-host media under profile / wallpapers / etc.
            if (uri.Host.EndsWith(".sblauncher", StringComparison.OrdinalIgnoreCase))
            {
                var local = ResolveVirtualHostFile(uri);
                if (local is not null)
                    return SampleFile(local);
            }

            using var response = await Http.GetAsync(uri);
            if (!response.IsSuccessStatusCode) return null;
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var copy = new MemoryStream();
            await stream.CopyToAsync(copy);
            copy.Position = 0;
            return SampleStream(copy);
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveVirtualHostFile(Uri uri)
    {
        var fileName = Path.GetFileName(uri.AbsolutePath);
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Contains(".."))
            return null;

        var root = uri.Host.ToLowerInvariant() switch
        {
            "profile.sblauncher" => UserDataPaths.ProfileAvatarDirectory,
            "wallpapers.sblauncher" => UserDataPaths.WallpapersDirectory,
            "badges.sblauncher" => UserDataPaths.NickBadgesDirectory,
            "launchoverlay.sblauncher" => UserDataPaths.LaunchOverlayDirectory,
            _ => null,
        };
        if (root is null || !Directory.Exists(root)) return null;
        var path = Path.Combine(root, fileName);
        return File.Exists(path) ? path : null;
    }

    private static double? SampleFile(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            return SampleStream(stream);
        }
        catch
        {
            return null;
        }
    }

    private static double? SampleStream(Stream stream)
    {
        var decoder = BitmapDecoder.Create(
            stream,
            BitmapCreateOptions.IgnoreColorProfile,
            BitmapCacheOption.OnLoad);
        if (decoder.Frames.Count == 0) return null;

        var frame = decoder.Frames[0];
        var converted = new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0);
        var width = converted.PixelWidth;
        var height = converted.PixelHeight;
        if (width <= 0 || height <= 0) return null;

        var stride = width * 4;
        var pixels = new byte[stride * height];
        converted.CopyPixels(pixels, stride, 0);

        var stepX = Math.Max(1, width / 24);
        var stepY = Math.Max(1, height / 16);
        double total = 0;
        var count = 0;
        for (var y = 0; y < height; y += stepY)
        {
            for (var x = 0; x < width; x += stepX)
            {
                var i = (y * width + x) * 4;
                var a = pixels[i + 3];
                if (a < 20) continue;
                var b = pixels[i];
                var g = pixels[i + 1];
                var r = pixels[i + 2];
                total += RelativeLuminance(r, g, b);
                count++;
            }
        }

        return count > 0 ? total / count : null;
    }

    private static double RelativeLuminance(byte r, byte g, byte b)
    {
        static double Lin(byte c)
        {
            var s = c / 255.0;
            return s <= 0.04045 ? s / 12.92 : Math.Pow((s + 0.055) / 1.055, 2.4);
        }

        return 0.2126 * Lin(r) + 0.7152 * Lin(g) + 0.0722 * Lin(b);
    }
}
