using System.IO;
using System.Text;
using System.Text.Json;

namespace SmartTaskbar.Services;

public enum ClaudeState
{
    /// <summary>Claude denkt nach oder führt gerade ein Werkzeug aus.</summary>
    Working,
    /// <summary>Ein Werkzeugaufruf hängt seit einer Weile – wahrscheinlich wartet eine Freigabe.</summary>
    NeedsApproval,
    /// <summary>Claude ist fertig und wartet auf deine nächste Nachricht.</summary>
    WaitingForYou,
}

public sealed record ClaudeSession(
    string Id,
    string Project,
    string Cwd,
    string? Branch,
    string Title,
    ClaudeState State,
    DateTime LastActivity,
    string LastText,
    string? CurrentTool);

/// <summary>
/// Liest die lokalen Claude-Code-Protokolle (~/.claude/projects/*/*.jsonl) und
/// leitet daraus den Zustand jeder aktiven Sitzung ab. Nur lesend, nichts wird verändert.
/// </summary>
public sealed class ClaudeSessionService
{
    private readonly Settings _settings;
    private readonly Dictionary<string, (DateTime stamp, string title)> _titleCache = new();

    public ClaudeSessionService(Settings settings) => _settings = settings;

    public string ProjectsRoot => string.IsNullOrWhiteSpace(_settings.ClaudeProjectsPath)
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "projects")
        : Environment.ExpandEnvironmentVariables(_settings.ClaudeProjectsPath!);

    public List<ClaudeSession> Scan()
    {
        var result = new List<ClaudeSession>();
        if (!Directory.Exists(ProjectsRoot)) return result;

        DateTime cutoff = DateTime.Now.AddMinutes(-Math.Max(1, _settings.ClaudeShowIdleMinutes));

        foreach (var dir in SafeDirs(ProjectsRoot))
        foreach (var file in SafeFiles(dir))
        {
            DateTime written;
            try { written = File.GetLastWriteTime(file); } catch { continue; }
            if (written < cutoff) continue;

            try
            {
                var s = Parse(file, written);
                if (s != null) result.Add(s);
            }
            catch { /* Datei wird gerade geschrieben – nächste Runde */ }
        }

        // Wichtigstes zuerst: Freigabe nötig > arbeitet > wartet; dann nach Aktualität.
        return result
            .OrderBy(s => s.State switch { ClaudeState.NeedsApproval => 0, ClaudeState.Working => 1, _ => 2 })
            .ThenByDescending(s => s.LastActivity)
            .ToList();
    }

    private ClaudeSession? Parse(string file, DateTime written)
    {
        string id = Path.GetFileNameWithoutExtension(file);
        var lines = ReadTailLines(file, 256 * 1024);

        string? cwd = null, branch = null, lastText = "", tool = null, summary = null;
        ClaudeState? state = null;

        // Von hinten nach vorne: der letzte relevante Eintrag bestimmt den Zustand.
        for (int i = lines.Count - 1; i >= 0; i--)
        {
            JsonDocument doc;
            try { doc = JsonDocument.Parse(lines[i]); } catch { continue; }
            using (doc)
            {
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) continue;
                string type = Str(root, "type") ?? "";

                if (type == "summary" && summary == null) summary = Str(root, "summary");
                if (type is not ("user" or "assistant")) continue;
                if (root.TryGetProperty("isSidechain", out var sc) && sc.ValueKind == JsonValueKind.True) continue;

                cwd ??= Str(root, "cwd");
                branch ??= Str(root, "gitBranch");
                if (state != null && cwd != null) break;
                if (state != null) continue;

                if (!root.TryGetProperty("message", out var msg)) continue;
                var content = msg.TryGetProperty("content", out var c) ? c : default;

                if (type == "assistant")
                {
                    var (text, toolName) = ReadAssistant(content);
                    if (toolName != null)
                    {
                        tool = toolName;
                        // Läuft ein Werkzeug >25 s ohne neue Zeile, wartet Claude meist auf eine Freigabe.
                        state = (DateTime.Now - written).TotalSeconds > 25 ? ClaudeState.NeedsApproval : ClaudeState.Working;
                        lastText = text ?? $"Werkzeug: {toolName}";
                    }
                    else if (!string.IsNullOrWhiteSpace(text))
                    {
                        state = ClaudeState.WaitingForYou;
                        lastText = text!;
                    }
                }
                else // user
                {
                    if (root.TryGetProperty("isMeta", out var meta) && meta.ValueKind == JsonValueKind.True) continue;
                    // Neue Nachricht oder Werkzeug-Ergebnis → Claude ist am Zug.
                    state = (DateTime.Now - written).TotalMinutes > 10 ? ClaudeState.WaitingForYou : ClaudeState.Working;
                    lastText = content.ValueKind == JsonValueKind.String ? content.GetString() ?? "" : "Verarbeitet Ergebnis …";
                }
            }
        }

        if (state == null) return null;
        cwd ??= "";
        string project = cwd.Length > 0 ? Path.GetFileName(cwd.TrimEnd('\\', '/')) : id[..Math.Min(8, id.Length)];
        string title = summary ?? FirstPrompt(file, written) ?? project;

        return new ClaudeSession(id, project, cwd, branch, Shorten(title, 80), state.Value, written,
                                 Shorten(lastText, 220), tool);
    }

    private static (string? text, string? tool) ReadAssistant(JsonElement content)
    {
        if (content.ValueKind == JsonValueKind.String) return (content.GetString(), null);
        if (content.ValueKind != JsonValueKind.Array) return (null, null);

        string? text = null, tool = null;
        foreach (var part in content.EnumerateArray())
        {
            switch (Str(part, "type"))
            {
                case "text": text = Str(part, "text") ?? text; break;
                case "tool_use": tool = Str(part, "name") ?? "Werkzeug"; break;
            }
        }
        return (text, tool);
    }

    /// <summary>Erste echte Nutzernachricht als Titel (wird pro Datei zwischengespeichert).</summary>
    private string? FirstPrompt(string file, DateTime written)
    {
        if (_titleCache.TryGetValue(file, out var cached)) return cached.title;

        string? found = null;
        try
        {
            using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(fs, Encoding.UTF8);
            for (int n = 0; n < 60 && reader.ReadLine() is string line; n++)
            {
                if (!line.Contains("\"user\"")) continue;
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    if (Str(root, "type") != "user") continue;
                    if (root.TryGetProperty("isMeta", out var meta) && meta.ValueKind == JsonValueKind.True) continue;
                    if (!root.TryGetProperty("message", out var msg) || !msg.TryGetProperty("content", out var c)) continue;

                    string? text = c.ValueKind == JsonValueKind.String ? c.GetString()
                        : c.ValueKind == JsonValueKind.Array
                            ? c.EnumerateArray().Where(p => Str(p, "type") == "text").Select(p => Str(p, "text")).FirstOrDefault()
                            : null;
                    if (string.IsNullOrWhiteSpace(text) || text.TrimStart().StartsWith('<')) continue;
                    found = text.ReplaceLineEndings(" ").Trim();
                    break;
                }
                catch { }
            }
        }
        catch { }

        if (found != null) _titleCache[file] = (written, found);
        return found;
    }

    private static List<string> ReadTailLines(string file, int maxBytes)
    {
        using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        long start = Math.Max(0, fs.Length - maxBytes);
        fs.Seek(start, SeekOrigin.Begin);
        var buffer = new byte[fs.Length - start];
        int read = 0;
        while (read < buffer.Length)
        {
            int n = fs.Read(buffer, read, buffer.Length - read);
            if (n == 0) break;
            read += n;
        }
        var lines = Encoding.UTF8.GetString(buffer, 0, read).Split('\n').ToList();
        if (start > 0 && lines.Count > 0) lines.RemoveAt(0); // erste Zeile ist abgeschnitten
        return lines.Where(l => l.Length > 1).ToList();
    }

    private static string? Str(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static string Shorten(string s, int max)
    {
        s = s.ReplaceLineEndings(" ").Trim();
        return s.Length <= max ? s : s[..(max - 1)] + "…";
    }

    private static IEnumerable<string> SafeDirs(string path)
    {
        try { return Directory.GetDirectories(path); } catch { return Array.Empty<string>(); }
    }

    private static IEnumerable<string> SafeFiles(string dir)
    {
        try { return Directory.GetFiles(dir, "*.jsonl", SearchOption.TopDirectoryOnly); } catch { return Array.Empty<string>(); }
    }
}
