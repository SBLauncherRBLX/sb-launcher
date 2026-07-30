using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace SBLauncher.Native;

/// <summary>
/// Best-effort hint for which Roblox account the desktop client is signed into.
/// Reads only identity hints (Credential Manager user id + recent log lines) —
/// never reads or stores .ROBLOSECURITY.
/// </summary>
internal static class RobloxLoggedInUser
{
    private const uint CredTypeGeneric = 1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr buffer);

    public static object Probe()
    {
        var (userId, source) = Detect();
        return new { userId, source };
    }

    public static (string? userId, string source) Detect()
    {
        var fromCred = TryReadCredentialUserId();
        if (!string.IsNullOrWhiteSpace(fromCred))
            return (fromCred, "credential");

        var fromLogs = TryReadFromLogs();
        if (!string.IsNullOrWhiteSpace(fromLogs))
            return (fromLogs, "logs");

        return (null, "none");
    }

    private static string? TryReadCredentialUserId()
    {
        // Roblox stores the signed-in Studio/Player account id here (identity only).
        var targets = new[]
        {
            "https://www.roblox.com:RobloxStudioAuthuserid",
            "https://www.roblox.com:RobloxStudioAuthUserId",
            "https://www.roblox.com:RobloxAuthuserid",
        };

        foreach (var target in targets)
        {
            try
            {
                if (!CredRead(target, CredTypeGeneric, 0, out var ptr) || ptr == IntPtr.Zero)
                    continue;
                try
                {
                    var cred = Marshal.PtrToStructure<CREDENTIAL>(ptr);
                    if (cred.CredentialBlob == IntPtr.Zero || cred.CredentialBlobSize == 0)
                        continue;
                    var bytes = new byte[cred.CredentialBlobSize];
                    Marshal.Copy(cred.CredentialBlob, bytes, 0, bytes.Length);
                    var text = DecodeCredentialBlob(bytes);
                    var id = ExtractDigits(text);
                    if (!string.IsNullOrWhiteSpace(id))
                        return id;
                }
                finally
                {
                    CredFree(ptr);
                }
            }
            catch
            {
                // Best-effort only.
            }
        }

        return null;
    }

    private static string DecodeCredentialBlob(byte[] bytes)
    {
        // Common encodings Roblox has used for this target: UTF-16LE or UTF-8.
        try
        {
            if (bytes.Length >= 2 && bytes.Length % 2 == 0)
            {
                var utf16 = Encoding.Unicode.GetString(bytes).Trim('\0', ' ', '\r', '\n', '\t');
                if (ExtractDigits(utf16) is { Length: > 0 } id16)
                    return utf16;
            }
        }
        catch
        {
            // fall through
        }

        return Encoding.UTF8.GetString(bytes).Trim('\0', ' ', '\r', '\n', '\t');
    }

    private static string? TryReadFromLogs()
    {
        try
        {
            var logsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Roblox",
                "logs");
            if (!Directory.Exists(logsDir))
                return null;

            var files = Directory.EnumerateFiles(logsDir, "*.log")
                .Select(path => new FileInfo(path))
                .OrderByDescending(info => info.LastWriteTimeUtc)
                .Take(8)
                .ToArray();

            // Prefer the newest mention of a numeric user id.
            string? latest = null;
            DateTime latestStamp = DateTime.MinValue;

            foreach (var file in files)
            {
                var text = ReadTail(file.FullName, 512 * 1024);
                if (string.IsNullOrEmpty(text)) continue;

                foreach (Match match in UserIdPatterns.SelectMany(pattern => pattern.Matches(text)))
                {
                    var id = ExtractDigits(match.Groups[1].Value);
                    if (string.IsNullOrWhiteSpace(id)) continue;
                    if (file.LastWriteTimeUtc >= latestStamp)
                    {
                        latestStamp = file.LastWriteTimeUtc;
                        latest = id;
                    }
                }
            }

            return latest;
        }
        catch
        {
            return null;
        }
    }

    private static readonly Regex[] UserIdPatterns =
    [
        new(@"userid[""'\s:=]+(\d{5,})", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"userId[""'\s:=]+(\d{5,})", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"UserId[""'\s:=]+(\d{5,})", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"playerId[""'\s:=]+(\d{5,})", RegexOptions.IgnoreCase | RegexOptions.Compiled),
    ];

    private static string ReadTail(string path, int maxBytes)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        if (stream.Length <= 0) return "";
        var start = Math.Max(0, stream.Length - maxBytes);
        stream.Seek(start, SeekOrigin.Begin);
        var buffer = new byte[stream.Length - start];
        var read = stream.Read(buffer, 0, buffer.Length);
        return Encoding.UTF8.GetString(buffer, 0, read);
    }

    private static string? ExtractDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var match = Regex.Match(value, @"\d{5,}");
        return match.Success ? match.Value : null;
    }
}
