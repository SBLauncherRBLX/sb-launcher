using System.IO;
using System.Windows;

namespace SBLauncher.Native;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        var dataDirectory = UserDataPaths.Root;

        try
        {
            Directory.CreateDirectory(dataDirectory);
            File.AppendAllText(
                Path.Combine(dataDirectory, "bootstrap.log"),
                $"[{DateTimeOffset.Now:O}] Native bootstrap started.{Environment.NewLine}");

            var app = new App();
            app.InitializeComponent();
            app.Run();
        }
        catch (Exception exception)
        {
            Directory.CreateDirectory(dataDirectory);
            File.AppendAllText(
                Path.Combine(dataDirectory, "crash.log"),
                $"[{DateTimeOffset.Now:O}] {exception}{Environment.NewLine}");
            MessageBox.Show(
                exception.ToString(),
                "SB Launcher startup error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }
}
