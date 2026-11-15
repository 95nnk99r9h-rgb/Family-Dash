using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using SmartTaskbar.Native;
using SmartTaskbar.Services;
using SmartTaskbar.ViewModels;
using static SmartTaskbar.Native.Win32;

namespace SmartTaskbar;

public partial class MainWindow : Window
{
    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-DE");

    private readonly Settings _settings;
    private readonly ObservableCollection<TaskGroup> _tasks = new();
    private readonly ObservableCollection<ClaudeChip> _claudeChips = new();
    private readonly SystemStats _stats = new();
    private readonly ClaudeSessionService _claude;
    private OutlookCalendarService? _outlook;
    private AppBar? _appBar;
    private IntPtr _hwnd;
    private readonly uint _ownPid = (uint)Environment.ProcessId;

    private IntPtr _lastForeground;
    private IReadOnlyList<CalendarEvent> _events = Array.Empty<CalendarEvent>();
    private string? _outlookStatus = "wird geladen …";
    private readonly HashSet<string> _reminded = new();
    private List<ClaudeSession> _sessions = new();
    private readonly Dictionary<string, DateTime> _attentionUntil = new();
    private bool _claudeScanRunning;
    private WeatherNow? _weather;

    private DateTime? _focusStart, _focusEnd;
    private DateTime _focusDoneUntil;

    private readonly DispatcherTimer _windowTimer = new() { Interval = TimeSpan.FromMilliseconds(700) };
    private readonly DispatcherTimer _secondTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _claudeTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer _weatherTimer = new() { Interval = TimeSpan.FromMinutes(15) };

    public MainWindow(Settings settings)
    {
        _settings = settings;
        _claude = new ClaudeSessionService(settings);
        InitializeComponent();

        Height = settings.BarHeight;
        Left = -10000; // bis die AppBar positioniert ist
        TaskItems.ItemsSource = _tasks;
        ClaudeItems.ItemsSource = _claudeChips;

        foreach (var path in settings.PinnedApps.Where(File.Exists))
            _tasks.Add(new TaskGroup(path, pinned: true) { Icon = IconCache.Get(path) });

        _windowTimer.Tick += (_, _) => RefreshWindows();
        _secondTimer.Tick += (_, _) => EverySecond();
        _claudeTimer.Tick += async (_, _) => await RefreshClaudeAsync();
        _weatherTimer.Tick += async (_, _) => await RefreshWeatherAsync();
    }

    // ================================================================ Start & Ende

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        _hwnd = new WindowInteropHelper(this).Handle;

        // Nicht in Alt+Tab auftauchen
        long ex = GetWindowLongPtr(_hwnd, GWL_EXSTYLE).ToInt64();
        SetWindowLongPtr(_hwnd, GWL_EXSTYLE, new IntPtr(ex | WS_EX_TOOLWINDOW));

        ApplyBackdrop();

        if (_settings.HideWindowsTaskbar) WindowsTaskbar.Hide();

        _appBar = new AppBar(this, _settings.BarHeight);
        _appBar.Register();
        HookDisplayChanges();
    }

    /// <summary>Windows 11: Acrylic-Hintergrund. Auf Windows 10 bleibt die dunkle Fläche.</summary>
    private void ApplyBackdrop()
    {
        try
        {
            if (HwndSource.FromHwnd(_hwnd)?.CompositionTarget is { } target)
                target.BackgroundColor = Colors.Transparent;
            int dark = 1;
            DwmSetWindowAttribute(_hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref dark, sizeof(int));
            var margins = new MARGINS { Left = -1, Right = -1, Top = -1, Bottom = -1 };
            DwmExtendFrameIntoClientArea(_hwnd, ref margins);
            int acrylic = 3;
            DwmSetWindowAttribute(_hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ref acrylic, sizeof(int));
        }
        catch { /* rein optisch */ }
    }

    private void HookDisplayChanges()
    {
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += (_, _) => Dispatcher.BeginInvoke(() => _appBar?.UpdatePosition());
    }

    protected override async void OnContentRendered(EventArgs e)
    {
        base.OnContentRendered(e);
        _appBar?.UpdatePosition(); // WPF setzt beim ersten Anzeigen eigene Koordinaten
        RefreshWindows();
        EverySecond();
        _windowTimer.Start();
        _secondTimer.Start();

        if (_settings.OutlookEnabled)
        {
            _outlook = new OutlookCalendarService(_settings);
            _outlook.Updated += (events, status) => Dispatcher.BeginInvoke(() =>
            {
                _events = events;
                _outlookStatus = status;
                UpdateAgenda();
            });
            _outlook.Start();
        }
        else _outlookStatus = "Outlook-Anbindung ist ausgeschaltet";

        if (_settings.ClaudeEnabled)
        {
            _claudeTimer.Start();
            await RefreshClaudeAsync();
        }

        if (_settings.WeatherEnabled)
        {
            _weatherTimer.Start();
            await RefreshWeatherAsync();
        }
        else WeatherButton.Visibility = Visibility.Collapsed;
    }

    protected override void OnClosed(EventArgs e)
    {
        _appBar?.Dispose();
        _outlook?.Dispose();
        WindowsTaskbar.Restore();
        base.OnClosed(e);
    }

    // ================================================================ Fenster & Apps

    private void RefreshWindows()
    {
        var fg = GetForegroundWindow();
        GetWindowThreadProcessId(fg, out uint fgPid);
        if (fg != IntPtr.Zero && fgPid != _ownPid) _lastForeground = fg;

        var windows = WindowTracker.GetTaskbarWindows(_hwnd);
        var byExe = windows.GroupBy(w => w.ExePath, StringComparer.OrdinalIgnoreCase)
                           .ToDictionary(g => g.Key, g => (IReadOnlyList<WindowInfo>)g.ToList(), StringComparer.OrdinalIgnoreCase);

        // Bestehende Gruppen aktualisieren, leere (nicht angeheftete) entfernen
        for (int i = _tasks.Count - 1; i >= 0; i--)
        {
            var group = _tasks[i];
            var list = byExe.TryGetValue(group.ExePath, out var l) ? l : Array.Empty<WindowInfo>();
            byExe.Remove(group.ExePath);

            if (list.Count == 0 && !group.IsPinned) { _tasks.RemoveAt(i); continue; }
            if (!SameWindows(group.Windows, list)) group.Windows = list;
            if (group.Icon == null && list.Count > 0) group.Icon = IconCache.Get(group.ExePath, list[0].Hwnd);
        }

        // Neue Apps hinten anfügen
        foreach (var (exe, list) in byExe.OrderBy(kv => windows.FindIndex(w => w.ExePath.Equals(kv.Key, StringComparison.OrdinalIgnoreCase))))
            _tasks.Add(new TaskGroup(exe, pinned: false) { Windows = list, Icon = IconCache.Get(exe, list[0].Hwnd) });

        foreach (var g in _tasks)
            g.IsActive = g.Windows.Any(w => w.Hwnd == _lastForeground && !IsIconic(w.Hwnd));

        WindowsTaskbar.EnsureHidden();
    }

    private static bool SameWindows(IReadOnlyList<WindowInfo> a, IReadOnlyList<WindowInfo> b)
        => a.Count == b.Count && a.Zip(b).All(p => p.First == p.Second);

    private static TaskGroup? GroupOf(object sender) => (sender as FrameworkElement)?.DataContext as TaskGroup;

    private void Task_Click(object sender, RoutedEventArgs e)
    {
        if (GroupOf(sender) is not { } g) return;

        switch (g.Windows.Count)
        {
            case 0:
                WindowTracker.Launch(g.ExePath);
                break;
            case 1:
                var w = g.Windows[0];
                if (w.Hwnd == _lastForeground && !IsIconic(w.Hwnd)) WindowTracker.Minimize(w);
                else WindowTracker.Activate(w);
                break;
            default:
                var menu = new ContextMenu();
                foreach (var win in g.Windows)
                {
                    var item = new MenuItem { Header = Trim(win.Title, 70), Icon = new Image { Source = g.Icon, Width = 16 } };
                    item.Click += (_, _) => WindowTracker.Activate(win);
                    menu.Items.Add(item);
                }
                menu.Items.Add(new Separator());
                menu.Items.Add(MenuEntry("Neues Fenster", () => WindowTracker.Launch(g.ExePath)));
                Open(menu, (UIElement)sender);
                break;
        }
        RefreshWindows();
    }

    private void Task_MiddleClick(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Middle || GroupOf(sender) is not { } g) return;
        WindowTracker.Launch(g.ExePath);
        e.Handled = true;
    }

    private void Task_RightClick(object sender, MouseButtonEventArgs e)
    {
        if (GroupOf(sender) is not { } g) return;
        e.Handled = true;

        var menu = new ContextMenu();
        menu.Items.Add(new MenuItem { Header = g.Name, IsEnabled = false, FontWeight = FontWeights.SemiBold });
        menu.Items.Add(new Separator());
        menu.Items.Add(MenuEntry("Neues Fenster öffnen", () => WindowTracker.Launch(g.ExePath)));
        menu.Items.Add(MenuEntry(g.IsPinned ? "Von der Leiste lösen" : "An die Leiste anheften", () => TogglePin(g)));
        if (g.Windows.Count > 0)
        {
            menu.Items.Add(new Separator());
            menu.Items.Add(MenuEntry(g.Windows.Count == 1 ? "Fenster schließen" : $"Alle {g.Windows.Count} Fenster schließen",
                () => { foreach (var w in g.Windows) WindowTracker.Close(w); }));
        }
        Open(menu, (UIElement)sender);
    }

    private void TogglePin(TaskGroup g)
    {
        g.IsPinned = !g.IsPinned;
        _settings.PinnedApps.RemoveAll(p => p.Equals(g.ExePath, StringComparison.OrdinalIgnoreCase));
        if (g.IsPinned) _settings.PinnedApps.Add(g.ExePath);
        _settings.Save();
        RefreshWindows();
    }

    private void Start_Click(object sender, RoutedEventArgs e) => PressWinKey();

    private void Start_RightClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        var menu = new ContextMenu();
        menu.Items.Add(MenuEntry("Einstellungen bearbeiten …", () => Shell("notepad.exe", $"\"{Settings.FilePath}\"")));
        menu.Items.Add(MenuEntry(_settings.HideWindowsTaskbar ? "Windows-Taskleiste wieder zeigen" : "Windows-Taskleiste ausblenden", () =>
        {
            _settings.HideWindowsTaskbar = !_settings.HideWindowsTaskbar;
            _settings.Save();
            if (_settings.HideWindowsTaskbar) WindowsTaskbar.Hide(); else WindowsTaskbar.Restore();
            _appBar?.UpdatePosition();
        }));
        menu.Items.Add(MenuEntry("Kalender jetzt aktualisieren", () => _outlook?.RefreshNow()));
        menu.Items.Add(MenuEntry("Task-Manager", () => Shell("taskmgr.exe")));
        menu.Items.Add(new Separator());
        menu.Items.Add(MenuEntry("Smart Taskbar beenden", Close));
        Open(menu, (UIElement)sender);
    }

    // ================================================================ Sekundentakt

    private void EverySecond()
    {
        var now = DateTime.Now;
        ClockTime.Text = now.ToString("HH:mm", De);
        ClockDate.Text = now.ToString("ddd, dd.MM.", De);
        ClockButton.ToolTip = now.ToString("dddd, d. MMMM yyyy", De);

        UpdateAgenda();
        UpdateFocus(now);
        UpdateStats();

        foreach (var chip in _claudeChips)
        {
            chip.Tick();
            if (chip.Attention && _attentionUntil.TryGetValue(chip.Session.Id, out var until) && until < now)
                chip.Attention = false;
        }
    }

    private void UpdateStats()
    {
        _stats.Update();
        CpuBar.Width = 36 * _stats.CpuPercent / 100;
        RamBar.Width = 36 * _stats.RamPercent / 100;
        CpuBar.Background = _stats.CpuPercent > 85 ? Palette.Red : (Brush)FindResource("AccentBrush");
        StatsButton.ToolTip = $"CPU {_stats.CpuPercent:0} %\nRAM {_stats.RamUsedGb:0.0} von {_stats.RamTotalGb:0.0} GB ({_stats.RamPercent:0} %)\n\nKlick: Task-Manager";

        if (_stats.BatteryPercent is int b)
        {
            BatteryText.Visibility = Visibility.Visible;
            BatteryText.Text = (_stats.Charging ? "⚡" : "🔋") + $"{b}%";
            BatteryText.Foreground = b <= 15 && !_stats.Charging ? Palette.Red : (Brush)FindResource("MutedBrush");
        }
    }

    // ================================================================ Termine

    private void UpdateAgenda()
    {
        var now = DateTime.Now;
        var timed = _events.Where(ev => !ev.IsAllDay && ev.End > now).OrderBy(ev => ev.Start).ToList();
        var current = timed.LastOrDefault(ev => ev.IsRunning(now));
        var next = timed.FirstOrDefault(ev => ev.Start > now);
        var allDayToday = _events.Where(ev => ev.IsAllDay && ev.Start.Date <= now.Date && ev.End > now).ToList();

        Brush bar = (Brush)FindResource("AccentBrush");
        CalendarEvent? joinable = null;

        if (_events.Count == 0 && _outlookStatus != null)
        {
            AgendaTitle.Text = "Kalender";
            AgendaSub.Text = _outlookStatus;
            bar = Palette.Muted;
        }
        else if (current != null)
        {
            AgendaTitle.Text = current.Subject;
            string after = next != null && next.Start - now < TimeSpan.FromMinutes(60) ? $" · danach {next.Start:HH:mm}" : "";
            AgendaSub.Text = $"läuft · noch {Fmt(current.End - now)}{after}";
            bar = Palette.Green;
            joinable = current.JoinUrl != null ? current : null;
        }
        else if (next != null && next.Start.Date == now.Date)
        {
            var until = next.Start - now;
            AgendaTitle.Text = next.Subject;
            AgendaSub.Text = $"in {Fmt(until)} · {next.Start:HH:mm}" + (next.Location.Length > 0 ? $" · {next.Location}" : "");
            bool soon = until <= TimeSpan.FromMinutes(_settings.MeetingReminderMinutes);
            if (soon) bar = Palette.Amber;
            if (until <= TimeSpan.FromMinutes(10) && next.JoinUrl != null) joinable = next;
            if (soon) Remind(next);
        }
        else if (next != null)
        {
            AgendaTitle.Text = allDayToday.Count > 0 ? allDayToday[0].Subject : "Heute keine Termine mehr";
            AgendaSub.Text = $"{DayName(next.Start)} {next.Start:HH:mm} · {next.Subject}";
            bar = Palette.Muted;
        }
        else
        {
            AgendaTitle.Text = allDayToday.Count > 0 ? allDayToday[0].Subject : "Keine Termine";
            AgendaSub.Text = "heute & morgen frei";
            bar = Palette.Muted;
        }

        AgendaBar.Background = bar;
        JoinButton.Visibility = joinable != null ? Visibility.Visible : Visibility.Collapsed;
        JoinButton.Tag = joinable?.JoinUrl;
    }

    private void Remind(CalendarEvent ev)
    {
        if (!_reminded.Add(ev.Subject + ev.Start.Ticks)) return;
        Flash(AgendaChip, Color.FromArgb(0x66, 0xFB, 0xBF, 0x24));
        if (_settings.Sounds) SystemSounds.Asterisk.Play();
    }

    private void Agenda_Click(object sender, RoutedEventArgs e)
    {
        var now = DateTime.Now;
        PopupList.Children.Clear();
        PopupHeader.Text = now.ToString("dddd, d. MMMM", De);
        PopupStatus.Text = _outlookStatus ?? $"{_events.Count(ev => ev.Start.Date == now.Date)} Termine heute · aus Outlook";

        foreach (var day in new[] { now.Date, now.Date.AddDays(1) })
        {
            var list = _events.Where(ev => ev.Start.Date <= day && ev.End > day && (ev.Start.Date == day || ev.IsAllDay || ev.Start < day))
                              .OrderBy(ev => !ev.IsAllDay).ThenBy(ev => ev.Start).ToList();
            PopupList.Children.Add(SectionHeader(day == now.Date ? "Heute" : "Morgen"));
            if (list.Count == 0)
            {
                PopupList.Children.Add(new TextBlock { Text = "Keine Termine", Style = (Style)FindResource("Small"), Margin = new Thickness(0, 2, 0, 6) });
                continue;
            }
            foreach (var ev in list) PopupList.Children.Add(EventRow(ev, now));
        }

        ShowPopup((UIElement)sender);
    }

    private UIElement EventRow(CalendarEvent ev, DateTime now)
    {
        bool past = ev.End <= now, running = ev.IsRunning(now) && !ev.IsAllDay;
        var grid = new Grid { Margin = new Thickness(0, 3, 0, 3), Opacity = past ? 0.45 : 1 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(56) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var time = new TextBlock
        {
            Text = ev.IsAllDay ? "ganztags" : $"{ev.Start:HH:mm}\n{ev.End:HH:mm}",
            Style = (Style)FindResource("Small"),
            Foreground = running ? Palette.Green : (Brush)FindResource("MutedBrush"),
        };
        var text = new StackPanel();
        text.Children.Add(new TextBlock { Text = ev.Subject, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
        string meta = string.Join(" · ", new[] { ev.Location, ev.Organizer }.Where(s => !string.IsNullOrWhiteSpace(s)));
        if (meta.Length > 0) text.Children.Add(new TextBlock { Text = meta, Style = (Style)FindResource("Small") });
        Grid.SetColumn(text, 1);

        grid.Children.Add(time);
        grid.Children.Add(text);

        if (ev.JoinUrl != null && !past)
        {
            var join = new Button { Content = "Beitreten", Style = (Style)FindResource("ChipButton"), Height = 28, Tag = ev.JoinUrl };
            join.Click += Join_Click;
            Grid.SetColumn(join, 2);
            grid.Children.Add(join);
        }
        return grid;
    }

    private void Join_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is string url) Shell(url);
        AgendaPopup.IsOpen = false;
    }

    // ================================================================ Claude-Sitzungen

    private async Task RefreshClaudeAsync()
    {
        if (_claudeScanRunning) return;
        _claudeScanRunning = true;
        try
        {
            var sessions = await Task.Run(_claude.Scan);
            ApplySessions(sessions);
        }
        catch { }
        finally { _claudeScanRunning = false; }
    }

    private void ApplySessions(List<ClaudeSession> sessions)
    {
        _sessions = sessions;
        var visible = sessions.Take(Math.Max(1, _settings.ClaudeMaxChips)).ToList();

        for (int i = _claudeChips.Count - 1; i >= 0; i--)
            if (!visible.Any(s => s.Id == _claudeChips[i].Session.Id)) _claudeChips.RemoveAt(i);

        for (int i = 0; i < visible.Count; i++)
        {
            var s = visible[i];
            var chip = _claudeChips.FirstOrDefault(c => c.Session.Id == s.Id);
            if (chip == null)
            {
                _claudeChips.Insert(Math.Min(i, _claudeChips.Count), new ClaudeChip(s));
                continue;
            }

            var before = chip.Session.State;
            if (before == ClaudeState.Working && s.State != ClaudeState.Working)
            {
                // Claude ist fertig oder braucht dich → kurz hervorheben
                chip.Attention = true;
                _attentionUntil[s.Id] = DateTime.Now.AddMinutes(2);
                if (_settings.Sounds)
                    (s.State == ClaudeState.NeedsApproval ? SystemSounds.Exclamation : SystemSounds.Asterisk).Play();
            }
            if (chip.Session != s) chip.Session = s;

            int at = _claudeChips.IndexOf(chip);
            if (at != i) _claudeChips.Move(at, i);
        }

        int more = sessions.Count - visible.Count;
        ClaudeMore.Visibility = more > 0 ? Visibility.Visible : Visibility.Collapsed;
        ClaudeMoreText.Text = $"+{more}";
        ClaudeSeparator.Visibility = sessions.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void Claude_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is not ClaudeChip chip) return;
        chip.Attention = false;
        OpenSessionMenu(chip.Session, (UIElement)sender);
    }

    private void OpenSessionMenu(ClaudeSession s, UIElement target)
    {
        var menu = new ContextMenu { MaxWidth = 460 };
        menu.Items.Add(new MenuItem { Header = Trim(s.Title, 70), IsEnabled = false, FontWeight = FontWeights.SemiBold });
        menu.Items.Add(new MenuItem
        {
            Header = $"{s.Project}{(s.Branch is { } b ? " · " + b : "")} · {new ClaudeChip(s).StateText}",
            IsEnabled = false,
        });
        menu.Items.Add(new Separator());
        menu.Items.Add(MenuEntry("Letzte Nachricht anzeigen", () => ShowSessionDetails(s, target)));
        if (Directory.Exists(s.Cwd))
        {
            menu.Items.Add(MenuEntry("Projektordner öffnen", () => Shell("explorer.exe", $"\"{s.Cwd}\"")));
            menu.Items.Add(MenuEntry("Terminal hier öffnen", () => OpenTerminal(s.Cwd)));
        }
        menu.Items.Add(MenuEntry("Fortsetzen-Befehl kopieren", () => Clipboard.SetText($"claude --resume {s.Id}")));
        Open(menu, target);
    }

    private void ShowSessionDetails(ClaudeSession s, UIElement target)
    {
        PopupList.Children.Clear();
        PopupHeader.Text = s.Project;
        PopupStatus.Text = $"{new ClaudeChip(s).StateText} · zuletzt aktiv {s.LastActivity:HH:mm}";
        PopupList.Children.Add(new TextBlock { Text = s.Title, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) });
        PopupList.Children.Add(new TextBlock { Text = s.LastText, TextWrapping = TextWrapping.Wrap });
        ShowPopup(target);
    }

    private void ClaudeMore_Click(object sender, RoutedEventArgs e)
    {
        PopupList.Children.Clear();
        PopupHeader.Text = "Claude-Sitzungen";
        PopupStatus.Text = $"{_sessions.Count} aktiv in den letzten {_settings.ClaudeShowIdleMinutes} Minuten";
        foreach (var s in _sessions)
        {
            var chip = new ClaudeChip(s);
            var btn = new Button { Style = (Style)FindResource("BarButton"), HorizontalContentAlignment = HorizontalAlignment.Stretch, Margin = new Thickness(0, 1, 0, 1) };
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Children.Add(new System.Windows.Shapes.Ellipse { Width = 9, Height = 9, Fill = chip.StateColor, Margin = new Thickness(0, 0, 10, 0) });
            var txt = new StackPanel { Width = 300 };
            txt.Children.Add(new TextBlock { Text = s.Project, FontWeight = FontWeights.SemiBold });
            txt.Children.Add(new TextBlock { Text = $"{chip.StateText} · {chip.Ago} · {s.Title}", Style = (Style)FindResource("Small") });
            row.Children.Add(txt);
            btn.Content = row;
            btn.Click += (_, _) => { AgendaPopup.IsOpen = false; OpenSessionMenu(s, ClaudeMore); };
            PopupList.Children.Add(btn);
        }
        ShowPopup((UIElement)sender);
    }

    private static void OpenTerminal(string dir)
    {
        try { Process.Start(new ProcessStartInfo("wt.exe", $"-d \"{dir}\"") { UseShellExecute = true }); }
        catch { Shell("cmd.exe", $"/K cd /d \"{dir}\""); }
    }

    // ================================================================ Fokus-Timer

    private void Focus_Click(object sender, RoutedEventArgs e)
    {
        if (_focusEnd == null)
        {
            _focusStart = DateTime.Now;
            _focusEnd = _focusStart.Value.AddMinutes(_settings.FocusMinutes);
        }
        else
        {
            _focusStart = _focusEnd = null;
        }
        UpdateFocus(DateTime.Now);
    }

    private void UpdateFocus(DateTime now)
    {
        if (_focusEnd is DateTime end && _focusStart is DateTime start)
        {
            var left = end - now;
            if (left <= TimeSpan.Zero)
            {
                _focusStart = _focusEnd = null;
                _focusDoneUntil = now.AddMinutes(2);
                Flash(FocusButton, Color.FromArgb(0x66, 0x4A, 0xDE, 0x80));
                if (_settings.Sounds) SystemSounds.Exclamation.Play();
            }
            else
            {
                FocusText.Text = left.ToString(left.TotalHours >= 1 ? @"h\:mm\:ss" : @"mm\:ss");
                FocusArc.Data = Arc(left.TotalSeconds / (end - start).TotalSeconds);
                FocusButton.ToolTip = $"Fokus bis {end:HH:mm} · Klick zum Beenden";
                return;
            }
        }

        FocusArc.Data = null;
        FocusText.Text = now < _focusDoneUntil ? "Pause ☕" : "Fokus";
        FocusButton.ToolTip = $"{_settings.FocusMinutes} Minuten Fokus starten";
    }

    private static Geometry Arc(double fraction)
    {
        fraction = Math.Clamp(fraction, 0, 1);
        const double c = 9, r = 8;
        if (fraction >= 0.999) return new EllipseGeometry(new Point(c, c), r, r);
        double a = fraction * 2 * Math.PI;
        var endPoint = new Point(c + r * Math.Sin(a), c - r * Math.Cos(a));
        var fig = new PathFigure { StartPoint = new Point(c, c - r) };
        fig.Segments.Add(new ArcSegment(endPoint, new Size(r, r), 0, fraction > 0.5, SweepDirection.Clockwise, true));
        return new PathGeometry(new[] { fig });
    }

    // ================================================================ Wetter & System

    private async Task RefreshWeatherAsync()
    {
        _weather = await WeatherService.GetAsync(_settings.Latitude, _settings.Longitude) ?? _weather;
        if (_weather is not { } w) { WeatherSub.Text = "offline"; return; }

        WeatherGlyph.Text = w.Glyph;
        WeatherTemp.Text = $"{w.Temperature:0}°";
        WeatherSub.Text = w.RainChance >= 40 ? $"☂ {w.RainChance}%" : $"{w.Max:0}° / {w.Min:0}°";
        WeatherButton.ToolTip = $"{_settings.WeatherPlace}: {w.Text}, {w.Temperature:0.0} °C\n" +
                                $"Heute {w.Min:0}° bis {w.Max:0}°, Regenrisiko {w.RainChance} %";
    }

    private void Weather_Click(object sender, RoutedEventArgs e)
    {
        try { Process.Start(new ProcessStartInfo("msnweather://forecast") { UseShellExecute = true }); }
        catch { _ = RefreshWeatherAsync(); }
    }

    private void Stats_Click(object sender, RoutedEventArgs e) => Shell("taskmgr.exe");

    // ================================================================ Helfer

    private void ShowPopup(UIElement target)
    {
        AgendaPopup.PlacementTarget = target;
        AgendaPopup.IsOpen = true;
    }

    private static void Open(ContextMenu menu, UIElement target)
    {
        menu.PlacementTarget = target;
        menu.Placement = PlacementMode.Top;
        menu.IsOpen = true;
    }

    private static MenuItem MenuEntry(string header, Action action)
    {
        var item = new MenuItem { Header = header };
        item.Click += (_, _) => action();
        return item;
    }

    private TextBlock SectionHeader(string text) => new()
    {
        Text = text.ToUpper(De),
        FontSize = 11,
        FontWeight = FontWeights.SemiBold,
        Foreground = (Brush)FindResource("AccentBrush"),
        Margin = new Thickness(0, 8, 0, 4),
    };

    private static void Flash(Button button, Color color)
    {
        var original = button.Background;
        var brush = new SolidColorBrush(color);
        button.Background = brush;
        var anim = new ColorAnimation(color, Color.FromArgb(0x10, color.R, color.G, color.B), TimeSpan.FromMilliseconds(600))
        {
            AutoReverse = true,
            RepeatBehavior = new RepeatBehavior(4),
        };
        anim.Completed += (_, _) => button.Background = original;
        brush.BeginAnimation(SolidColorBrush.ColorProperty, anim);
    }

    private static void Shell(string file, string? args = null)
    {
        try { Process.Start(new ProcessStartInfo(file, args ?? "") { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Smart Taskbar"); }
    }

    private static string Fmt(TimeSpan t)
    {
        if (t.TotalMinutes < 1) return "unter 1 Min";
        if (t.TotalMinutes < 60) return $"{(int)Math.Ceiling(t.TotalMinutes)} Min";
        int h = (int)t.TotalHours, m = t.Minutes;
        return m == 0 ? $"{h} Std" : $"{h} Std {m} Min";
    }

    private static string DayName(DateTime d)
        => d.Date == DateTime.Today.AddDays(1) ? "Morgen" : d.ToString("ddd dd.MM.", De);

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";
}
