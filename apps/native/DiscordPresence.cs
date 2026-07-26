using DiscordRPC;
using DiscordRPC.Logging;
using System.Text.Json.Nodes;

namespace SBLauncher.Native;

/// <summary>
/// Discord Rich Presence ("Playing SB Launcher") via local Discord IPC.
/// Requires a Discord Application ID from https://discord.com/developers/applications
/// and Discord desktop running on the same machine.
/// </summary>
internal sealed class DiscordPresence : IDisposable
{
    /// <summary>
    /// Default Application ID shipped with the launcher (Discord Developer Portal).
    /// Optional Rich Presence art asset key: <c>sblogo</c>.
    /// Prefs key <c>discordApplicationId</c> can override this for testing.
    /// </summary>
    private const string DefaultApplicationId = "1530790384077246494";

    private readonly Action<string> _log;
    private DiscordRpcClient? _client;
    private DateTime? _startedAt;
    private string _applicationId = DefaultApplicationId;
    private string _details = "In the launcher";
    private string _state = "Browsing";
    private bool _enabled = true;
    private bool _disposed;

    public DiscordPresence(Action<string> log)
    {
        _log = log;
    }

    public bool IsConfigured => IsValidApplicationId(_applicationId);
    public bool IsReady => _client is { IsInitialized: true };

    public void SyncFromPrefs(JsonObject prefs)
    {
        var enabled = prefs["discordRichPresence"]?.GetValueKind() switch
        {
            System.Text.Json.JsonValueKind.False => false,
            System.Text.Json.JsonValueKind.True => true,
            _ => true,
        };

        var fromPrefs = prefs["discordApplicationId"]?.GetValue<string>()?.Trim() ?? "";
        var nextId = IsValidApplicationId(fromPrefs) ? fromPrefs : DefaultApplicationId;
        if (!string.Equals(nextId, _applicationId, StringComparison.Ordinal))
        {
            _applicationId = nextId;
            ClearAndDisposeClient();
        }

        SetEnabled(enabled);
    }

    public void SetEnabled(bool enabled)
    {
        if (_disposed) return;
        _enabled = enabled;
        if (!enabled)
        {
            ClearAndDisposeClient();
            return;
        }

        EnsureClient();
        ApplyPresence();
    }

    public void SetActivity(string? details, string? state)
    {
        if (_disposed) return;
        if (!string.IsNullOrWhiteSpace(details))
            _details = Truncate(details.Trim(), 128);
        if (!string.IsNullOrWhiteSpace(state))
            _state = Truncate(state.Trim(), 128);
        if (_enabled)
        {
            EnsureClient();
            ApplyPresence();
        }
    }

    public void SetBrowsing() => SetActivity("In the launcher", "Browsing");

    public void SetPlaying(string gameName)
    {
        var name = string.IsNullOrWhiteSpace(gameName) ? "Roblox" : gameName.Trim();
        SetActivity($"Playing {Truncate(name, 100)}", "via SB Launcher");
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        ClearAndDisposeClient();
    }

    private void EnsureClient()
    {
        if (_disposed || !_enabled) return;
        if (!IsConfigured)
        {
            _log("Discord RPC skipped: set Application ID in Settings or DiscordPresence.DefaultApplicationId.");
            return;
        }

        if (_client is { IsInitialized: true }) return;

        ClearAndDisposeClient();
        try
        {
            _client = new DiscordRpcClient(_applicationId)
            {
                Logger = new NullLogger(),
            };
            _client.OnReady += (_, e) =>
                _log($"Discord RPC ready as {e.User?.Username ?? "unknown"}");
            _client.OnConnectionFailed += (_, e) =>
                _log($"Discord RPC connection failed (pipe {e.FailedPipe}). Is Discord open?");
            _client.OnError += (_, e) =>
                _log($"Discord RPC error: {e.Message}");

            if (!_client.Initialize())
            {
                _log("Discord RPC Initialize() returned false.");
                ClearAndDisposeClient();
                return;
            }

            _startedAt ??= DateTime.UtcNow;
            _log("Discord RPC initialized.");
        }
        catch (Exception ex)
        {
            _log($"Discord RPC init failed: {ex.Message}");
            ClearAndDisposeClient();
        }
    }

    private void ApplyPresence()
    {
        if (_client is not { IsInitialized: true }) return;
        try
        {
            _client.SetPresence(new RichPresence
            {
                Details = _details,
                State = _state,
                Assets = new Assets
                {
                    LargeImageKey = "sblogo",
                    LargeImageText = "SB Launcher",
                },
                Timestamps = _startedAt is DateTime start
                    ? new Timestamps(start)
                    : Timestamps.Now,
                Buttons =
                [
                    new Button
                    {
                        Label = "Download",
                        Url = "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/",
                    },
                ],
            });
            _client.Invoke();
        }
        catch (Exception ex)
        {
            _log($"Discord RPC SetPresence failed: {ex.Message}");
        }
    }

    private void ClearAndDisposeClient()
    {
        if (_client is null) return;
        try
        {
            if (_client.IsInitialized)
            {
                _client.ClearPresence();
                _client.Invoke();
            }
        }
        catch { /* ignore */ }
        try { _client.Dispose(); } catch { /* ignore */ }
        _client = null;
    }

    private static bool IsValidApplicationId(string id)
        => !string.IsNullOrWhiteSpace(id) && id.Length >= 17 && id.All(char.IsDigit);

    private static string Truncate(string value, int max)
        => value.Length <= max ? value : value[..(max - 1)] + "…";
}
