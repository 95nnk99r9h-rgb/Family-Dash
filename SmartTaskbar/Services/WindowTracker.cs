using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SmartTaskbar.Native;
using static SmartTaskbar.Native.Win32;

namespace SmartTaskbar.Services;

public sealed record WindowInfo(IntPtr Hwnd, string Title, string ExePath, uint Pid, bool IsMinimized);

/// <summary>Findet alle Fenster, die in eine Taskleiste gehören.</summary>
public static class WindowTracker
{
    private static readonly Dictionary<uint, string> PathCache = new();

    public static List<WindowInfo> GetTaskbarWindows(IntPtr ownWindow)
    {
        var result = new List<WindowInfo>();
        EnumWindows((h, _) =>
        {
            if (h == ownWindow || !IsTaskbarWindow(h)) return true;

            GetWindowThreadProcessId(h, out uint pid);
            string? path = ResolvePath(h, pid, out uint realPid);
            if (path is null) return true;

            result.Add(new WindowInfo(h, GetText(h), path, realPid, IsIconic(h)));
            return true;
        }, IntPtr.Zero);
        return result;
    }

    private static bool IsTaskbarWindow(IntPtr h)
    {
        if (!IsWindowVisible(h) || IsCloaked(h)) return false;
        long ex = GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64();
        bool owned = GetWindow(h, GW_OWNER) != IntPtr.Zero;
        bool appWindow = (ex & WS_EX_APPWINDOW) != 0;
        if (!appWindow && (owned || (ex & WS_EX_TOOLWINDOW) != 0)) return false;
        if ((ex & WS_EX_NOACTIVATE) != 0 && !appWindow) return false;
        if (GetWindowTextLength(h) == 0) return false;

        string cls = GetClass(h);
        return cls is not ("Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd");
    }

    /// <summary>
    /// Store-Apps laufen in ApplicationFrameHost.exe – dann den Prozess des
    /// eigentlichen Inhaltsfensters verwenden (z. B. Rechner, Einstellungen).
    /// </summary>
    private static string? ResolvePath(IntPtr hwnd, uint pid, out uint realPid)
    {
        realPid = pid;
        string? path = CachedPath(pid);
        if (path is null || !path.EndsWith("ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase))
            return path;

        uint child = 0;
        EnumChildWindows(hwnd, (c, _) =>
        {
            GetWindowThreadProcessId(c, out uint cp);
            if (cp != pid) { child = cp; return false; }
            return true;
        }, IntPtr.Zero);

        if (child != 0 && CachedPath(child) is string childPath)
        {
            realPid = child;
            return childPath;
        }
        return path;
    }

    private static string? CachedPath(uint pid)
    {
        if (PathCache.TryGetValue(pid, out var p)) return p;
        p = GetProcessPath(pid);
        if (p != null) PathCache[pid] = p;
        return p;
    }

    // ------------------------------------------------------------ Aktionen

    public static void Activate(WindowInfo w)
    {
        if (IsIconic(w.Hwnd)) ShowWindow(w.Hwnd, SW_RESTORE);
        SetForegroundWindow(w.Hwnd);
    }

    public static void Minimize(WindowInfo w) => ShowWindow(w.Hwnd, SW_MINIMIZE);

    public static void Close(WindowInfo w) => PostMessage(w.Hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);

    public static void Launch(string exePath, string? args = null)
    {
        try
        {
            Process.Start(new ProcessStartInfo(exePath, args ?? string.Empty) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Konnte {Path.GetFileName(exePath)} nicht starten:\n{ex.Message}", "Smart Taskbar");
        }
    }

    public static string FriendlyName(string exePath)
    {
        try
        {
            var info = FileVersionInfo.GetVersionInfo(exePath);
            if (!string.IsNullOrWhiteSpace(info.FileDescription)) return info.FileDescription!;
        }
        catch { }
        return Path.GetFileNameWithoutExtension(exePath);
    }
}

/// <summary>Holt App-Symbole (aus dem Fenster oder aus der .exe) und speichert sie zwischen.</summary>
public static class IconCache
{
    private static readonly Dictionary<string, ImageSource?> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static ImageSource? Get(string exePath, IntPtr hwnd = default)
    {
        if (Cache.TryGetValue(exePath, out var img) && img != null) return img;

        img = hwnd != IntPtr.Zero ? FromWindow(hwnd) : null;
        img ??= FromFile(exePath);
        Cache[exePath] = img;
        return img;
    }

    private static ImageSource? FromWindow(IntPtr hwnd)
    {
        IntPtr icon = IntPtr.Zero;
        foreach (int kind in new[] { ICON_BIG, ICON_SMALL2, ICON_SMALL })
        {
            SendMessageTimeout(hwnd, WM_GETICON, new IntPtr(kind), IntPtr.Zero, SMTO_ABORTIFHUNG, 50, out icon);
            if (icon != IntPtr.Zero) break;
        }
        if (icon == IntPtr.Zero) icon = GetClassLongPtr(hwnd, GCLP_HICON);
        // Fenster-Icons gehören dem Fenster – nicht zerstören.
        return icon == IntPtr.Zero ? null : ToImage(icon, destroy: false);
    }

    private static ImageSource? FromFile(string path)
    {
        var info = new SHFILEINFO();
        IntPtr ok = SHGetFileInfo(path, 0, ref info, (uint)System.Runtime.InteropServices.Marshal.SizeOf<SHFILEINFO>(),
                                  SHGFI_ICON | SHGFI_LARGEICON);
        return ok == IntPtr.Zero || info.hIcon == IntPtr.Zero ? null : ToImage(info.hIcon, destroy: true);
    }

    private static ImageSource? ToImage(IntPtr hIcon, bool destroy)
    {
        try
        {
            var src = Imaging.CreateBitmapSourceFromHIcon(hIcon, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
            src.Freeze();
            return src;
        }
        catch { return null; }
        finally { if (destroy) DestroyIcon(hIcon); }
    }
}
