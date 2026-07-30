using System.Runtime.InteropServices;

namespace SBLauncher.Native;

/// <summary>
/// Temporarily changes the primary display mode (CS-style fullscreen resolution).
/// Restores the previous mode when Roblox exits.
/// </summary>
internal static class RobloxDisplayMode
{
    private const int EnumCurrentSettings = -1;
    private const int CdsFullscreen = 0x00000004;
    private const int DispChangeSuccessful = 0;
    private const int DmPelsWidth = 0x80000;
    private const int DmPelsHeight = 0x100000;
    private const int DmBitsPerPel = 0x40000;
    private const int DmDisplayFrequency = 0x400000;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    private struct DevMode
    {
        private const int CchDevicename = 32;
        private const int CchFormname = 32;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CchDevicename)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CchFormname)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    private static extern bool EnumDisplaySettings(string? deviceName, int modeNum, ref DevMode devMode);

    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    private static extern int ChangeDisplaySettings(ref DevMode devMode, int flags);

    [DllImport("user32.dll")]
    private static extern int ChangeDisplaySettings(IntPtr devMode, int flags);

    private static bool _changed;
    private static int _previousWidth;
    private static int _previousHeight;
    private static int _previousBits;
    private static int _previousFreq;

    public static bool IsActive => _changed;

    public static (bool ok, string message) TryApply(int width, int height)
    {
        width = Math.Clamp(width, 640, 7680);
        height = Math.Clamp(height, 480, 4320);

        if (!TryReadCurrent(out var current))
            return (false, "Could not read the current display mode.");

        if (current.dmPelsWidth == width && current.dmPelsHeight == height)
            return (true, $"Display already {width}x{height}.");

        if (!TryFindBestMode(width, height, current.dmBitsPerPel, current.dmDisplayFrequency, out var target))
            return (false, $"No display mode near {width}x{height} is available.");

        if (!_changed)
        {
            _previousWidth = current.dmPelsWidth;
            _previousHeight = current.dmPelsHeight;
            _previousBits = current.dmBitsPerPel;
            _previousFreq = current.dmDisplayFrequency;
        }

        var result = ChangeDisplaySettings(ref target, CdsFullscreen);
        if (result != DispChangeSuccessful)
            return (false, $"Display mode change failed ({result}).");

        _changed = true;
        return (true, $"Display mode {target.dmPelsWidth}x{target.dmPelsHeight}@{target.dmDisplayFrequency}Hz");
    }

    public static void Restore()
    {
        if (!_changed) return;
        try
        {
            if (TryFindBestMode(_previousWidth, _previousHeight, _previousBits, _previousFreq, out var previous))
            {
                ChangeDisplaySettings(ref previous, 0);
            }
            else
            {
                ChangeDisplaySettings(IntPtr.Zero, 0);
            }
        }
        catch
        {
            try { ChangeDisplaySettings(IntPtr.Zero, 0); } catch { /* ignore */ }
        }
        finally
        {
            _changed = false;
        }
    }

    private static bool TryReadCurrent(out DevMode mode)
    {
        mode = new DevMode { dmSize = (short)Marshal.SizeOf<DevMode>() };
        return EnumDisplaySettings(null, EnumCurrentSettings, ref mode);
    }

    private static bool TryFindBestMode(
        int width,
        int height,
        int preferredBits,
        int preferredFreq,
        out DevMode best)
    {
        best = default;
        var found = false;
        var bestScore = long.MaxValue;
        var i = 0;
        while (true)
        {
            var mode = new DevMode { dmSize = (short)Marshal.SizeOf<DevMode>() };
            if (!EnumDisplaySettings(null, i, ref mode))
                break;
            i++;

            if (mode.dmPelsWidth < 640 || mode.dmPelsHeight < 480)
                continue;

            var dw = Math.Abs(mode.dmPelsWidth - width);
            var dh = Math.Abs(mode.dmPelsHeight - height);
            var db = preferredBits > 0 ? Math.Abs(mode.dmBitsPerPel - preferredBits) : 0;
            var df = preferredFreq > 0 ? Math.Abs(mode.dmDisplayFrequency - preferredFreq) : 0;
            // Prefer exact size, then closest, then matching refresh/bit depth.
            long score = (dw * 10_000L) + (dh * 10_000L) + (df * 10L) + db;
            if (mode.dmPelsWidth == width && mode.dmPelsHeight == height)
                score -= 1_000_000;

            if (!found || score < bestScore)
            {
                found = true;
                bestScore = score;
                best = mode;
                best.dmFields = DmPelsWidth | DmPelsHeight | DmBitsPerPel | DmDisplayFrequency;
            }
        }

        return found;
    }
}
