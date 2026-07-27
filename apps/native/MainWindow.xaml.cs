using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Runtime.InteropServices;
using System.Xml.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace SBLauncher.Native;

public partial class MainWindow : Window
{
    private const string AppOrigin = "https://app.sblauncher";
    private const string ApiOrigin = "http://localhost:8787";
    private const string ApiBindHost = "127.0.0.1";
    private const string ApiBindOrigin = "http://127.0.0.1:8787";

    // Built-in Roblox OAuth Client ID shipped with the launcher. When set, users
    // don't have to paste it manually in Settings (they can still override it).
    // The Client ID is public by design — the flow uses PKCE and no client secret.
    private const string DefaultOAuthClientId = "5241861775028052909";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private static readonly string[] RobloxProcessNames =
        ["RobloxPlayerBeta", "Windows10Universal", "Roblox"];

    // Same leave marker Bloxstrap uses for "Don't exit to desktop app".
    private const string RobloxLeaveDesktopAppMarker =
        "[FLog::SingleSurfaceApp] leaveUGCGameInternal";

    private readonly string _dataDirectory;
    private readonly string _wallpaperDirectory;
    private readonly string _profileAvatarDirectory;
    private readonly string _nickBadgeDirectory;
    private readonly string _robloxAppIconDirectory;
    private readonly Mutex _singleInstance;
    private readonly DispatcherTimer _authTimer;
    private Process? _apiProcess;
    private string? _pendingAuthToken;
    private string _apiInstanceToken = "";
    private bool _isSecondary;
    private CancellationTokenSource? _robloxSessionMonitorCts;
    private DiscordPresence? _discordPresence;
    private Updater? _updater;

    private Storyboard? _splashMarkSnake;
    private double _windowCornerRadius = 16;
    private IntPtr _windowRegion = IntPtr.Zero;

    public MainWindow()
    {
        InitializeComponent();

        _dataDirectory = UserDataPaths.Root;
        _wallpaperDirectory = UserDataPaths.WallpapersDirectory;
        _profileAvatarDirectory = UserDataPaths.ProfileAvatarDirectory;
        _nickBadgeDirectory = UserDataPaths.NickBadgesDirectory;
        _robloxAppIconDirectory = UserDataPaths.RobloxAppIconsDirectory;
        UserDataPaths.EnsureDirectories();
        UserDataPaths.MigrateLegacyData(AppContext.BaseDirectory, Log);
        UserDataPaths.HandleInstallUpgrade(AppContext.BaseDirectory, Log);
        Log($"MainWindow created. Base={AppContext.BaseDirectory}; Data={_dataDirectory}");
        _singleInstance = new Mutex(true, @"Local\SBLauncher.Native.Singleton", out var createdNew);
        _isSecondary = !createdNew;
        Log($"Single instance owner={createdNew}");
        CaptureProtocolToken(Environment.GetCommandLineArgs());

        _authTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(700) };
        _authTimer.Tick += (_, _) => CheckPendingAuthFile();
        SizeChanged += (_, _) => ApplyWindowCornerClip();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        Log("Window loaded.");
        EnsureMaximizeFitsWorkArea();
        ApplySplashLogoFromPrefs();
        ApplyWindowChromeFromPrefs();
        RobloxAppearance.RestoreLegacyModBackupsIfPresent();
        if (_isSecondary)
        {
            WritePendingTokenForPrimary();
            Application.Current.Shutdown();
            return;
        }

        RegisterProtocolHandler();
        _authTimer.Start();
        await StartApplicationAsync();
    }

    private async Task StartApplicationAsync()
    {
        RetryButton.Visibility = Visibility.Collapsed;
        StartupProgress.Visibility = Visibility.Visible;
        StartSplashMarkSnake();
        StatusText.Text = "Starting secure services…";

        try
        {
            await StartApiAsync();
            StatusText.Text = "Loading interface…";
            await InitializeBrowserAsync();
            _updater = new Updater(Log, PushBrowserEvent, Dispatcher);
            StartDiscordPresence();
        }
        catch (Exception ex)
        {
            Log($"Startup failed: {ex}");
            StatusText.Text = $"Startup failed: {ex.Message}";
            StopSplashMarkSnake();
            StartupProgress.Visibility = Visibility.Collapsed;
            RetryButton.Visibility = Visibility.Visible;
        }
    }

    private void StartSplashMarkSnake()
    {
        _splashMarkSnake ??= (Storyboard)FindResource("SplashMarkSnakeStoryboard");
        _splashMarkSnake.Begin(this, true);
    }

    private void StopSplashMarkSnake()
    {
        _splashMarkSnake?.Stop(this);
    }

    private async Task StartApiAsync()
    {
        if (await IsOurApiReadyAsync()) return;

        var runtime = Path.Combine(AppContext.BaseDirectory, "runtime");
        var nodePath = Path.Combine(runtime, "node.exe");
        var apiEntry = Path.Combine(runtime, "api", "index.cjs");
        var templateDb = Path.Combine(runtime, "api", "template.db");
        var databasePath = UserDataPaths.DatabasePath;
        Log($"Starting API. Node={nodePath}; Entry={apiEntry}; DB={databasePath}");

        if (!File.Exists(nodePath) || !File.Exists(apiEntry))
            throw new FileNotFoundException(
                "Native runtime is incomplete. Reinstall SB Launcher using the official setup.");

        if (!File.Exists(databasePath))
        {
            if (!File.Exists(templateDb))
                throw new FileNotFoundException("Database template is missing.");
            File.Copy(templateDb, databasePath);
        }

        // Orphan API from a previous crash/update often still holds :8787.
        // Kill only SB Launcher node.exe leftovers; never touch unrelated software.
        if (await IsAnyApiRespondingAsync() && !await IsOurApiReadyAsync())
        {
            if (TryKillStaleLauncherApiProcesses())
            {
                for (var i = 0; i < 30 && await IsAnyApiRespondingAsync(); i++)
                    await Task.Delay(100);
            }

            if (await IsAnyApiRespondingAsync() && !await IsOurApiReadyAsync())
            {
                throw new InvalidOperationException(
                    "Port 8787 is already in use by another program. Close it and restart SB Launcher.");
            }
        }

        var hostConfig = LoadHostConfig();
        var buildId = UserDataPaths.ReadBuildIdFromInstall(AppContext.BaseDirectory) ?? "";
        // Version must come from the shipped build-info so it never drifts from the release.
        var appVersion = UserDataPaths.ReadVersionFromInstall(AppContext.BaseDirectory)?.Trim();
        if (string.IsNullOrWhiteSpace(appVersion))
        {
            appVersion = Assembly.GetExecutingAssembly()
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                ?.Split('+')[0];
        }
        _apiInstanceToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var start = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = $"\"{apiEntry}\"",
            WorkingDirectory = Path.Combine(runtime, "api"),
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.Environment["PORT"] = "8787";
        start.Environment["HOST"] = ApiBindHost;
        start.Environment["APP_URL"] = ApiOrigin;
        start.Environment["CORS_ORIGIN"] = AppOrigin;
        start.Environment["DATABASE_URL"] = $"file:{databasePath.Replace('\\', '/')}";
        start.Environment["DESKTOP_PROTOCOL"] = "sblauncher";
        start.Environment["SESSION_SECRET"] = hostConfig["sessionSecret"]!.GetValue<string>();
        start.Environment["TOKEN_ENCRYPTION_KEY"] = hostConfig["encryptionKey"]!.GetValue<string>();
        start.Environment["ROBLOX_CLIENT_ID"] = hostConfig["oauthClientId"]?.GetValue<string>() ?? "";
        start.Environment["ROBLOX_CLIENT_SECRET"] = "";
        start.Environment["ROBLOX_REDIRECT_URI"] = $"{ApiOrigin}/auth/roblox/callback";
        start.Environment["ROBLOX_SCOPES"] =
            "openid profile user.social:read user.inventory-item:read";
        start.Environment["SB_BUILD_ID"] = buildId;
        start.Environment["SB_APP_VERSION"] = appVersion ?? "";
        start.Environment["SB_CLOUD_URL"] =
            hostConfig["cloudUrl"]?.GetValue<string>()?.Trim()
            ?? "https://sb-launcher-cloud.sblauncherrblx.workers.dev";
        start.Environment["SB_INSTANCE_TOKEN"] = _apiInstanceToken;

        _apiProcess = Process.Start(start)
            ?? throw new InvalidOperationException("Could not start SB Launcher API.");
        _apiProcess.OutputDataReceived += (_, args) =>
        {
            if (args.Data is not null) Log($"API: {args.Data}");
        };
        _apiProcess.ErrorDataReceived += (_, args) =>
        {
            if (args.Data is not null) Log($"API ERROR: {args.Data}");
        };
        _apiProcess.BeginOutputReadLine();
        _apiProcess.BeginErrorReadLine();

        for (var i = 0; i < 40; i++)
        {
            if (_apiProcess.HasExited)
                throw new InvalidOperationException("SB Launcher API stopped during startup.");
            if (await IsOurApiReadyAsync()) return;
            await Task.Delay(250);
        }
        throw new TimeoutException("SB Launcher API did not become ready.");
    }

    private async Task<bool> IsAnyApiRespondingAsync()
    {
        try
        {
            using var response = await Http.GetAsync($"{ApiBindOrigin}/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Kill leftover <c>runtime\node.exe</c> processes from this (or a broken parallel)
    /// SB Launcher install that still hold port 8787 after a crash / failed update.
    /// </summary>
    private bool TryKillStaleLauncherApiProcesses()
    {
        var killed = false;
        var ourNode = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "runtime", "node.exe"));
        foreach (var process in Process.GetProcessesByName("node"))
        {
            try
            {
                string? path = null;
                try { path = process.MainModule?.FileName; } catch { /* access denied */ }
                if (string.IsNullOrWhiteSpace(path)) continue;

                var full = Path.GetFullPath(path);
                var isOurs =
                    string.Equals(full, ourNode, StringComparison.OrdinalIgnoreCase) ||
                    full.Contains(@"\SB Launcher\runtime\node.exe", StringComparison.OrdinalIgnoreCase) ||
                    full.Contains(@"\Programs\SB\runtime\node.exe", StringComparison.OrdinalIgnoreCase);
                if (!isOurs) continue;

                Log($"Killing stale launcher API node PID={process.Id} Path={full}");
                process.Kill(entireProcessTree: true);
                killed = true;
            }
            catch (Exception ex)
            {
                Log($"Could not kill stale node PID={process.Id}: {ex.Message}");
            }
            finally
            {
                try { process.Dispose(); } catch { /* ignore */ }
            }
        }

        return killed;
    }

    private async Task<bool> IsOurApiReadyAsync()
    {
        if (string.IsNullOrEmpty(_apiInstanceToken)) return false;
        try
        {
            using var response = await Http.GetAsync($"{ApiBindOrigin}/health");
            if (!response.IsSuccessStatusCode) return false;
            var json = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
            var token = json?["instanceToken"]?.GetValue<string>() ?? "";
            return string.Equals(token, _apiInstanceToken, StringComparison.Ordinal);
        }
        catch
        {
            return false;
        }
    }

    private async Task InitializeBrowserAsync()
    {
        var webRoot = UserDataPaths.ResolveWebRoot(AppContext.BaseDirectory);
        if (!File.Exists(Path.Combine(webRoot, "index.html")))
            throw new FileNotFoundException("SB Launcher interface files are missing.");

        Log($"Loading interface from {webRoot}");
        EnsureFreshWebBundle(webRoot);

        var webViewData = UserDataPaths.WebView2Directory;
        var environment = await CoreWebView2Environment.CreateAsync(null, webViewData);
        await Browser.EnsureCoreWebView2Async(environment);

        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.sblauncher",
            webRoot,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "wallpapers.sblauncher",
            _wallpaperDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "profile.sblauncher",
            _profileAvatarDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "badges.sblauncher",
            _nickBadgeDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "appicons.sblauncher",
            _robloxAppIconDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "launchoverlay.sblauncher",
            UserDataPaths.LaunchOverlayDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "robloxfonts.sblauncher",
            UserDataPaths.RobloxFontsDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        Browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
        Browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
        Browser.CoreWebView2.Settings.IsWebMessageEnabled = true;
        Browser.CoreWebView2.NavigationStarting += (_, args) =>
        {
            if (!IsAllowedWebViewUri(args.Uri))
            {
                args.Cancel = true;
                try { OpenExternal(args.Uri); } catch { /* ignore unsupported schemes */ }
            }
        };
        Browser.CoreWebView2.FrameNavigationStarting += (_, args) =>
        {
            if (!IsAllowedWebViewUri(args.Uri))
                args.Cancel = true;
        };
        Browser.CoreWebView2.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            try { OpenExternal(args.Uri); } catch { /* ignore */ }
        };
        Browser.CoreWebView2.WebMessageReceived += Browser_WebMessageReceived;
        Browser.CoreWebView2.NavigationCompleted += (_, args) =>
        {
            if (!args.IsSuccess)
            {
                StatusText.Text = $"Interface failed to load ({args.WebErrorStatus}).";
                RetryButton.Visibility = Visibility.Visible;
                StopSplashMarkSnake();
                StartupProgress.Visibility = Visibility.Collapsed;
                return;
            }
            Browser.Visibility = Visibility.Visible;
            HideSplash();
            SendPendingAuthToken();
        };

        await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);
        var bundleStamp = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(webRoot, "index.html"))))[..12];
        Browser.CoreWebView2.Navigate($"{AppOrigin}/index.html?v={bundleStamp}");
    }

    private void EnsureFreshWebBundle(string webRoot)
    {
        var indexPath = Path.Combine(webRoot, "index.html");
        var bundleVersion = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(indexPath)))[..16];
        var markerPath = UserDataPaths.WebBundleMarkerPath;
        var previousVersion = File.Exists(markerPath) ? File.ReadAllText(markerPath).Trim() : "";

        if (!string.Equals(previousVersion, bundleVersion, StringComparison.Ordinal) &&
            Directory.Exists(UserDataPaths.WebView2Directory))
        {
            try
            {
                Directory.Delete(UserDataPaths.WebView2Directory, true);
                Log($"Cleared WebView2 cache after interface update ({previousVersion} -> {bundleVersion}).");
            }
            catch (Exception ex)
            {
                Log($"Could not clear WebView2 cache: {ex.Message}");
            }
        }

        try
        {
            File.WriteAllText(markerPath, bundleVersion);
        }
        catch
        {
            // Non-critical marker.
        }
    }

    private async void Browser_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? id = null;
        try
        {
            if (!IsAllowedWebViewUri(Browser.CoreWebView2?.Source))
                throw new InvalidOperationException("Bridge blocked for this origin.");

            var message = JsonNode.Parse(e.WebMessageAsJson)?.AsObject()
                ?? throw new InvalidOperationException("Invalid bridge request.");
            id = message["id"]?.GetValue<string>();
            var method = message["method"]?.GetValue<string>()
                ?? throw new InvalidOperationException("Bridge method is missing.");
            var args = message["args"] as JsonArray ?? [];
            var result = await HandleBridgeCallAsync(method, args);
            PostBridgeResponse(id, true, result, null);
        }
        catch (Exception ex)
        {
            PostBridgeResponse(id, false, null, ex.Message);
        }
    }

    private static bool IsAllowedWebViewUri(string? uriString)
    {
        if (string.IsNullOrWhiteSpace(uriString)) return false;
        if (!Uri.TryCreate(uriString, UriKind.Absolute, out var uri)) return false;
        if (!string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase))
            return false;
        return uri.Host is "app.sblauncher"
            or "wallpapers.sblauncher"
            or "profile.sblauncher"
            or "badges.sblauncher"
            or "appicons.sblauncher"
            or "launchoverlay.sblauncher"
            or "robloxfonts.sblauncher";
    }

    private async Task<JsonNode?> HandleBridgeCallAsync(string method, JsonArray args)
    {
        switch (method)
        {
            case "prefs:get":
                return LoadJsonObject(UserDataPaths.LocalPrefsPath);
            case "prefs:set":
            {
                var prefsPath = UserDataPaths.LocalPrefsPath;
                var prefs = LoadJsonObject(prefsPath);
                var patch = args.Count > 0 ? args[0] as JsonObject : null;
                if (patch is not null)
                {
                    foreach (var pair in patch)
                        prefs[pair.Key] = pair.Value?.DeepClone();
                }
                SaveJsonObject(prefsPath, prefs);
                if (patch is not null &&
                    patch.Any(pair => pair.Key.StartsWith("discord", StringComparison.OrdinalIgnoreCase)))
                    _discordPresence?.SyncFromPrefs(prefs);
                return prefs;
            }
            case "discord:setActivity":
            {
                var payload = args.Count > 0 ? args[0] as JsonObject : null;
                var details = ReadBridgeString(payload, "details");
                var state = ReadBridgeString(payload, "state");
                var playing = ReadBridgeString(payload, "playing");
                var mode = ReadBridgeString(payload, "mode")?.Trim().ToLowerInvariant();
                var placeId = ReadBridgeString(payload, "placeId");
                var gameInstanceId = ReadBridgeString(payload, "gameInstanceId");
                var universeId = ReadBridgeString(payload, "universeId");
                var iconUrl = ReadBridgeString(payload, "iconUrl");
                var creatorName = ReadBridgeString(payload, "creatorName");
                var serverType = ReadBridgeString(payload, "serverType");

                var isPlaying =
                    string.Equals(mode, "playing", StringComparison.Ordinal) ||
                    !string.IsNullOrWhiteSpace(playing) ||
                    !string.IsNullOrWhiteSpace(placeId);

                if (isPlaying && !string.Equals(mode, "browsing", StringComparison.Ordinal))
                {
                    _discordPresence?.SetPlaying(new DiscordPresence.ActivityPayload
                    {
                        GameName = playing ?? details,
                        PlaceId = placeId,
                        GameInstanceId = gameInstanceId,
                        UniverseId = universeId,
                        IconUrl = iconUrl,
                        CreatorName = creatorName,
                        ServerType = serverType,
                    });
                }
                else if (!string.IsNullOrWhiteSpace(details) || !string.IsNullOrWhiteSpace(state))
                    _discordPresence?.SetActivity(details, state);
                else
                    _discordPresence?.SetBrowsing();
                return JsonValue.Create(true);
            }
            case "discord:clear":
                _discordPresence?.SetBrowsing();
                return JsonValue.Create(true);
            case "update:start":
            {
                if (_updater is null)
                    throw new InvalidOperationException("Updater is not ready yet.");
                var payload = args.Count > 0 ? args[0] as JsonObject : null;
                var downloadUrl = payload?["downloadUrl"]?.GetValue<string>() ?? "";
                var version = payload?["version"]?.GetValue<string>() ?? "";
                var keepPresets = payload?["keepPresets"]?.GetValue<bool>() ?? true;
                if (string.IsNullOrWhiteSpace(version))
                    throw new InvalidOperationException("Update version is missing.");
                // Fire-and-forget so the bridge returns while download runs; progress is pushed.
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _updater.StartAsync(downloadUrl, version, keepPresets);
                    }
                    catch (OperationCanceledException)
                    {
                        // already reported
                    }
                    catch
                    {
                        // already reported via update-progress error
                    }
                });
                return JsonValue.Create(true);
            }
            case "update:cancel":
                _updater?.Cancel();
                return JsonValue.Create(true);
            case "shell:openExternal":
                OpenExternal(args[0]?.GetValue<string>() ?? "");
                return JsonValue.Create(true);
            case "shell:openRoblox":
            {
                var url = args[0]?.GetValue<string>() ?? "";
                JsonNode? optimization = null;
                var returnToLauncher = true;
                JsonObject? graphics = args.Count > 1 ? args[1] as JsonObject : null;
                if (graphics is not null)
                {
                    var applyAll = graphics["applyOnLaunch"]?.GetValue<bool>() == true;
                    var customFont = graphics["robloxFontMode"]?.GetValue<string>() == "custom";
                    if ((applyAll || customFont) && GetRobloxProcesses().Length == 0)
                        optimization = JsonSerializer.SerializeToNode(ApplyRobloxSettings(graphics));
                    returnToLauncher =
                        graphics["returnToLauncherOnExit"]?.GetValue<bool>() ?? true;
                }
                var existingRobloxPids = GetRobloxProcesses()
                    .Select(process => process.Id)
                    .ToHashSet();

                // Always watch the Roblox session so Discord presence clears on leave/exit,
                // even when "return to launcher" is off.
                _robloxSessionMonitorCts?.Cancel();
                _robloxSessionMonitorCts = new CancellationTokenSource();
                _ = MonitorRobloxSessionAsync(
                    existingRobloxPids,
                    returnToLauncher,
                    _robloxSessionMonitorCts.Token);

                await LaunchOverlay.ShowDuringLaunchAsync(
                    this,
                    graphics ?? new JsonObject(),
                    () =>
                    {
                        OpenExternal(url);
                        return Task.CompletedTask;
                    });

                if (returnToLauncher)
                    WindowState = WindowState.Minimized;
                return JsonSerializer.SerializeToNode(new { ok = true, optimization });
            }
            case "auth:getPendingToken":
            {
                var token = _pendingAuthToken;
                _pendingAuthToken = null;
                return token is null ? null : JsonValue.Create(token);
            }
            case "roblox:detect":
                return JsonSerializer.SerializeToNode(DetectRoblox());
            case "roblox:isRunning":
                return JsonValue.Create(GetRobloxProcesses().Length > 0);
            case "roblox:applySettings":
            {
                if (args[0] is not JsonObject graphics)
                    throw new ArgumentException("Graphics settings are missing.");
                return JsonSerializer.SerializeToNode(ApplyRobloxSettings(graphics));
            }
            case "roblox:pickFont":
                return JsonSerializer.SerializeToNode(RobloxAppearance.PickCustomFont());
            case "roblox:fontPreviewDataUrl":
            {
                var fontId = args.Count > 0 ? args[0]?.GetValue<string>() : null;
                return JsonValue.Create(RobloxAppearance.GetFontPreviewDataUrl(fontId));
            }
            case "media:sampleLuminance":
            {
                var mediaUrl = args.Count > 0 ? args[0]?.GetValue<string>() : null;
                var luminance = await MediaLuminance.SampleUrlAsync(mediaUrl);
                return luminance is null ? null : JsonValue.Create(luminance);
            }
            case "launchOverlay:pickMedia":
                return JsonSerializer.SerializeToNode(LaunchOverlay.PickMedia());
            case "config:getOAuth":
            {
                var config = LoadHostConfig();
                return JsonSerializer.SerializeToNode(new
                {
                    clientId = config["oauthClientId"]?.GetValue<string>() ?? "",
                    redirectUri = $"{ApiOrigin}/auth/roblox/callback",
                    configured = !string.IsNullOrWhiteSpace(
                        config["oauthClientId"]?.GetValue<string>())
                });
            }
            case "config:setOAuth":
            {
                var clientId = args[0]?.GetValue<string>()?.Trim() ?? "";
                if (clientId.Length > 100 || clientId.Any(c => !char.IsDigit(c)))
                    throw new ArgumentException("Roblox Client ID must contain digits only.");
                var config = LoadHostConfig();
                config["oauthClientId"] = clientId;
                SaveJsonObject(UserDataPaths.HostConfigPath, config);
                await RestartApiAsync();
                return JsonSerializer.SerializeToNode(new
                {
                    configured = !string.IsNullOrWhiteSpace(clientId)
                });
            }
            case "window:setChrome":
            {
                var background = args[0]?["background"]?.GetValue<string>() ?? "#0B0D14";
                var text = args[0]?["text"]?.GetValue<string>() ?? "#F4F6FB";
                var accent = args[0]?["accent"]?.GetValue<string>() ?? "#7C5CFF";
                var accentSecondary = args[0]?["accentSecondary"]?.GetValue<string>();
                var cornerRadius = args[0]?["cornerRadius"]?.GetValue<double?>() ??
                    args[0]?["cornerRadius"]?.GetValue<int?>();
                ApplyWindowChrome(background, text, accent, accentSecondary, cornerRadius);
                return JsonValue.Create(true);
            }
            case "wallpaper:list":
                return JsonSerializer.SerializeToNode(ListCustomWallpapers());
            case "wallpaper:pick":
                return await Task.Run(() => JsonSerializer.SerializeToNode(PickCustomWallpaper()));
            case "profileAvatar:pick":
                return JsonSerializer.SerializeToNode(PickCustomProfileAvatar());
            case "nickBadge:pick":
                return JsonSerializer.SerializeToNode(PickCustomNickBadge());
            case "robloxAppIcon:pick":
                return await Task.Run(() => JsonSerializer.SerializeToNode(RobloxAppIcon.PickCustomIcon()));
            case "robloxAppIcon:apply":
            {
                var payload = args[0] as JsonObject;
                var mode = payload?["mode"]?.GetValue<string>() ?? "default";
                var customUrl = payload?["customUrl"]?.GetValue<string>();
                return await Task.Run(() =>
                    JsonSerializer.SerializeToNode(RobloxAppIcon.Apply(mode, customUrl)));
            }
            default:
                throw new NotSupportedException($"Unknown native method: {method}");
        }
    }

    private void PostBridgeResponse(string? id, bool ok, JsonNode? result, string? error)
    {
        if (Browser.CoreWebView2 is null || id is null) return;
        var response = new JsonObject
        {
            ["id"] = id,
            ["ok"] = ok,
            ["result"] = result?.DeepClone(),
            ["error"] = error,
        };
        Browser.CoreWebView2.PostWebMessageAsJson(response.ToJsonString());
    }

    private void PushBrowserEvent(JsonObject payload)
    {
        // WebView2 is affinity-bound: never touch Browser from a background thread.
        var json = payload.ToJsonString();
        void post()
        {
            try
            {
                Browser.CoreWebView2?.PostWebMessageAsJson(json);
            }
            catch (Exception ex)
            {
                Log($"PushBrowserEvent failed: {ex.Message}");
            }
        }

        try
        {
            if (Dispatcher.CheckAccess()) post();
            else Dispatcher.Invoke(post);
        }
        catch (Exception ex)
        {
            Log($"PushBrowserEvent dispatch failed: {ex.Message}");
        }
    }

    private async Task RestartApiAsync()
    {
        if (_apiProcess is { HasExited: false })
        {
            _apiProcess.Kill(true);
            await _apiProcess.WaitForExitAsync();
        }
        _apiProcess = null;
        _apiInstanceToken = "";
        for (var i = 0; i < 20 && await IsAnyApiRespondingAsync(); i++)
            await Task.Delay(100);
        await StartApiAsync();
    }

    private JsonObject LoadHostConfig()
    {
        var path = UserDataPaths.HostConfigPath;
        var config = LoadJsonObject(path);
        if (config["sessionSecret"] is null)
            config["sessionSecret"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        if (config["encryptionKey"] is null)
            config["encryptionKey"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        config["oauthClientId"] ??= "";
        if (string.IsNullOrWhiteSpace(config["oauthClientId"]?.GetValue<string>()) &&
            !string.IsNullOrWhiteSpace(DefaultOAuthClientId))
        {
            config["oauthClientId"] = DefaultOAuthClientId;
        }
        SaveJsonObject(path, config);
        return config;
    }

    private static string? ReadBridgeString(JsonObject? payload, string key)
    {
        if (payload is null || !payload.TryGetPropertyValue(key, out var node) || node is null)
            return null;
        if (node is JsonValue value)
        {
            if (value.TryGetValue<string>(out var asString))
                return string.IsNullOrWhiteSpace(asString) ? null : asString.Trim();
            if (value.TryGetValue<long>(out var asLong))
                return asLong.ToString();
            if (value.TryGetValue<double>(out var asDouble) && !double.IsNaN(asDouble) && !double.IsInfinity(asDouble))
                return Convert.ToInt64(asDouble).ToString();
            if (value.TryGetValue<bool>(out var asBool))
                return asBool ? "true" : "false";
        }
        var text = node.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) || text is "null" or "undefined" ? null : text.Trim('"');
    }

    private static JsonObject LoadJsonObject(string path)
    {
        try
        {
            return JsonNode.Parse(File.ReadAllText(path))?.AsObject() ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private static void SaveJsonObject(string path, JsonObject value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, value.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(_dataDirectory);
            File.AppendAllText(
                Path.Combine(_dataDirectory, "native.log"),
                $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Logging must never prevent startup.
        }
    }

    private static object DetectRoblox()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Roblox", "Versions"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Roblox"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Roblox"),
        };
        var found = candidates.FirstOrDefault(Directory.Exists);
        return new { installed = found is not null, path = found };
    }

    private static object ApplyRobloxSettings(JsonObject graphics)
    {
        if (GetRobloxProcesses().Length > 0)
        {
            return new
            {
                ok = false,
                applied = Array.Empty<string>(),
                message = "Close Roblox before applying optimization.",
                backupPath = (string?)null,
            };
        }

        var settingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Roblox",
            "GlobalBasicSettings_13.xml");
        if (!File.Exists(settingsPath))
        {
            return new
            {
                ok = false,
                applied = Array.Empty<string>(),
                message = "Roblox settings were not found. Start Roblox once, close it, then try again.",
                backupPath = (string?)null,
            };
        }

        try
        {
            var document = XDocument.Load(settingsPath, LoadOptions.PreserveWhitespace);
            var applied = new List<string>();

            var fpsValue = graphics["fpsCapHint"]?.GetValue<string>() ?? "60";
            var fps = fpsValue == "unlimited" ? 240 : int.Parse(fpsValue);
            fps = Math.Clamp(fps, 30, 240);
            SetNamedValue(document, "FramerateCap", fps.ToString());
            applied.Add($"FPS cap: {fps}");

            var quality = Math.Clamp(graphics["qualityLevel"]?.GetValue<int>() ?? 5, 1, 10);
            SetNamedValue(document, "SavedQualityLevel", quality.ToString());
            applied.Add($"Quality: {quality}/10");

            var windowMode = graphics["preferredWindowMode"]?.GetValue<string>() ?? "windowed";
            var fullscreen = windowMode is "fullscreen" or "borderless";
            SetNamedValue(document, "Fullscreen", fullscreen ? "true" : "false");
            SetNamedValue(document, "StartMaximized", fullscreen ? "true" : "false");
            applied.Add(fullscreen ? "Fullscreen" : "Windowed");

            var backupPath = settingsPath + ".sblauncher.backup";
            if (!File.Exists(backupPath))
                File.Copy(settingsPath, backupPath);

            var tempPath = settingsPath + ".sblauncher.tmp";
            document.Save(tempPath, SaveOptions.DisableFormatting);
            File.Move(tempPath, settingsPath, true);
            var fastFlagsPath = ApplyAllowlistedFastFlags(graphics, applied);
            RobloxAppearance.ApplyFromGraphics(graphics, applied);

            return new
            {
                ok = true,
                applied = applied.ToArray(),
                message = $"Optimization applied: {string.Join(", ", applied)}.",
                backupPath,
                fastFlagsPath,
            };
        }
        catch (Exception ex)
        {
            return new
            {
                ok = false,
                applied = Array.Empty<string>(),
                message = $"Could not apply Roblox settings: {ex.Message}",
                backupPath = (string?)null,
            };
        }
    }

    private static readonly string[] ManagedAllowlistedFastFlags =
    [
        "FFlagDebugSkyGray",
        "DFFlagTextureQualityOverrideEnabled",
        "DFIntTextureQualityOverride",
        "FIntDebugForceMSAASamples",
        "DFFlagDebugPauseVoxelizer",
        "DFIntDebugFRMQualityLevelOverride",
        "FIntFRMMaxGrassDistance",
        "FIntFRMMinGrassDistance",
        "FFlagDebugGraphicsPreferD3D11",
        "FFlagDebugGraphicsPreferVulkan",
        "FFlagDebugGraphicsPreferOpenGL",
        "FFlagHandleAltEnterFullscreenManually",
        "FFlagDebugDisableOTAMaterialTexture",
    ];

    private static string? ApplyAllowlistedFastFlags(
        JsonObject graphics,
        List<string> applied)
    {
        var playerDirectories = RobloxAppearance.ResolveAllPlayerDirectories().ToList();
        var rootRoblox = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Roblox");
        if (playerDirectories.Count == 0)
            playerDirectories.Add(rootRoblox);
        else if (!playerDirectories.Any(p =>
                     string.Equals(p, rootRoblox, StringComparison.OrdinalIgnoreCase)))
            playerDirectories.Add(rootRoblox);

        string? lastPath = null;
        var enabled = graphics["useAllowlistedFastFlags"]?.GetValue<bool>() ?? true;

        foreach (var playerDirectory in playerDirectories)
        {
            var clientSettingsDirectory = Path.Combine(playerDirectory, "ClientSettings");
            Directory.CreateDirectory(clientSettingsDirectory);
            var path = Path.Combine(clientSettingsDirectory, "ClientAppSettings.json");
            var settings = LoadJsonObject(path);

            foreach (var flag in ManagedAllowlistedFastFlags)
                settings.Remove(flag);

            if (enabled)
            {
                var graySky = graphics["graySky"]?.GetValue<bool>() ?? false;
                var textureQuality =
                    graphics["textureQualityOverride"]?.GetValue<string>() ?? "automatic";
                var antiAliasing =
                    graphics["antiAliasingSamples"]?.GetValue<string>() ?? "2";
                var pauseVoxelizer =
                    graphics["pauseVoxelizer"]?.GetValue<bool>() ?? false;
                var grassDistance =
                    graphics["grassDistance"]?.GetValue<string>() ?? "default";
                var renderingMode =
                    graphics["renderingMode"]?.GetValue<string>() ?? "automatic";
                var quality = Math.Clamp(
                    graphics["qualityLevel"]?.GetValue<int>() ?? 5,
                    1,
                    10);

                settings["FFlagDebugSkyGray"] = graySky ? "True" : "False";
                settings["DFFlagTextureQualityOverrideEnabled"] =
                    textureQuality == "automatic" ? "False" : "True";
                if (textureQuality != "automatic")
                    settings["DFIntTextureQualityOverride"] = textureQuality;
                settings["FIntDebugForceMSAASamples"] = antiAliasing;
                settings["DFFlagDebugPauseVoxelizer"] =
                    pauseVoxelizer ? "True" : "False";
                settings["DFIntDebugFRMQualityLevelOverride"] = quality.ToString();
                settings["FFlagDebugGraphicsPreferD3D11"] =
                    renderingMode == "d3d11" ? "True" : "False";
                settings["FFlagDebugGraphicsPreferVulkan"] =
                    renderingMode == "vulkan" ? "True" : "False";
                settings["FFlagDebugGraphicsPreferOpenGL"] =
                    renderingMode == "opengl" ? "True" : "False";
                settings["FFlagHandleAltEnterFullscreenManually"] = "True";

                if (grassDistance != "default")
                {
                    settings["FIntFRMMinGrassDistance"] =
                        grassDistance == "0" ? "0" : "0";
                    settings["FIntFRMMaxGrassDistance"] = grassDistance;
                }
            }

            if (File.Exists(path) && !File.Exists(path + ".sblauncher.backup"))
                File.Copy(path, path + ".sblauncher.backup");
            SaveJsonObject(path, settings);
            lastPath = path;
        }

        if (enabled)
            applied.Add("Roblox-allowlisted FastFlags");
        else
            applied.Add("Allowlisted FastFlags disabled");

        return lastPath;
    }

    private async Task MonitorRobloxSessionAsync(
        HashSet<int> existingPids,
        bool returnToLauncher,
        CancellationToken cancellationToken)
    {
        FileStream? logStream = null;
        StreamReader? logReader = null;
        try
        {
            Process[] sessionProcesses = [];
            // If Roblox is already open it often reuses the same PID — don't wait a full minute.
            var maxAttempts = existingPids.Count > 0 ? 8 : 120;
            for (var attempt = 0; attempt < maxAttempts && !cancellationToken.IsCancellationRequested; attempt++)
            {
                sessionProcesses = GetRobloxProcesses()
                    .Where(process => !existingPids.Contains(process.Id))
                    .ToArray();
                if (sessionProcesses.Length > 0) break;
                await Task.Delay(500, cancellationToken);
            }

            // Roblox may reuse an already running desktop process.
            if (sessionProcesses.Length == 0)
                sessionProcesses = GetRobloxProcesses();
            if (sessionProcesses.Length == 0)
            {
                // Roblox never started — drop "Playing" Discord activity.
                await Dispatcher.InvokeAsync(() =>
                {
                    _discordPresence?.SetBrowsing();
                    if (returnToLauncher)
                        RestoreLauncherWindow();
                });
                return;
            }

            var trackedPids = sessionProcesses.Select(process => process.Id).ToHashSet();
            var monitorStartedAt = DateTime.Now;
            var shouldCloseRoblox = false;
            var leaveDetected = false;
            var seenInGame = false;
            string? currentLogPath = null;

            Log($"Roblox session monitor started (pids={string.Join(",", trackedPids)}, return={returnToLauncher})");

            while (!cancellationToken.IsCancellationRequested)
            {
                var live = GetRobloxProcesses();
                if (live.Length == 0)
                    break;

                foreach (var process in live)
                    trackedPids.Add(process.Id);

                var newestLog = FindLatestRobloxPlayerLog(monitorStartedAt.AddSeconds(-30));
                if (newestLog is not null &&
                    !string.Equals(newestLog, currentLogPath, StringComparison.OrdinalIgnoreCase))
                {
                    logReader?.Dispose();
                    logStream?.Dispose();
                    logStream = new FileStream(
                        newestLog,
                        FileMode.Open,
                        FileAccess.Read,
                        FileShare.ReadWrite | FileShare.Delete);
                    // Skip pre-launch history on the first attach; rotated logs from start.
                    if (currentLogPath is not null)
                        logStream.Seek(0, SeekOrigin.Begin);
                    else
                        logStream.Seek(0, SeekOrigin.End);
                    logReader = new StreamReader(logStream);
                    currentLogPath = newestLog;
                    Log($"Watching Roblox leave events in {newestLog}");
                }

                if (logReader is not null && logStream is not null)
                {
                    string? line;
                    while ((line = await ReadGrowingLogLineAsync(logReader, logStream, cancellationToken))
                           is not null)
                    {
                        if (IsRobloxJoinedGame(line))
                            seenInGame = true;

                        // leaveUGCGameInternal only fires after an active game — safe even if
                        // we attached mid-session and missed the join line.
                        if (IsRobloxLeaveToDesktopApp(line) &&
                            (seenInGame || line.Contains("leaveUGCGameInternal", StringComparison.Ordinal)))
                        {
                            Log($"Detected Roblox leave-to-app marker — clearing Discord{(returnToLauncher ? " and closing Roblox" : "")}. line={line}");
                            leaveDetected = true;
                            shouldCloseRoblox = returnToLauncher;
                            break;
                        }
                    }
                }
                else if (trackedPids.All(pid =>
                         {
                             try
                             {
                                 using var process = Process.GetProcessById(pid);
                                 return process.HasExited;
                             }
                             catch
                             {
                                 return true;
                             }
                         }))
                {
                    break;
                }

                if (leaveDetected) break;
                await Task.Delay(200, cancellationToken);
            }

            if (shouldCloseRoblox)
                CloseAllRobloxProcesses();

            await Dispatcher.InvokeAsync(() =>
            {
                _discordPresence?.SetBrowsing();
                if (returnToLauncher)
                    RestoreLauncherWindow();
            });
        }
        catch (OperationCanceledException)
        {
            // A newer launch or app shutdown replaced this monitor.
        }
        catch (Exception ex)
        {
            Log($"Roblox session monitor failed: {ex.Message}");
            await Dispatcher.InvokeAsync(() =>
            {
                _discordPresence?.SetBrowsing();
                if (returnToLauncher)
                    RestoreLauncherWindow();
            });
        }
        finally
        {
            logReader?.Dispose();
            logStream?.Dispose();
        }
    }

    /// <summary>
    /// StreamReader can cache EOF on a growing Roblox log; discard the buffer when the file grows.
    /// </summary>
    private static async Task<string?> ReadGrowingLogLineAsync(
        StreamReader reader,
        FileStream stream,
        CancellationToken cancellationToken)
    {
        var line = await reader.ReadLineAsync(cancellationToken);
        if (line is not null) return line;

        if (stream.Length > stream.Position)
        {
            reader.DiscardBufferedData();
            stream.Seek(stream.Position, SeekOrigin.Begin);
            return await reader.ReadLineAsync(cancellationToken);
        }

        return null;
    }

    private static bool IsRobloxJoinedGame(string line) =>
        line.Contains("launchUGCGameInternal", StringComparison.Ordinal) ||
        line.Contains("setStage: (stage:UGCGame)", StringComparison.Ordinal);

    private static bool IsRobloxLeaveToDesktopApp(string line) =>
        line.Contains(RobloxLeaveDesktopAppMarker, StringComparison.Ordinal) ||
        line.Contains("leaveUGCGameInternal", StringComparison.Ordinal) ||
        line.Contains("returnToLuaApp: (stage:UGCGame)", StringComparison.Ordinal);

    private static string? FindLatestRobloxPlayerLog(DateTime notOlderThan)
    {
        var logDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Roblox",
            "logs");
        if (!Directory.Exists(logDirectory)) return null;

        return Directory
            .EnumerateFiles(logDirectory, "*.log")
            .Select(path => new FileInfo(path))
            .Where(info =>
                info.Name.Contains("_Player_", StringComparison.OrdinalIgnoreCase) &&
                !info.Name.Contains("Installer", StringComparison.OrdinalIgnoreCase) &&
                info.LastWriteTime >= notOlderThan)
            .OrderByDescending(info => info.LastWriteTime)
            .Select(info => info.FullName)
            .FirstOrDefault();
    }

    private void CloseAllRobloxProcesses()
    {
        foreach (var process in GetRobloxProcesses())
        {
            try
            {
                if (process.HasExited) continue;
                // CloseMainWindow alone can leave Roblox in the tray/home app.
                try { process.CloseMainWindow(); } catch { }
                if (!process.WaitForExit(1200) && !process.HasExited)
                    process.Kill(true);
            }
            catch (Exception ex)
            {
                Log($"Could not close Roblox pid={process.Id}: {ex.Message}");
                try { process.Kill(true); } catch { }
            }
        }

        // Catch late-spawned helper / restarted home-app processes.
        for (var attempt = 0; attempt < 4; attempt++)
        {
            var leftover = GetRobloxProcesses();
            if (leftover.Length == 0) break;
            foreach (var process in leftover)
            {
                try { if (!process.HasExited) process.Kill(true); }
                catch { }
            }
            Thread.Sleep(300);
        }
    }

    private void RestoreLauncherWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
        Topmost = true;
        Topmost = false;
        Focus();
    }

    private static Process[] GetRobloxProcesses() =>
        RobloxProcessNames
            .SelectMany(Process.GetProcessesByName)
            .GroupBy(process => process.Id)
            .Select(group => group.First())
            .ToArray();

    private static void SetNamedValue(XDocument document, string name, string value)
    {
        var element = document
            .Descendants()
            .FirstOrDefault(node =>
                string.Equals(
                    node.Attribute("name")?.Value,
                    name,
                    StringComparison.OrdinalIgnoreCase));
        if (element is not null)
            element.Value = value;
    }

    private static void SetVector2(XDocument document, string name, int x, int y)
    {
        var element = document
            .Descendants()
            .FirstOrDefault(node =>
                string.Equals(
                    node.Attribute("name")?.Value,
                    name,
                    StringComparison.OrdinalIgnoreCase));
        if (element is null) return;
        var xNode = element.Elements().FirstOrDefault(node => node.Name.LocalName == "X");
        var yNode = element.Elements().FirstOrDefault(node => node.Name.LocalName == "Y");
        if (xNode is not null) xNode.Value = x.ToString();
        if (yNode is not null) yNode.Value = y.ToString();
    }

    private static void OpenExternal(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https" or "roblox"))
            throw new ArgumentException("Unsupported external URL.");
        if (uri.Scheme is "http" or "https")
        {
            var host = uri.Host.ToLowerInvariant();
            var isLoopbackApi =
                (host is "localhost" or "127.0.0.1") && uri.Port == 8787;
            var isLoopbackHost = host is "localhost" or "127.0.0.1" or "[::1]";
            var isPrivate =
                isLoopbackHost ||
                host.EndsWith(".local", StringComparison.Ordinal) ||
                host.StartsWith("10.", StringComparison.Ordinal) ||
                host.StartsWith("192.168.", StringComparison.Ordinal) ||
                System.Text.RegularExpressions.Regex.IsMatch(host, @"^172\.(1[6-9]|2\d|3[0-1])\.");
            if (isPrivate && !isLoopbackApi)
                throw new ArgumentException("Local network URLs are blocked.");
        }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    private void RegisterProtocolHandler()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\sblauncher");
            key.SetValue("", "URL:SB Launcher Protocol");
            key.SetValue("URL Protocol", "");
            using var command = key.CreateSubKey(@"shell\open\command");
            command.SetValue("", $"\"{Environment.ProcessPath}\" \"%1\"");
        }
        catch
        {
            // Protocol registration can still be supplied by the installer.
        }
    }

    private void CaptureProtocolToken(IEnumerable<string> args)
    {
        var deepLink = args.FirstOrDefault(arg =>
            arg.StartsWith("sblauncher://", StringComparison.OrdinalIgnoreCase));
        if (deepLink is null || !Uri.TryCreate(deepLink, UriKind.Absolute, out var uri)) return;
        // Tokens are no longer accepted from the deep link (prevents session injection).
        // OAuth writes pending-auth.txt next to the DB; we only wake the primary window.
        _ = uri;
        WritePendingTokenForPrimary();
    }

    private void WritePendingTokenForPrimary()
    {
        // Signal primary instance to poll pending-auth.txt written by the API.
        try
        {
            var signal = Path.Combine(_dataDirectory, "auth-wake.txt");
            File.WriteAllText(signal, DateTime.UtcNow.ToString("o"));
        }
        catch
        {
            // Non-critical.
        }
    }

    private void CheckPendingAuthFile()
    {
        var path = Path.Combine(_dataDirectory, "pending-auth.txt");
        var wake = Path.Combine(_dataDirectory, "auth-wake.txt");
        if (File.Exists(wake))
        {
            try { File.Delete(wake); } catch { /* retry later */ }
        }
        if (!File.Exists(path)) return;
        try
        {
            _pendingAuthToken = File.ReadAllText(path).Trim();
            File.Delete(path);
            if (string.IsNullOrWhiteSpace(_pendingAuthToken) ||
                _pendingAuthToken.Length < 16 ||
                _pendingAuthToken.Length > 512)
            {
                _pendingAuthToken = null;
                return;
            }
            SendPendingAuthToken();
            Activate();
            WindowState = WindowState.Normal;
        }
        catch
        {
            // Retry on the next timer tick.
        }
    }

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateRoundRectRgn(int nLeftRect, int nTopRect, int nRightRect, int nBottomRect, int nWidthEllipse, int nHeightEllipse);

    [DllImport("user32.dll")]
    private static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MonitorInfo lpmi);

    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaCaptionColor = 35;
    private const int DwmwaTextColor = 36;
    private const uint MonitorDefaultToNearest = 2;
    private const int WmGetMinMaxInfo = 0x0024;
    private bool _minmaxHooked;

    [StructLayout(LayoutKind.Sequential)]
    private struct PointApi
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public PointApi ptReserved;
        public PointApi ptMaxSize;
        public PointApi ptMaxPosition;
        public PointApi ptMinTrackSize;
        public PointApi ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RectApi
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MonitorInfo
    {
        public int cbSize;
        public RectApi rcMonitor;
        public RectApi rcWork;
        public int dwFlags;
    }

    private void EnsureMaximizeFitsWorkArea()
    {
        if (_minmaxHooked) return;
        var helper = new WindowInteropHelper(this);
        if (helper.Handle == IntPtr.Zero)
        {
            helper.EnsureHandle();
        }

        var source = HwndSource.FromHwnd(helper.Handle);
        if (source is null) return;
        source.AddHook(WndProc);
        _minmaxHooked = true;
        Log("Installed WM_GETMINMAXINFO hook for borderless maximize.");
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != WmGetMinMaxInfo)
            return IntPtr.Zero;

        try
        {
            var mmi = Marshal.PtrToStructure<MinMaxInfo>(lParam);
            var monitor = MonitorFromWindow(hwnd, MonitorDefaultToNearest);
            if (monitor == IntPtr.Zero)
                return IntPtr.Zero;

            var info = new MonitorInfo { cbSize = Marshal.SizeOf<MonitorInfo>() };
            if (!GetMonitorInfo(monitor, ref info))
                return IntPtr.Zero;

            // Keep maximized chrome inside the monitor work area so the taskbar
            // does not cover the WebView footer (Sign out, profile chip, etc.).
            mmi.ptMaxPosition.X = Math.Abs(info.rcWork.Left - info.rcMonitor.Left);
            mmi.ptMaxPosition.Y = Math.Abs(info.rcWork.Top - info.rcMonitor.Top);
            mmi.ptMaxSize.X = Math.Abs(info.rcWork.Right - info.rcWork.Left);
            mmi.ptMaxSize.Y = Math.Abs(info.rcWork.Bottom - info.rcWork.Top);
            mmi.ptMaxTrackSize.X = mmi.ptMaxSize.X;
            mmi.ptMaxTrackSize.Y = mmi.ptMaxSize.Y;
            Marshal.StructureToPtr(mmi, lParam, fDeleteOld: true);
            handled = true;
        }
        catch (Exception ex)
        {
            Log($"WM_GETMINMAXINFO failed: {ex.Message}");
        }

        return IntPtr.Zero;
    }

    private void ApplyWindowChromeFromPrefs()
    {
        try
        {
            var prefs = LoadJsonObject(UserDataPaths.LocalPrefsPath);
            var theme = prefs?["theme"]?.AsObject();
            var background = theme?["background"]?.GetValue<string>() ?? "#0B0D14";
            var text = theme?["text"]?.GetValue<string>() ?? "#F4F6FB";
            var accent = theme?["accent"]?.GetValue<string>() ?? "#7C5CFF";
            var accentSecondary = theme?["accentSecondary"]?.GetValue<string>() ?? "#EFB8C8";
            double? corner = null;
            if (theme?["cornerRadius"] is JsonValue cornerNode)
            {
                if (cornerNode.TryGetValue<double>(out var asDouble))
                    corner = asDouble;
                else if (cornerNode.TryGetValue<int>(out var asInt))
                    corner = asInt;
            }

            ApplyWindowChrome(background, text, accent, accentSecondary, corner);
        }
        catch (Exception ex)
        {
            Log($"ApplyWindowChromeFromPrefs failed: {ex.Message}");
            ApplyWindowChrome("#0B0D14", "#F4F6FB", "#7C5CFF", "#EFB8C8", 16);
        }
    }

    private void ApplyWindowChrome(
        string backgroundHex,
        string textHex,
        string accentHex,
        string? accentSecondaryHex = null,
        double? cornerRadius = null)
    {
        try
        {
            var backgroundBrush = (SolidColorBrush)new BrushConverter().ConvertFromString(backgroundHex)!;
            var textBrush = (SolidColorBrush)new BrushConverter().ConvertFromString(textHex)!;
            var accent = (Color)ColorConverter.ConvertFromString(accentHex);
            TitleBar.Background = backgroundBrush;
            TitleBarText.Foreground = textBrush;
            MinimizeButton.Foreground = textBrush;
            MaximizeButton.Foreground = textBrush;
            CloseButton.Foreground = textBrush;
            Resources["TitleButtonHoverBrush"] =
                new SolidColorBrush(Color.FromArgb(52, accent.R, accent.G, accent.B));
            ApplySplashSnakeColor(accentHex);

            if (cornerRadius.HasValue)
                _windowCornerRadius = Math.Clamp(cornerRadius.Value, 0, 48);

            var hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero) return;

            var caption = HexToColorRef(backgroundHex);
            var text = HexToColorRef(textHex);
            var darkMode = IsDarkColor(backgroundHex) ? 1 : 0;

            // Attributes are Windows 11+; failures on older builds are harmless.
            DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref darkMode, sizeof(int));
            DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref caption, sizeof(int));
            DwmSetWindowAttribute(hwnd, DwmwaTextColor, ref text, sizeof(int));
            ApplyWindowCornerClip();
        }
        catch (Exception ex)
        {
            Log($"ApplyWindowChrome failed: {ex.Message}");
        }
    }

    private void ApplyWindowCornerClip()
    {
        try
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero || ActualWidth <= 0 || ActualHeight <= 0)
                return;

            // Maximized windows should fill the work area without rounded clipping.
            if (WindowState == WindowState.Maximized || _windowCornerRadius <= 0.5)
            {
                SetWindowRgn(hwnd, IntPtr.Zero, true);
                if (_windowRegion != IntPtr.Zero)
                {
                    DeleteObject(_windowRegion);
                    _windowRegion = IntPtr.Zero;
                }
                return;
            }

            var dpi = VisualTreeHelper.GetDpi(this);
            var width = Math.Max(1, (int)Math.Ceiling(ActualWidth * dpi.DpiScaleX));
            var height = Math.Max(1, (int)Math.Ceiling(ActualHeight * dpi.DpiScaleY));
            var diameter = Math.Max(2, (int)Math.Round(_windowCornerRadius * dpi.DpiScaleX * 2));
            var region = CreateRoundRectRgn(0, 0, width + 1, height + 1, diameter, diameter);
            SetWindowRgn(hwnd, region, true);
            if (_windowRegion != IntPtr.Zero)
                DeleteObject(_windowRegion);
            _windowRegion = region;
        }
        catch (Exception ex)
        {
            Log($"ApplyWindowCornerClip failed: {ex.Message}");
        }
    }

    private void ApplySplashLogoFromPrefs()
    {
        try
        {
            var prefs = LoadJsonObject(UserDataPaths.LocalPrefsPath);
            var theme = prefs?["theme"]?.AsObject();
            var accent = theme?["accent"]?.GetValue<string>() ?? "#9A82DB";
            ApplySplashSnakeColor(accent);
        }
        catch (Exception ex)
        {
            Log($"ApplySplashLogoFromPrefs failed: {ex.Message}");
        }
    }

    private void ApplySplashSnakeColor(string accentHex)
    {
        try
        {
            if (LogoSnake is null) return;
            LogoSnake.Stroke = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accentHex));
        }
        catch (Exception ex)
        {
            Log($"ApplySplashSnakeColor failed: {ex.Message}");
        }
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left) return;
        if (e.ClickCount == 2)
        {
            ToggleMaximize();
            return;
        }
        try { DragMove(); } catch { }
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState.Minimized;

    private void MaximizeButton_Click(object sender, RoutedEventArgs e) => ToggleMaximize();

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private void ToggleMaximize() =>
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;

    private void Window_StateChanged(object sender, EventArgs e)
    {
        if (MaximizeIcon is null) return;
        MaximizeIcon.Data = Geometry.Parse(
            WindowState == WindowState.Maximized
                ? "M 3.5,1.5 H 12.5 V 10.5 M 1.5,3.5 H 10.5 V 12.5 H 1.5 Z"
                : "M 1.5,1.5 H 12.5 V 12.5 H 1.5 Z");
        MaximizeButton.ToolTip =
            WindowState == WindowState.Maximized ? "Restore" : "Maximize";
        ApplyWindowCornerClip();
    }

    private static int HexToColorRef(string hex)
    {
        var value = hex.TrimStart('#');
        if (value.Length != 6) return 0x00140D0B;
        var r = Convert.ToInt32(value[..2], 16);
        var g = Convert.ToInt32(value.Substring(2, 2), 16);
        var b = Convert.ToInt32(value.Substring(4, 2), 16);
        return (b << 16) | (g << 8) | r;
    }

    private static bool IsDarkColor(string hex)
    {
        var value = hex.TrimStart('#');
        if (value.Length != 6) return true;
        var r = Convert.ToInt32(value[..2], 16);
        var g = Convert.ToInt32(value.Substring(2, 2), 16);
        var b = Convert.ToInt32(value.Substring(4, 2), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
    }

    private void HideSplash()
    {
        StopSplashMarkSnake();
        if (!SystemParameters.ClientAreaAnimation)
        {
            Splash.Visibility = Visibility.Collapsed;
            return;
        }

        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(320))
        {
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut },
        };
        fade.Completed += (_, _) => Splash.Visibility = Visibility.Collapsed;
        Splash.BeginAnimation(OpacityProperty, fade);
    }

    private object? PickCustomWallpaper()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp",
            Title = "Choose a wallpaper",
        };
        if (dialog.ShowDialog() != true) return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp"))
            throw new ArgumentException("Unsupported wallpaper format.");

        var id = $"custom-{Guid.NewGuid():N}";
        var target = Path.Combine(_wallpaperDirectory, $"{id}{extension}");
        File.Copy(dialog.FileName, target, true);
        return new
        {
            id,
            name = Path.GetFileNameWithoutExtension(dialog.FileName),
            url = $"https://wallpapers.sblauncher/{id}{extension}",
        };
    }

    private object? PickCustomNickBadge()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp",
            Title = "Choose a nick badge image",
        };
        if (dialog.ShowDialog() != true) return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp"))
            throw new ArgumentException("Unsupported badge image format.");

        Directory.CreateDirectory(_nickBadgeDirectory);
        var id = $"badge-{Guid.NewGuid():N}";
        var file = $"{id}{extension}";
        File.Copy(dialog.FileName, Path.Combine(_nickBadgeDirectory, file), true);
        return new
        {
            url = $"https://badges.sblauncher/{file}?v={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
        };
    }

    private object? PickCustomProfileAvatar()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp",
            Title = "Choose a profile picture",
        };
        if (dialog.ShowDialog() != true) return null;

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        if (extension is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp"))
            throw new ArgumentException("Unsupported profile picture format.");

        foreach (var existing in Directory.EnumerateFiles(_profileAvatarDirectory))
        {
            try { File.Delete(existing); } catch { }
        }
        var file = $"avatar{extension}";
        File.Copy(dialog.FileName, Path.Combine(_profileAvatarDirectory, file), true);
        return new { url = $"https://profile.sblauncher/{file}?v={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}" };
    }

    private List<object> ListCustomWallpapers()
    {
        if (!Directory.Exists(_wallpaperDirectory)) return [];
        return Directory
            .EnumerateFiles(_wallpaperDirectory)
            .Where(path =>
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                return ext is ".png" or ".jpg" or ".jpeg" or ".webp" or ".bmp";
            })
            .Select(path =>
            {
                var file = Path.GetFileName(path);
                var id = Path.GetFileNameWithoutExtension(file);
                return (object)new
                {
                    id,
                    name = id.StartsWith("custom-") ? "Custom wallpaper" : id,
                    url = $"https://wallpapers.sblauncher/{file}",
                };
            })
            .ToList();
    }

    private void SendPendingAuthToken()
    {
        if (Browser.CoreWebView2 is null || string.IsNullOrWhiteSpace(_pendingAuthToken)) return;
        var message = JsonSerializer.Serialize(new
        {
            type = "auth-token",
            token = _pendingAuthToken,
        });
        Browser.CoreWebView2.PostWebMessageAsJson(message);
    }

    private async void RetryButton_Click(object sender, RoutedEventArgs e)
    {
        await StartApplicationAsync();
    }

    private void StartDiscordPresence()
    {
        try
        {
            _discordPresence?.Dispose();
            _discordPresence = new DiscordPresence(Log);
            var prefs = LoadJsonObject(UserDataPaths.LocalPrefsPath);
            _discordPresence.SyncFromPrefs(prefs);
            if (_discordPresence.IsConfigured)
                _discordPresence.SetBrowsing();
        }
        catch (Exception ex)
        {
            Log($"Discord presence start failed: {ex.Message}");
        }
    }

    private void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _robloxSessionMonitorCts?.Cancel();
        _updater?.Cancel();
        _authTimer.Stop();
        try { _discordPresence?.Dispose(); } catch { /* ignore */ }
        _discordPresence = null;
        if (_apiProcess is { HasExited: false })
        {
            try { _apiProcess.Kill(true); } catch { }
        }
        _singleInstance.Dispose();
    }

    private const string BridgeScript = """
(() => {
  const pending = new Map();
  const authListeners = new Set();
  const updateListeners = new Set();
  let sequence = 0;

  function call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${++sequence}`;
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ id, method, args });
    });
  }

  window.chrome.webview.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'auth-token') {
      authListeners.forEach(listener => listener(message.token));
      return;
    }
    if (message?.type === 'update-progress') {
      updateListeners.forEach(listener => listener(message));
      return;
    }
    const request = pending.get(message?.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(message.error || 'Native operation failed'));
  });

  window.sbDesktop = {
    getPrefs: () => call('prefs:get'),
    setPrefs: patch => call('prefs:set', patch),
    openExternal: url => call('shell:openExternal', url),
    openRoblox: (url, graphics) => call('shell:openRoblox', url, graphics),
    getPendingAuthToken: () => call('auth:getPendingToken'),
    detectRoblox: () => call('roblox:detect'),
    isRobloxRunning: () => call('roblox:isRunning'),
    applyRobloxSettings: graphics => call('roblox:applySettings', graphics),
    pickRobloxFont: () => call('roblox:pickFont'),
    getRobloxFontPreviewDataUrl: (fontId) => call('roblox:fontPreviewDataUrl', fontId),
    sampleMediaLuminance: (url) => call('media:sampleLuminance', url),
    pickLaunchOverlayMedia: () => call('launchOverlay:pickMedia'),
    getOAuthConfig: () => call('config:getOAuth'),
    setOAuthClientId: clientId => call('config:setOAuth', clientId),
    pickWallpaper: () => call('wallpaper:pick'),
    pickProfileAvatar: () => call('profileAvatar:pick'),
    pickNickBadge: () => call('nickBadge:pick'),
    pickRobloxAppIcon: () => call('robloxAppIcon:pick'),
    applyRobloxAppIcon: preference => call('robloxAppIcon:apply', preference),
    listCustomWallpapers: () => call('wallpaper:list'),
    setWindowChrome: chrome => call('window:setChrome', chrome),
    setDiscordActivity: payload => call('discord:setActivity', payload || {}),
    clearDiscordActivity: () => call('discord:clear'),
    startUpdate: payload => call('update:start', payload || {}),
    cancelUpdate: () => call('update:cancel'),
    onUpdateProgress: handler => {
      updateListeners.add(handler);
      return () => updateListeners.delete(handler);
    },
    onAuthToken: handler => {
      authListeners.add(handler);
      return () => authListeners.delete(handler);
    }
  };
})();
""";
}