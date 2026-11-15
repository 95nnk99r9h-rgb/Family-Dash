using System.Windows;
using System.Windows.Interop;
using static SmartTaskbar.Native.Win32;

namespace SmartTaskbar.Native;

/// <summary>
/// Meldet ein WPF-Fenster als „AppBar“ am unteren Bildschirmrand an.
/// Windows reserviert dann den Platz: maximierte Fenster enden oberhalb der Leiste.
/// </summary>
internal sealed class AppBar : IDisposable
{
    private readonly Window _window;
    private readonly double _heightDip;
    private IntPtr _hwnd;
    private int _callbackMessage;
    private bool _registered;

    /// <summary>true, solange eine Vollbild-App (Spiel, Video, Präsentation) läuft.</summary>
    public event Action<bool>? FullscreenChanged;

    public AppBar(Window window, double heightDip)
    {
        _window = window;
        _heightDip = heightDip;
    }

    public void Register()
    {
        _hwnd = new WindowInteropHelper(_window).Handle;
        _callbackMessage = RegisterWindowMessage("SmartTaskbarAppBarMessage");
        HwndSource.FromHwnd(_hwnd)?.AddHook(WndProc);

        var abd = NewData();
        abd.uCallbackMessage = _callbackMessage;
        SHAppBarMessage(ABM_NEW, ref abd);
        _registered = true;
        UpdatePosition();
    }

    public void UpdatePosition()
    {
        if (!_registered) return;

        var mi = new MONITORINFO { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<MONITORINFO>() };
        IntPtr mon = MonitorFromPoint(new POINT { X = 0, Y = 0 }, MONITOR_DEFAULTTOPRIMARY);
        GetMonitorInfo(mon, ref mi);

        double scale = GetDpiForWindow(_hwnd) / 96.0;
        if (scale <= 0) scale = 1;
        int height = (int)Math.Round(_heightDip * scale);

        var abd = NewData();
        abd.uEdge = ABE_BOTTOM;
        abd.rc = new RECT
        {
            Left = mi.rcMonitor.Left,
            Right = mi.rcMonitor.Right,
            Top = mi.rcMonitor.Bottom - height,
            Bottom = mi.rcMonitor.Bottom,
        };

        SHAppBarMessage(ABM_QUERYPOS, ref abd);
        abd.rc.Top = abd.rc.Bottom - height;
        SHAppBarMessage(ABM_SETPOS, ref abd);

        SetWindowPos(_hwnd, HWND_TOPMOST, abd.rc.Left, abd.rc.Top, abd.rc.Width, abd.rc.Height,
                     SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == _callbackMessage && _registered)
        {
            switch (wParam.ToInt32())
            {
                case ABN_POSCHANGED:
                    UpdatePosition();
                    break;
                case ABN_FULLSCREENAPP:
                    bool fullscreen = lParam != IntPtr.Zero;
                    SetWindowPos(_hwnd, fullscreen ? HWND_BOTTOM : HWND_TOPMOST, 0, 0, 0, 0,
                                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                    FullscreenChanged?.Invoke(fullscreen);
                    break;
            }
        }
        else if (msg == WM_ACTIVATE && _registered)
        {
            var abd = NewData();
            SHAppBarMessage(ABM_ACTIVATE, ref abd);
        }
        else if (msg == WM_WINDOWPOSCHANGED && _registered)
        {
            var abd = NewData();
            SHAppBarMessage(ABM_WINDOWPOSCHANGED, ref abd);
        }
        return IntPtr.Zero;
    }

    private APPBARDATA NewData() => new()
    {
        cbSize = System.Runtime.InteropServices.Marshal.SizeOf<APPBARDATA>(),
        hWnd = _hwnd,
    };

    public void Dispose()
    {
        if (!_registered) return;
        var abd = NewData();
        SHAppBarMessage(ABM_REMOVE, ref abd);
        _registered = false;
    }
}

/// <summary>
/// Blendet die originale Windows-Taskleiste aus (optional) und stellt sie beim Beenden wieder her.
/// </summary>
internal static class WindowsTaskbar
{
    private static int? _originalState;
    private static bool _hidden;

    private static IEnumerable<IntPtr> TrayWindows()
    {
        var primary = FindWindow("Shell_TrayWnd", null);
        if (primary != IntPtr.Zero) yield return primary;

        var secondary = new List<IntPtr>();
        EnumWindows((h, _) =>
        {
            if (GetClass(h) == "Shell_SecondaryTrayWnd") secondary.Add(h);
            return true;
        }, IntPtr.Zero);
        foreach (var h in secondary) yield return h;
    }

    public static void Hide()
    {
        var tray = FindWindow("Shell_TrayWnd", null);
        if (tray == IntPtr.Zero) return;

        var abd = new APPBARDATA { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<APPBARDATA>(), hWnd = tray };
        _originalState ??= (int)SHAppBarMessage(ABM_GETSTATE, ref abd);

        // Auf „automatisch ausblenden“ stellen, damit Windows keinen Platz mehr reserviert.
        abd.lParam = new IntPtr(ABS_AUTOHIDE);
        SHAppBarMessage(ABM_SETSTATE, ref abd);

        foreach (var h in TrayWindows()) ShowWindow(h, SW_HIDE);
        _hidden = true;
    }

    /// <summary>Explorer blendet die Leiste manchmal wieder ein – regelmäßig aufrufen.</summary>
    public static void EnsureHidden()
    {
        if (!_hidden) return;
        foreach (var h in TrayWindows())
            if (IsWindowVisible(h)) ShowWindow(h, SW_HIDE);
    }

    public static void Restore()
    {
        if (!_hidden) return;
        var tray = FindWindow("Shell_TrayWnd", null);
        if (tray != IntPtr.Zero && _originalState is int state)
        {
            var abd = new APPBARDATA
            {
                cbSize = System.Runtime.InteropServices.Marshal.SizeOf<APPBARDATA>(),
                hWnd = tray,
                lParam = new IntPtr(state),
            };
            SHAppBarMessage(ABM_SETSTATE, ref abd);
        }
        foreach (var h in TrayWindows()) ShowWindow(h, SW_SHOW);
        _hidden = false;
    }
}
