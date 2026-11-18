using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Ai;

/// <summary>One searchable piece of the user guide: a part's steps, a section's intro and tips, or one question and answer.</summary>
/// <param name="Device">"mobile" or "desktop" - the guide has its own steps for a computer in some sections - or "any".</param>
public sealed record GuideChunk(string Key, string SectionId, string Lang, string SectionTitle, string? PartTitle, string Text,
    IReadOnlyList<string>? Roles, string Device = "any");

public sealed record GuideHit(GuideChunk Chunk, double Score);

/// <summary>
/// The user guide, searchable - the "librarian" of the help assistant. It finds the few guide
/// pieces that match a question, in English, Bangla or Banglish ("koto baki"), and the model then
/// answers from those pieces only.
/// </summary>
/// <remarks>
/// Search is BM25 keyword ranking (the method behind most search engines) with a small dictionary
/// that links words meaning the same thing across the two languages: "due", "baki" and "বাকি" all
/// match. For a guide of this size (about 70 pieces per language) it is fast, needs no extra
/// service, and runs offline in tests. Vector search (embeddings) can be added beside it later.
/// Both languages are searched together and the hit is returned in the asker's language: the
/// English and Bangla guides have the same sections and parts in the same order.
/// </remarks>
public sealed class GuideIndex
{
    private const double K1 = 1.2, B = 0.75;

    private readonly IReadOnlyList<GuideChunk> _chunks;
    private readonly List<Dictionary<string, int>> _termCounts = [];
    private readonly int[] _lengths;
    private readonly double _avgLength;
    private readonly Dictionary<string, int> _docFrequency = [];
    private readonly Dictionary<(string Lang, string Key), GuideChunk> _byKey = [];
    private readonly Dictionary<(string Lang, string SectionId), string> _sectionTitles = [];

    public static readonly GuideIndex Empty = new([]);

    public GuideIndex(IReadOnlyList<GuideChunk> chunks)
    {
        _chunks = chunks;
        _lengths = new int[chunks.Count];
        for (var i = 0; i < chunks.Count; i++)
        {
            var c = chunks[i];
            // The section and part titles say what the piece is about: they count twice.
            var terms = Terms($"{c.SectionTitle} {c.PartTitle} {c.SectionTitle} {c.PartTitle} {c.Text}");
            var counts = new Dictionary<string, int>();
            foreach (var t in terms) counts[t] = counts.GetValueOrDefault(t) + 1;
            _termCounts.Add(counts);
            _lengths[i] = terms.Count;
            foreach (var t in counts.Keys) _docFrequency[t] = _docFrequency.GetValueOrDefault(t) + 1;
            _byKey[(c.Lang, c.Key)] = c;
            _sectionTitles[(c.Lang, c.SectionId)] = c.SectionTitle;
        }
        _avgLength = chunks.Count == 0 ? 1 : _lengths.Average();
    }

    public int Count => _chunks.Count;

    /// <summary>The section's title in the language, or null for a section that does not exist (or is hidden).</summary>
    public string? SectionTitle(string sectionId, string lang) =>
        _sectionTitles.GetValueOrDefault((lang, sectionId)) ?? _sectionTitles.GetValueOrDefault(("en", sectionId));

    /// <summary>Whether someone in this role is shown the section in the guide.</summary>
    public bool IsVisible(string sectionId, Role role) =>
        _chunks.Any(c => c.SectionId == sectionId && Visible(c, role));

    /// <summary>
    /// The best matching pieces for someone in this role, in their language (when the guide has it)
    /// and for their device: "desktop" gives the computer's steps ("Click ... in the left menu").
    /// </summary>
    public IReadOnlyList<GuideHit> Search(string query, string lang, Role role, int top = 4, string device = "mobile")
    {
        var queryTerms = Terms(query).Distinct().ToList();
        if (queryTerms.Count == 0 || _chunks.Count == 0) return [];

        var best = new Dictionary<string, double>();
        for (var i = 0; i < _chunks.Count; i++)
        {
            var c = _chunks[i];
            if (!Visible(c, role) || (c.Device != "any" && c.Device != device)) continue;
            var score = 0.0;
            foreach (var term in queryTerms)
            {
                if (!_termCounts[i].TryGetValue(term, out var tf)) continue;
                var df = _docFrequency[term];
                var idf = Math.Log(1 + (_chunks.Count - df + 0.5) / (df + 0.5));
                score += idf * tf * (K1 + 1) / (tf + K1 * (1 - B + B * _lengths[i] / _avgLength));
            }
            if (score > 0 && score > best.GetValueOrDefault(c.Key)) best[c.Key] = score;
        }

        return best.OrderByDescending(kv => kv.Value).Take(top)
            .Select(kv =>
            {
                var chunk = _byKey.GetValueOrDefault((lang, kv.Key)) ?? _byKey.GetValueOrDefault(("en", kv.Key))
                            ?? _byKey.First(x => x.Key.Key == kv.Key).Value;
                return new GuideHit(chunk, Math.Round(kv.Value, 3));
            })
            .ToList();
    }

    private static bool Visible(GuideChunk c, Role role) => c.Roles is null || c.Roles.Contains(Roles(role));

    private static string Roles(Role role) => role switch
    {
        Role.Admin => "ADMIN",
        Role.Manager => "MANAGER",
        Role.User => "USER",
        _ => "SUPER_ADMIN",
    };

    // ------------------------------------------------------------------ loading

    /// <summary>Builds the index from guide-index.json (written by the frontend's tools/export-guide.mjs).</summary>
    /// <remarks>
    /// Sections marked web-only (buying SMS, the subscription) are left out: Google Play does not
    /// allow payment instructions in the Android app, and the assistant answers in the app too.
    /// </remarks>
    public static GuideIndex FromJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var chunks = new List<GuideChunk>();
        foreach (var language in doc.RootElement.GetProperty("languages").EnumerateObject())
        {
            var lang = language.Name;
            foreach (var s in language.Value.GetProperty("sections").EnumerateArray())
            {
                if (s.TryGetProperty("webOnly", out var web) && web.GetBoolean()) continue;
                var id = s.GetProperty("id").GetString()!;
                var title = s.GetProperty("title").GetString()!;
                IReadOnlyList<string>? roles = s.TryGetProperty("roles", out var r) && r.ValueKind == JsonValueKind.Array
                    ? r.EnumerateArray().Select(x => x.GetString()!).ToList() : null;

                var intro = Str(s, "intro");
                var tips = Strings(s, "tips");
                var parts = s.GetProperty("parts").EnumerateArray().ToList();
                AddVersion("mobile", intro, tips, parts);

                // The computer's version: its own intro, tips and steps where the guide has them, else the phone's.
                if (s.TryGetProperty("desktop", out var d) && d.ValueKind == JsonValueKind.Object)
                    AddVersion("desktop", Str(d, "intro") ?? intro,
                        d.TryGetProperty("tips", out var dt) && dt.ValueKind == JsonValueKind.Array ? Strings(d, "tips") : tips,
                        d.TryGetProperty("parts", out var dp) && dp.ValueKind == JsonValueKind.Array ? dp.EnumerateArray().ToList() : parts);
                else
                    AddVersion("desktop", intro, tips, parts);

                void AddVersion(string device, string? about, List<string> tipList, List<JsonElement> partList)
                {
                    var prefix = device[0];
                    if (about is not null || tipList.Count > 0)
                    {
                        var text = new StringBuilder();
                        if (about is not null) text.AppendLine(about);
                        foreach (var tip in tipList) text.AppendLine("- " + tip);
                        chunks.Add(new GuideChunk($"{prefix}:{id}#about", id, lang, title, null, text.ToString().Trim(), roles, device));
                    }
                    var p = 0;
                    foreach (var part in partList)
                    {
                        var steps = Strings(part, "steps");
                        var text = string.Join("\n", steps.Select((step, i) => $"{i + 1}. {step}"));
                        chunks.Add(new GuideChunk($"{prefix}:{id}#p{p++}", id, lang, title, Str(part, "title"), text, roles, device));
                    }
                }

                var q = 0;
                if (s.TryGetProperty("faq", out var faq))
                    foreach (var item in faq.EnumerateArray())
                        chunks.Add(new GuideChunk($"{id}#q{q++}", id, lang, title, item.GetProperty("q").GetString(),
                            item.GetProperty("a").GetString()!, roles));
            }
        }
        return new GuideIndex(chunks);
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static List<string> Strings(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x != "").ToList() : [];

    // ------------------------------------------------------------------ words

    private static readonly Regex Word = new(@"[\p{L}\p{M}\p{N}]+", RegexOptions.Compiled);

    private static readonly HashSet<string> StopWords = new string[]
    {
        // English
        "a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "is", "are", "was", "were", "be", "i", "my", "me", "we",
        "our", "you", "your", "it", "this", "that", "how", "do", "does", "can", "what", "where", "which", "when", "why",
        "with", "from", "at", "as", "by", "about", "there", "here", "if", "then", "so", "will", "would", "should", "please",
        // Banglish
        "ami", "amar", "amra", "kivabe", "kibhabe", "kemne", "kemon", "korbo", "kori", "korte", "kore", "ki", "keno",
        "kothay", "hobe", "ache", "nai", "na", "ar", "er", "te", "theke", "jonno", "diye", "kono",
        // Bangla
        "আমি", "আমার", "আমরা", "আমাদের", "কী", "কি", "কীভাবে", "কিভাবে", "কেন", "কোথায়", "করব", "করবো", "করতে", "করি",
        "করে", "করা", "হয়", "হবে", "এবং", "ও", "এই", "সেই", "যে", "না", "থেকে", "জন্য", "দিয়ে", "একটি", "কোন", "কোনো",
        "যায়", "যাবে", "চাই", "আছে", "নেই", "কত", "কতটি", "কোনটি",
    }.Select(Normalize).ToHashSet();

    /// <summary>
    /// Words that mean the same thing in the shop's three ways of writing: English, Bangla and
    /// Banglish. Each group adds one shared term, so a question in one matches the guide in another.
    /// </summary>
    private static readonly string[][] SameMeaning =
    [
        ["due", "dues", "owe", "owes", "owed", "baki", "baaki", "বাকি", "পাওনা", "দেনা", "বকেয়া"],
        ["previous", "opening", "old", "ager", "aager", "আগের", "পুরোনো", "পুরাতন"],
        ["customer", "customers", "buyer", "client", "grahok", "kreta", "গ্রাহক", "ক্রেতা", "কাস্টমার", "খদ্দের"],
        ["supplier", "suppliers", "vendor", "mahajan", "সরবরাহকারী", "সাপ্লায়ার", "মহাজন"],
        ["product", "products", "item", "items", "ponno", "পণ্য", "প্রোডাক্ট", "মাল", "আইটেম"],
        ["stock", "inventory", "mojud", "স্টক", "মজুদ"],
        ["sale", "sales", "sell", "sold", "selling", "bikri", "bikroy", "বিক্রি", "বিক্রয়", "সেল"],
        ["purchase", "purchases", "buy", "bought", "kena", "kroy", "ক্রয়", "কেনা", "কেনাকাটা", "পারচেজ"],
        ["order", "orders", "invoice", "memo", "challan", "অর্ডার", "ইনভয়েস", "মেমো", "চালান"],
        ["payment", "payments", "pay", "paid", "receive", "received", "collect", "collection", "joma", "taka", "dile", "dilo", "পেমেন্ট", "পরিশোধ", "জমা", "টাকা", "কালেকশন", "দিলে", "দিলো", "পেলাম"],
        ["print", "pdf", "share", "download", "প্রিন্ট", "শেয়ার", "পিডিএফ", "ডাউনলোড"],
        ["sms", "message", "messages", "এসএমএস", "মেসেজ", "বার্তা"],
        ["expense", "expenses", "cost", "costs", "khoroch", "khorch", "salary", "rent", "খরচ", "ব্যয়", "বেতন", "ভাড়া"],
        ["profit", "loss", "labh", "lav", "munafa", "লাভ", "ক্ষতি", "মুনাফা"],
        ["password", "passcode", "পাসওয়ার্ড"],
        ["staff", "employee", "employees", "worker", "workers", "user", "users", "manager", "team", "kormi", "কর্মী", "কর্মচারী", "ব্যবহারকারী", "ম্যানেজার", "দল"],
        ["delete", "remove", "erase", "muche", "মুছে", "মুছুন", "সরান"],
        ["void", "cancel", "batil", "বাতিল", "ক্যানসেল"],
        ["add", "create", "new", "jog", "notun", "যোগ", "নতুন", "তৈরি"],
        ["edit", "change", "update", "modify", "correct", "পরিবর্তন", "সম্পাদনা", "বদল", "ঠিক"],
        ["box", "boxes", "carton", "cartons", "বক্স", "কার্টন"],
        ["unit", "units", "uom", "kg", "litre", "pcs", "piece", "pieces", "একক", "কেজি", "লিটার", "পিস"],
        ["report", "reports", "রিপোর্ট"],
        ["company", "কোম্পানি"],
        ["adjustment", "adjustments", "adjust", "damage", "damaged", "lost", "সমন্বয়", "নষ্ট", "হারানো"],
        ["receipt", "pos", "রসিদ", "রশিদ"],
        ["language", "bangla", "english", "ভাষা", "বাংলা", "ইংরেজি"],
        ["finalize", "finalise", "final", "confirm", "চূড়ান্ত"],
        ["draft", "খসড়া"],
        ["dashboard", "home", "হোম", "ড্যাশবোর্ড"],
        ["login", "signin", "লগইন"],
        ["phone", "mobile", "app", "android", "ফোন", "মোবাইল", "অ্যাপ"],
        ["date", "dates", "তারিখ"],
    ];

    private static readonly Dictionary<string, List<string>> Concepts = BuildConcepts();

    private static Dictionary<string, List<string>> BuildConcepts()
    {
        var map = new Dictionary<string, List<string>>();
        for (var g = 0; g < SameMeaning.Length; g++)
            foreach (var w in SameMeaning[g])
            {
                var key = Normalize(w);
                if (!map.TryGetValue(key, out var list)) map[key] = list = [];
                list.Add($"#{g}");
            }
        return map;
    }

    private static readonly string[] BanglaSuffixes =
        ["গুলোকে", "গুলোর", "গুলো", "গুলি", "দেরকে", "দের", "েরা", "ের", "কে", "তে", "টির", "টার", "টি", "টা", "রা", "র", "ে"];

    private static string Normalize(string word) =>
        word.Normalize(NormalizationForm.FormC).Replace("‌", "").Replace("‍", "").ToLowerInvariant();

    /// <summary>The terms of a text: its words, a plain form of each (no plural or case ending), and the shared meaning terms.</summary>
    public static List<string> Terms(string text)
    {
        var terms = new List<string>();
        foreach (Match m in Word.Matches(Normalize(text)))
        {
            var w = m.Value;
            if (StopWords.Contains(w)) continue;
            terms.Add(w);
            var stem = Stem(w);
            if (stem != w) terms.Add(stem);
            if (Concepts.TryGetValue(w, out var c) || Concepts.TryGetValue(stem, out c)) terms.AddRange(c);
        }
        return terms;
    }

    private static string Stem(string w)
    {
        if (w.Length > 0 && w[0] >= 'ঀ' && w[0] <= '৿')
        {
            foreach (var suffix in BanglaSuffixes)
                if (w.Length - suffix.Length >= 2 && w.EndsWith(suffix, StringComparison.Ordinal))
                    return w[..^suffix.Length];
            return w;
        }
        if (w.Length > 5 && w.EndsWith("ing", StringComparison.Ordinal)) return w[..^3];
        if (w.Length > 4 && w.EndsWith("ed", StringComparison.Ordinal)) return w[..^2];
        if (w.Length > 4 && w.EndsWith("es", StringComparison.Ordinal)) return w[..^2];
        if (w.Length > 3 && w.EndsWith('s') && !w.EndsWith("ss", StringComparison.Ordinal)) return w[..^1];
        return w;
    }
}

/// <summary>
/// Loads the guide index once from guide-index.json: wwwroot/guide-index.json on the server (the
/// Angular build puts it there), or frontend/public/guide-index.json when running from source.
/// </summary>
public sealed class GuideIndexProvider(IHostEnvironment env, IConfiguration config, ILogger<GuideIndexProvider> logger)
{
    private readonly Lazy<GuideIndex> _index = new(() => Load(env, config, logger));

    public GuideIndex Index => _index.Value;

    private static GuideIndex Load(IHostEnvironment env, IConfiguration config, ILogger logger)
    {
        var candidates = new List<string>();
        if (config["Ai:GuideIndexPath"] is { Length: > 0 } configured) candidates.Add(configured);
        candidates.Add(Path.Combine(env.ContentRootPath, "wwwroot", "guide-index.json"));
        // Running from source: walk up to the repository and use the frontend's copy.
        for (var dir = new DirectoryInfo(env.ContentRootPath); dir is not null; dir = dir.Parent)
            candidates.Add(Path.Combine(dir.FullName, "frontend", "public", "guide-index.json"));

        foreach (var path in candidates.Where(File.Exists))
        {
            var index = GuideIndex.FromJson(File.ReadAllText(path));
            logger.LogInformation("Help assistant: {Count} guide pieces loaded from {Path}", index.Count, path);
            return index;
        }
        logger.LogWarning("Help assistant: guide-index.json not found; the assistant will have nothing to answer from.");
        return GuideIndex.Empty;
    }
}

internal static class GuideText
{
    /// <summary>A hit as the model reads it: where it is in the guide, then its text.</summary>
    public static string Format(GuideHit h) =>
        $"[section: {h.Chunk.SectionId}] {h.Chunk.SectionTitle}{(h.Chunk.PartTitle is { } p ? " › " + p : "")}\n{h.Chunk.Text}";

    public static string Format(IEnumerable<GuideHit> hits) =>
        string.Join("\n\n", hits.Select(Format));

    public static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
}
