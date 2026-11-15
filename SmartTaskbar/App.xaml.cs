using System.Windows;
using SmartTaskbar.Native;

namespace SmartTaskbar;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        // Nur eine Instanz zulassen
        _mutex = new Mutex(true, "SmartTaskbar.SingleInstance", out bool first);
        if (!first)
        {
            Shutdown();
            return;
        }

        // Falls etwas schiefgeht: die Windows-Taskleiste immer zurückholen.
        AppDomain.CurrentDomain.UnhandledException += (_, _) => WindowsTaskbar.Restore();
        AppDomain.CurrentDomain.ProcessExit += (_, _) => WindowsTaskbar.Restore();
        DispatcherUnhandledException += (_, args) =>
        {
            args.Handled = true; // Leiste soll bei einzelnen Fehlern weiterlaufen
        };

        base.OnStartup(e);
        new MainWindow(Settings.Load()).Show();
    }

    private Mutex? _mutex;

    protected override void OnExit(ExitEventArgs e)
    {
        WindowsTaskbar.Restore();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
