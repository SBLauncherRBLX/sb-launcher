using DiscordRPC;
using DiscordRPC.Logging;
using System.Text.Json.Nodes;

namespace SBLauncher.Native;

/// <summary>
/// Discord Rich Presence via local Discord IPC (game activity + join / game page buttons).
/// </summary>
internal sealed class DiscordPresence : IDisposable
{
    /// <summary>
    /// Default Application ID shipped with the launcher (Discord Developer Portal).
    /// Optional art asset key: <c>sblogo</c>. Prefs <c>discordApplicationId</c> can override.
    /// </summary>
    private const string DefaultApplicationId = "1530790384077246494";
    private const string FallbackLargeImage = "sblogo";

    private readonly Action<string> _log;
    private DiscordRpcClient? _client;
    private string _applicationId = DefaultApplicationId;
    private bool _enabled = true;
    private bool _disposed;

    // Feature toggles (prefs)
    private bool _showWhenBrowsing = true;
    private bool _showGameThumbnail = true;
    private bool _showElapsed = true;
    private bool _showJoinButton = true;
    private bool _showGamePageButton = true;

    // Activity state
    private bool _inGame;
    private string _details = "In the launcher";
    private string _state = "Browsing";
    private string? _placeId;
    private string? _gameInstanceId;
    private string? _iconUrl;
    private string? _largeImageText;
    private DateTime? _startedAt;

    public DiscordPresence(Action<string> log)
    {
        _log = log;
    }

    public bool IsConfigured => IsValidApplicationId(_applicationId);

    public void SyncFromPrefs(JsonObject prefs)
    {
        var enabled = ReadBool(prefs, "discordRichPresence", defaultValue: true);
        _showWhenBrowsing = ReadBool(prefs, "discordShowWhenBrowsing", defaultValue: true);
        _showGameThumbnail = ReadBool(prefs, "discordShowGameThumbnail", defaultValue: true);
        _showElapsed = ReadBool(prefs, "discordShowElapsed", defaultValue: true);
        _showJoinButton = ReadBool(prefs, "discordShowJoinButton", defaultValue: true);
        _showGamePageButton = ReadBool(prefs, "discordShowGamePageButton", defaultValue: true);

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

    public void SetBrowsing()
    {
        if (_disposed) return;
        _inGame = false;
        _placeId = null;
        _gameInstanceId = null;
        _iconUrl = null;
        _largeImageText = "SB Launcher";
        _details = "In the launcher";
        _state = "Browsing";
        _startedAt = DateTime.UtcNow;
        if (_enabled)
        {
            EnsureClient();
            ApplyPresence();
        }
    }

    public void SetPlaying(ActivityPayload activity)
    {
        if (_disposed) return;
        var name = string.IsNullOrWhiteSpace(activity.GameName) ? "Roblox" : activity.GameName.Trim();
        _inGame = true;
        _details = Truncate(name, 128);
        _state = BuildPlayingState(activity);
        _placeId = NullIfEmpty(activity.PlaceId);
        _gameInstanceId = NullIfEmpty(activity.GameInstanceId);
        _iconUrl = NormalizeImageUrl(activity.IconUrl);
        _largeImageText = Truncate(name, 128);
        _startedAt = DateTime.UtcNow;
        _log(
            $"Discord RPC playing placeId={_placeId ?? "-"} jobId={_gameInstanceId ?? "-"} " +
            $"join={_showJoinButton} page={_showGamePageButton}");
        if (_enabled)
        {
            EnsureClient();
            ApplyPresence();
        }
    }

    public void SetActivity(string? details, string? state)
    {
        if (_disposed) return;
        _inGame = false;
        if (!string.IsNullOrWhiteSpace(details))
            _details = Truncate(details.Trim(), 128);
        if (!string.IsNullOrWhiteSpace(state))
            _state = Truncate(state.Trim(), 128);
        _startedAt ??= DateTime.UtcNow;
        if (_enabled)
        {
            EnsureClient();
            ApplyPresence();
        }
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
            if (!_inGame && !_showWhenBrowsing)
            {
                _client.ClearPresence();
                _client.Invoke();
                return;
            }

            var largeKey = FallbackLargeImage;
            var largeText = _largeImageText ?? "SB Launcher";
            if (_inGame && _showGameThumbnail && !string.IsNullOrWhiteSpace(_iconUrl))
                largeKey = _iconUrl!;

            var buttons = BuildButtons();
            var presence = new RichPresence
            {
                Details = _details,
                State = _state,
                Assets = new Assets
                {
                    LargeImageKey = largeKey,
                    LargeImageText = largeText,
                    SmallImageKey = _inGame ? FallbackLargeImage : null,
                    SmallImageText = _inGame ? "SB Launcher" : null,
                },
            };

            if (_showElapsed && _startedAt is DateTime start)
                presence.Timestamps = new Timestamps(start);

            if (buttons.Count > 0)
                presence.Buttons = buttons.ToArray();

            _log($"Discord RPC SetPresence buttons={buttons.Count} inGame={_inGame}");
            _client.SetPresence(presence);
            _client.Invoke();
        }
        catch (Exception ex)
        {
            _log($"Discord RPC SetPresence failed: {ex.Message}");
        }
    }

    private List<Button> BuildButtons()
    {
        var buttons = new List<Button>(2);
        if (!_inGame || string.IsNullOrWhiteSpace(_placeId))
            return buttons;

        // Join specific server when we have a job / instance id; otherwise join the experience.
        if (_showJoinButton)
        {
            if (!string.IsNullOrWhiteSpace(_gameInstanceId))
            {
                buttons.Add(new Button
                {
                    Label = "Join server",
                    Url =
                        $"https://www.roblox.com/games/start?placeId={Uri.EscapeDataString(_placeId)}&gameInstanceId={Uri.EscapeDataString(_gameInstanceId)}",
                });
            }
            else
            {
                buttons.Add(new Button
                {
                    Label = "Join game",
                    Url = $"https://www.roblox.com/games/start?placeId={Uri.EscapeDataString(_placeId)}",
                });
            }
        }

        if (_showGamePageButton && buttons.Count < 2)
        {
            buttons.Add(new Button
            {
                Label = "See game page",
                Url = $"https://www.roblox.com/games/{Uri.EscapeDataString(_placeId)}",
            });
        }

        return buttons;
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

    private static string BuildPlayingState(ActivityPayload activity)
    {
        var server = (activity.ServerType ?? "").Trim().ToLowerInvariant();
        if (server is "private")
            return "In a private server";
        if (server is "reserved")
            return "In a reserved server";

        var creator = NullIfEmpty(activity.CreatorName);
        if (creator is not null)
            return Truncate($"by {creator}", 128);

        if (!string.IsNullOrWhiteSpace(activity.GameInstanceId))
            return "In a public server";

        return "Playing on Roblox";
    }

    private static string? NormalizeImageUrl(string? url)
    {
        var value = NullIfEmpty(url);
        if (value is null) return null;
        if (!value.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            return null;
        return Truncate(value, 256);
    }

    private static string? NullIfEmpty(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool ReadBool(JsonObject prefs, string key, bool defaultValue)
        => prefs[key]?.GetValueKind() switch
        {
            System.Text.Json.JsonValueKind.False => false,
            System.Text.Json.JsonValueKind.True => true,
            _ => defaultValue,
        };

    private static bool IsValidApplicationId(string id)
        => !string.IsNullOrWhiteSpace(id) && id.Length >= 17 && id.All(char.IsDigit);

    private static string Truncate(string value, int max)
        => value.Length <= max ? value : value[..(max - 1)] + "…";

    internal sealed class ActivityPayload
    {
        public string? GameName { get; init; }
        public string? PlaceId { get; init; }
        public string? GameInstanceId { get; init; }
        public string? UniverseId { get; init; }
        public string? IconUrl { get; init; }
        public string? CreatorName { get; init; }
        public string? ServerType { get; init; }
    }
}
