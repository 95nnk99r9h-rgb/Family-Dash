using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace SmartTaskbar.Services;

public sealed record CalendarEvent(
    string Subject,
    DateTime Start,
    DateTime End,
    string Location,
    bool IsAllDay,
    string? JoinUrl,
    string Organizer)
{
    public bool IsRunning(DateTime now) => Start <= now && now < End;
}

/// <summary>
/// Liest die Termine von heute und morgen aus dem klassischen Outlook für Windows (COM).
/// Läuft auf einem eigenen STA-Thread, damit die Leiste nie hängt.
/// Hinweis: Das „neue Outlook“ hat keine COM-Schnittstelle (siehe README).
/// </summary>
public sealed partial class OutlookCalendarService : IDisposable
{
    private readonly Settings _settings;
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _wake = new(false);
    private volatile bool _stop;

    public event Action<IReadOnlyList<CalendarEvent>, string?>? Updated;

    public OutlookCalendarService(Settings settings)
    {
        _settings = settings;
        _thread = new Thread(Loop) { IsBackground = true, Name = "Outlook" };
        _thread.SetApartmentState(ApartmentState.STA);
    }

    public void Start() => _thread.Start();

    public void RefreshNow() => _wake.Set();

    private void Loop()
    {
        while (!_stop)
        {
            try
            {
                var (events, status) = Fetch();
                Updated?.Invoke(events, status);
            }
            catch (Exception ex)
            {
                Updated?.Invoke(Array.Empty<CalendarEvent>(), "Outlook-Fehler: " + ex.Message);
            }

            _wake.Wait(TimeSpan.FromSeconds(Math.Max(30, _settings.OutlookRefreshSeconds)));
            _wake.Reset();
        }
    }

    private (List<CalendarEvent>, string?) Fetch()
    {
        var list = new List<CalendarEvent>();

        if (_settings.OutlookOnlyWhenRunning && Process.GetProcessesByName("OUTLOOK").Length == 0)
            return (list, "Outlook ist nicht geöffnet");

        Type? type = Type.GetTypeFromProgID("Outlook.Application");
        if (type is null) return (list, "Klassisches Outlook nicht gefunden");

        dynamic? app = null, ns = null, folder = null, items = null, restricted = null;
        try
        {
            app = Activator.CreateInstance(type);
            ns = app!.GetNamespace("MAPI");
            folder = ns.GetDefaultFolder(9); // olFolderCalendar
            items = folder.Items;
            items.IncludeRecurrences = true;
            items.Sort("[Start]");

            DateTime from = DateTime.Today;
            DateTime to = DateTime.Today.AddDays(2);
            // Outlook erwartet Datumswerte im Format der Systemsprache.
            string filter = $"[Start] < '{to:g}' AND [End] > '{from:g}'";
            restricted = items.Restrict(filter);

            // Bei IncludeRecurrences ist Count unzuverlässig → GetFirst/GetNext.
            dynamic item = restricted.GetFirst();
            int guard = 0;
            while (item != null && guard++ < 80)
            {
                try
                {
                    // Nur Termine (olAppointment = 26)
                    if ((int)item.Class == 26)
                    {
                        string subject = (string?)item.Subject ?? "(ohne Titel)";
                        string location = (string?)item.Location ?? "";
                        string body = "";
                        try { body = (string?)item.Body ?? ""; } catch { }
                        string organizer = "";
                        try { organizer = (string?)item.Organizer ?? ""; } catch { }

                        // Abgesagte Termine (olMeetingCanceled = 5 / 7) überspringen
                        int meetingStatus = 0;
                        try { meetingStatus = (int)item.MeetingStatus; } catch { }
                        if (meetingStatus is not (5 or 7))
                        {
                            list.Add(new CalendarEvent(
                                subject,
                                (DateTime)item.Start,
                                (DateTime)item.End,
                                location,
                                (bool)item.AllDayEvent,
                                FindJoinUrl(location + "\n" + body),
                                organizer));
                        }
                    }
                }
                finally { Marshal.ReleaseComObject(item); }

                item = restricted.GetNext();
            }
        }
        finally
        {
            foreach (var o in new object?[] { restricted, items, folder, ns, app })
                if (o != null && Marshal.IsComObject(o)) Marshal.ReleaseComObject(o);
        }

        list.Sort((a, b) => a.Start.CompareTo(b.Start));
        return (list, null);
    }

    [GeneratedRegex(@"https://(teams\.microsoft\.com/l/meetup-join/|teams\.live\.com/meet/|[\w.-]*zoom\.us/j/|meet\.google\.com/|[\w.-]*webex\.com/)[^\s""<>]+",
                    RegexOptions.IgnoreCase)]
    private static partial Regex JoinUrlRegex();

    public static string? FindJoinUrl(string text)
    {
        var m = JoinUrlRegex().Match(text);
        return m.Success ? m.Value.TrimEnd('>', ')', '.', ',') : null;
    }

    public void Dispose()
    {
        _stop = true;
        _wake.Set();
    }
}
