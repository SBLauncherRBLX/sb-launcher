using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Text.Json.Nodes;

namespace SBLauncher.Native;

public partial class LaunchOverlayWindow : Window
{
    private Storyboard? _snake;

    public LaunchOverlayWindow(JsonObject graphics)
    {
        InitializeComponent();
        ApplyConfig(graphics);
        Loaded += (_, _) =>
        {
            _snake ??= (Storyboard)FindResource("SnakeStoryboard");
            _snake.Begin(this, true);
        };
        Closed += (_, _) =>
        {
            _snake?.Stop(this);
            try { GifMedia.Stop(); } catch { /* ignore */ }
        };
    }

    private void ApplyConfig(JsonObject graphics)
    {
        var windowColor = ParseBrush(graphics["launchOverlayWindowColor"]?.GetValue<string>(), "#1A1D2B");
        var borderColor = ParseBrush(graphics["launchOverlayBorderColor"]?.GetValue<string>(), "#3A4158");
        var bgColor = ParseBrush(graphics["launchOverlayBgColor"]?.GetValue<string>(), "#12141F");
        var snake = ParseColor(graphics["launchOverlaySnakeColor"]?.GetValue<string>(), "#9A82DB");
        var track = ParseColor(graphics["launchOverlaySnakeTrackColor"]?.GetValue<string>(), "#4A4458");
        var text = ParseBrush(graphics["launchOverlayTextColor"]?.GetValue<string>(), "#E6E1E5");
        var label = graphics["launchOverlayLabel"]?.GetValue<string>()?.Trim();
        if (string.IsNullOrWhiteSpace(label)) label = "Launching Roblox…";

        Chrome.Background = windowColor;
        Chrome.BorderBrush = borderColor;
        ColorLayer.Background = bgColor;
        Snake.Stroke = new SolidColorBrush(snake);
        SnakeTrack.Stroke = new SolidColorBrush(track);
        LabelText.Foreground = text;
        LabelText.Text = label;

        var mode = graphics["launchOverlayBgMode"]?.GetValue<string>() ?? "color";
        var mediaId = graphics["launchOverlayMediaId"]?.GetValue<string>();
        StillImage.Visibility = Visibility.Collapsed;
        GifMedia.Visibility = Visibility.Collapsed;

        if ((mode is "image" or "gif") && !string.IsNullOrWhiteSpace(mediaId))
        {
            var path = LaunchOverlay.FindMediaPath(mediaId);
            if (path is not null && File.Exists(path))
            {
                if (mode == "gif" || Path.GetExtension(path).Equals(".gif", StringComparison.OrdinalIgnoreCase))
                {
                    GifMedia.Visibility = Visibility.Visible;
                    GifMedia.Source = new Uri(path, UriKind.Absolute);
                    GifMedia.Play();
                }
                else
                {
                    StillImage.Visibility = Visibility.Visible;
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.UriSource = new Uri(path, UriKind.Absolute);
                    bitmap.EndInit();
                    bitmap.Freeze();
                    StillImage.Source = bitmap;
                }
            }
        }
    }

    private void GifMedia_MediaEnded(object sender, RoutedEventArgs e)
    {
        try
        {
            GifMedia.Position = TimeSpan.Zero;
            GifMedia.Play();
        }
        catch
        {
            // ignore
        }
    }

    private static SolidColorBrush ParseBrush(string? hex, string fallback) =>
        new(ParseColor(hex, fallback));

    private static Color ParseColor(string? hex, string fallback)
    {
        try
        {
            return (Color)ColorConverter.ConvertFromString(
                string.IsNullOrWhiteSpace(hex) ? fallback : hex)!;
        }
        catch
        {
            return (Color)ColorConverter.ConvertFromString(fallback)!;
        }
    }
}
