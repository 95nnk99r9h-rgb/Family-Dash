using System.IO;
using System.Text.Json;

namespace SmartTaskbar;

/// <summary>
/// Einstellungen in %APPDATA%\SmartTaskbar\settings.json.
/// Die Datei wird beim ersten Start mit Standardwerten angelegt.
/// </summary>
public sealed class Settings
{
    // Leiste
    public double BarHeight { get; set; } = 52;
    public bool HideWindowsTaskbar { get; set; } = false;
    public List<string> PinnedApps { get; set; } = new()
    {
        @"C:\Windows\explorer.exe",
    };

    // Outlook (klassisches Outlook für Windows, per COM)
    public bool OutlookEnabled { get; set; } = true;
    /// <summary>Nur abfragen, wenn Outlook schon läuft (sonst würde es im Hintergrund gestartet).</summary>
    public bool OutlookOnlyWhenRunning { get; set; } = true;
    public int OutlookRefreshSeconds { get; set; } = 120;
    public int MeetingReminderMinutes { get; set; } = 5;

    // Claude Code
    public bool ClaudeEnabled { get; set; } = true;
    /// <summary>Leer = %USERPROFILE%\.claude\projects</summary>
    public string? ClaudeProjectsPath { get; set; }
    /// <summary>Sitzungen, die länger untätig sind, werden ausgeblendet.</summary>
    public int ClaudeShowIdleMinutes { get; set; } = 90;
    public int ClaudeMaxChips { get; set; } = 4;

    // Wetter (Open-Meteo, ohne API-Schlüssel)
    public bool WeatherEnabled { get; set; } = true;
    public string WeatherPlace { get; set; } = "Berlin";
    public double Latitude { get; set; } = 52.52;
    public double Longitude { get; set; } = 13.41;

    // Fokus-Timer
    public int FocusMinutes { get; set; } = 25;

    // Sounds bei Erinnerungen
    public bool Sounds { get; set; } = true;

    // ---------------------------------------------------------------

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SmartTaskbar", "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath), JsonOptions) ?? new Settings();
        }
        catch
        {
            // Defekte Datei: mit Standardwerten weiter, Datei nicht überschreiben.
            return new Settings();
        }

        var s = new Settings();
        s.Save();
        return s;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, JsonOptions));
        }
        catch { /* nicht kritisch */ }
    }
}
