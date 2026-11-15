using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using static SmartTaskbar.Native.Win32;

namespace SmartTaskbar.Services;

public sealed record WeatherNow(double Temperature, double Max, double Min, int RainChance, string Glyph, string Text);

/// <summary>Aktuelles Wetter über Open-Meteo (kostenlos, kein API-Schlüssel).</summary>
public static class WeatherService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    public static async Task<WeatherNow?> GetAsync(double lat, double lon)
    {
        string url = FormattableString.Invariant(
            $"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}") +
            "&current=temperature_2m,weather_code,is_day" +
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            "&timezone=auto&forecast_days=1";
        try
        {
            using var doc = JsonDocument.Parse(await Http.GetStringAsync(url));
            var cur = doc.RootElement.GetProperty("current");
            var daily = doc.RootElement.GetProperty("daily");
            int code = cur.GetProperty("weather_code").GetInt32();
            bool day = cur.GetProperty("is_day").GetInt32() == 1;
            var (glyph, text) = Describe(code, day);
            int rain = daily.GetProperty("precipitation_probability_max")[0].ValueKind == JsonValueKind.Number
                ? daily.GetProperty("precipitation_probability_max")[0].GetInt32() : 0;
            return new WeatherNow(
                cur.GetProperty("temperature_2m").GetDouble(),
                daily.GetProperty("temperature_2m_max")[0].GetDouble(),
                daily.GetProperty("temperature_2m_min")[0].GetDouble(),
                rain, glyph, text);
        }
        catch { return null; }
    }

    private static (string, string) Describe(int code, bool day) => code switch
    {
        0 => (day ? "☀" : "☾", "Klar"),
        1 or 2 => (day ? "🌤" : "☁", "Leicht bewölkt"),
        3 => ("☁", "Bedeckt"),
        45 or 48 => ("🌫", "Nebel"),
        >= 51 and <= 57 => ("🌦", "Nieselregen"),
        >= 61 and <= 67 => ("🌧", "Regen"),
        >= 71 and <= 77 => ("❄", "Schnee"),
        >= 80 and <= 82 => ("🌦", "Schauer"),
        85 or 86 => ("🌨", "Schneeschauer"),
        >= 95 => ("⛈", "Gewitter"),
        _ => ("☁", "—"),
    };
}

/// <summary>CPU, Arbeitsspeicher und Akku – direkt aus der Windows-API.</summary>
public sealed class SystemStats
{
    private ulong _lastIdle, _lastTotal;

    public double CpuPercent { get; private set; }
    public double RamPercent { get; private set; }
    public double RamUsedGb { get; private set; }
    public double RamTotalGb { get; private set; }
    public int? BatteryPercent { get; private set; }
    public bool Charging { get; private set; }

    public void Update()
    {
        if (GetSystemTimes(out var idle, out var kernel, out var user))
        {
            ulong total = kernel.Value + user.Value; // Kernel-Zeit enthält Leerlauf
            ulong dIdle = idle.Value - _lastIdle, dTotal = total - _lastTotal;
            if (_lastTotal != 0 && dTotal > 0) CpuPercent = Math.Clamp(100.0 * (dTotal - dIdle) / dTotal, 0, 100);
            _lastIdle = idle.Value;
            _lastTotal = total;
        }

        var mem = new MEMORYSTATUSEX { dwLength = (uint)System.Runtime.InteropServices.Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (GlobalMemoryStatusEx(ref mem))
        {
            RamPercent = mem.dwMemoryLoad;
            RamTotalGb = mem.ullTotalPhys / 1073741824.0;
            RamUsedGb = (mem.ullTotalPhys - mem.ullAvailPhys) / 1073741824.0;
        }

        if (GetSystemPowerStatus(out var p) && (p.BatteryFlag & 128) == 0 && p.BatteryLifePercent <= 100)
        {
            BatteryPercent = p.BatteryLifePercent;
            Charging = p.ACLineStatus == 1;
        }
        else BatteryPercent = null;
    }
}
