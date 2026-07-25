using System.IO;
using System.Windows;

namespace SBLauncher.Native;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) =>
        {
            WriteCrash(args.Exception);
            MessageBox.Show(
                args.Exception.Message,
                "SB Launcher startup error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
            Shutdown(1);
        };

        try
        {
            MainWindow = new MainWindow();
            MainWindow.Show();
        }
        catch (Exception ex)
        {
            WriteCrash(ex);
            MessageBox.Show(
                ex.ToString(),
                "SB Launcher startup error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    private static void WriteCrash(Exception exception)
    {
        try
        {
            var directory = UserDataPaths.Root;
            Directory.CreateDirectory(directory);
            File.AppendAllText(
                Path.Combine(directory, "crash.log"),
                $"[{DateTimeOffset.Now:O}] {exception}{Environment.NewLine}");
        }
        catch
        {
        }
    }
}

