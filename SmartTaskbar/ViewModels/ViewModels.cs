using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using SmartTaskbar.Services;

namespace SmartTaskbar.ViewModels;

public abstract class Observable : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }

    protected void Raise(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

/// <summary>Ein Symbol in der Leiste: eine App mit 0..n offenen Fenstern.</summary>
public sealed class TaskGroup : Observable
{
    public TaskGroup(string exePath, bool pinned)
    {
        ExePath = exePath;
        Name = WindowTracker.FriendlyName(exePath);
        _isPinned = pinned;
    }

    public string ExePath { get; }
    public string Name { get; }

    private ImageSource? _icon;
    public ImageSource? Icon { get => _icon; set => Set(ref _icon, value); }

    private bool _isPinned;
    public bool IsPinned { get => _isPinned; set => Set(ref _isPinned, value); }

    private bool _isActive;
    public bool IsActive { get => _isActive; set => Set(ref _isActive, value); }

    private IReadOnlyList<WindowInfo> _windows = Array.Empty<WindowInfo>();
    public IReadOnlyList<WindowInfo> Windows
    {
        get => _windows;
        set
        {
            _windows = value;
            Raise(nameof(Windows));
            Raise(nameof(IsRunning));
            Raise(nameof(HasMany));
            Raise(nameof(ToolTip));
        }
    }

    public bool IsRunning => _windows.Count > 0;
    public bool HasMany => _windows.Count > 1;

    public string ToolTip => _windows.Count switch
    {
        0 => Name,
        1 => _windows[0].Title,
        _ => $"{Name} · {_windows.Count} Fenster",
    };
}

/// <summary>Ein Chip für eine laufende Claude-Code-Sitzung.</summary>
public sealed class ClaudeChip : Observable
{
    public ClaudeChip(ClaudeSession s) => Session = s;

    private ClaudeSession _session = null!;
    public ClaudeSession Session
    {
        get => _session;
        set
        {
            _session = value;
            Raise(nameof(Session));
            Raise(nameof(StateText));
            Raise(nameof(StateColor));
            Raise(nameof(IsWorking));
            Raise(nameof(ToolTip));
            Raise(nameof(Ago));
        }
    }

    private bool _attention;
    /// <summary>Kurz hervorheben, wenn sich der Zustand wichtig geändert hat.</summary>
    public bool Attention { get => _attention; set => Set(ref _attention, value); }

    public bool IsWorking => _session.State == ClaudeState.Working;

    public string StateText => _session.State switch
    {
        ClaudeState.Working => _session.CurrentTool is { } t ? $"arbeitet · {t}" : "arbeitet",
        ClaudeState.NeedsApproval => "Freigabe?",
        _ => "wartet auf dich",
    };

    public Brush StateColor => _session.State switch
    {
        ClaudeState.Working => Palette.Green,
        ClaudeState.NeedsApproval => Palette.Amber,
        _ => Palette.Blue,
    };

    public string Ago
    {
        get
        {
            var d = DateTime.Now - _session.LastActivity;
            return d.TotalSeconds < 60 ? "gerade" : d.TotalMinutes < 60 ? $"{(int)d.TotalMinutes} Min" : $"{(int)d.TotalHours} Std";
        }
    }

    public void Tick() => Raise(nameof(Ago));

    public string ToolTip =>
        $"{_session.Title}\n{_session.Project}{(_session.Branch is { } b ? " · " + b : "")}\n\n{_session.LastText}";
}

public static class Palette
{
    public static readonly Brush Green = Freeze(new SolidColorBrush(Color.FromRgb(0x4A, 0xDE, 0x80)));
    public static readonly Brush Amber = Freeze(new SolidColorBrush(Color.FromRgb(0xFB, 0xBF, 0x24)));
    public static readonly Brush Blue = Freeze(new SolidColorBrush(Color.FromRgb(0x60, 0xA5, 0xFA)));
    public static readonly Brush Red = Freeze(new SolidColorBrush(Color.FromRgb(0xF8, 0x71, 0x71)));
    public static readonly Brush Muted = Freeze(new SolidColorBrush(Color.FromArgb(0x99, 0xFF, 0xFF, 0xFF)));
    public static readonly Brush Text = Freeze(new SolidColorBrush(Colors.White));

    private static Brush Freeze(SolidColorBrush b) { b.Freeze(); return b; }
}
