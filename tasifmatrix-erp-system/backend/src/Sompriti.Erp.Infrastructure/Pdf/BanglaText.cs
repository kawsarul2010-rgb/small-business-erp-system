using System.Collections.Concurrent;
using System.IO.Compression;
using System.Runtime.InteropServices;
using HarfBuzzSharp;
using HbBuffer = HarfBuzzSharp.Buffer;
using HbFace = HarfBuzzSharp.Face;
using HbFont = HarfBuzzSharp.Font;

namespace Sompriti.Erp.Infrastructure.Pdf;

/// <summary>
/// Bangla in the PDFs. The standard PDF fonts (Helvetica) have no Bangla letters, so Bangla parts of
/// a text are drawn with Noto Sans Bengali (embedded in this assembly, SIL Open Font License). Bangla
/// needs shaping - joined letters (conjuncts), vowel signs placed before or above a letter - which
/// HarfBuzz does: it turns the text into the font's glyphs and their positions, and SimplePdf draws
/// each glyph where HarfBuzz puts it. If the fonts or HarfBuzz cannot be loaded, Bangla falls back to
/// "?" as before rather than breaking the PDF.
/// </summary>
internal static class BanglaText
{
    internal readonly record struct Glyph(ushort Id, int Advance, int OffsetX, int OffsetY);

    /// <summary>One embedded font (regular or bold) and its HarfBuzz objects (kept alive with it).</summary>
    internal sealed class FontFile
    {
        public required string Name { get; init; }
        public required byte[] Data { get; init; }
        public required HbFont Font { get; init; }
        public required HbFace Face { get; init; }
        public required Blob Blob { get; init; }
        public required int UnitsPerEm { get; init; }
        public required string BBox { get; init; }

        private byte[]? _compressed;

        /// <summary>The font file, zlib-compressed for the PDF (FlateDecode). Worked out once.</summary>
        public byte[] Compressed
        {
            get
            {
                if (_compressed is { } done) return done;
                using var ms = new MemoryStream();
                using (var z = new ZLibStream(ms, CompressionLevel.Optimal, leaveOpen: true)) z.Write(Data, 0, Data.Length);
                return _compressed = ms.ToArray();
            }
        }

        /// <summary>The glyph's advance width in PDF text units (1/1000 em).</summary>
        public int Width(ushort glyph) => (int)Math.Round(Font.GetHorizontalGlyphAdvance(glyph) * 1000.0 / UnitsPerEm);
    }

    private static readonly Lazy<FontFile[]?> Fonts = new(Load, LazyThreadSafetyMode.ExecutionAndPublication);
    private static readonly ConcurrentDictionary<(string Text, bool Bold), Glyph[]> ShapeCache = new();

    /// <summary>Regular (bold = false) or bold font, or null when Bangla cannot be drawn.</summary>
    public static FontFile? Font(bool bold) => Fonts.Value?[bold ? 1 : 0];

    public static bool IsBangla(char c) => c is >= 'ঀ' and <= '৿' or '‌' or '‍' or '।' or '॥';

    public static bool HasBangla(string text)
    {
        foreach (var c in text) if (IsBangla(c)) return true;
        return false;
    }

    /// <summary>
    /// Splits text into Bangla and other parts. Letters decide: a Bangla letter starts a Bangla part,
    /// any other letter a Helvetica part. Spaces, digits and punctuation stay with the part they are
    /// in (in a Bangla part only when the Bangla font has them), so "লাক্স সাবান ১০০ গ্রাম (Lux)" is one
    /// Bangla part and one other part.
    /// </summary>
    public static List<(string Text, bool Bangla)> Split(string text)
    {
        var parts = new List<(string Text, bool Bangla)>();
        var font = Font(false);
        if (font is null || !HasBangla(text)) { parts.Add((text, false)); return parts; }

        var current = new System.Text.StringBuilder();
        var currentBangla = false;
        foreach (var c in text)
        {
            bool bangla;
            if (IsBangla(c)) bangla = true;
            else if (char.IsLetter(c)) bangla = false;
            else if (current.Length == 0) bangla = false;
            else bangla = currentBangla && font.Font.TryGetGlyph((int)c, out _);

            if (current.Length > 0 && bangla != currentBangla)
            {
                parts.Add((current.ToString(), currentBangla));
                current.Clear();
            }
            currentBangla = bangla;
            current.Append(c);
        }
        if (current.Length > 0) parts.Add((current.ToString(), currentBangla));
        return parts;
    }

    /// <summary>The glyphs of a Bangla part and where they go, in font units.</summary>
    public static Glyph[] Shape(string text, bool bold)
    {
        var font = Font(bold);
        if (font is null || text.Length == 0) return [];
        if (ShapeCache.TryGetValue((text, bold), out var cached)) return cached;

        using var buffer = new HbBuffer();
        buffer.AddUtf16(text);
        buffer.GuessSegmentProperties();
        font.Font.Shape(buffer);
        var infos = buffer.GlyphInfos;
        var positions = buffer.GlyphPositions;
        var glyphs = new Glyph[infos.Length];
        for (var i = 0; i < infos.Length; i++)
            glyphs[i] = new Glyph((ushort)infos[i].Codepoint, positions[i].XAdvance, positions[i].XOffset, positions[i].YOffset);

        if (ShapeCache.Count > 5000) ShapeCache.Clear();
        ShapeCache[(text, bold)] = glyphs;
        return glyphs;
    }

    /// <summary>Width of a Bangla part in points.</summary>
    public static float Width(string text, float size, bool bold)
    {
        var font = Font(bold);
        if (font is null) return 0;
        long units = 0;
        foreach (var g in Shape(text, bold)) units += g.Advance;
        return units * size / font.UnitsPerEm;
    }

    private static FontFile[]? Load()
    {
        try
        {
            return
            [
                LoadOne("NotoSansBengali-Regular.ttf", "NotoSansBengali-Regular", "-596 -408 1244 995"),
                LoadOne("NotoSansBengali-Bold.ttf", "NotoSansBengali-Bold", "-644 -408 1275 1007"),
            ];
        }
        catch (Exception)
        {
            // HarfBuzz's native library or the fonts are missing: PDFs still work, without Bangla.
            return null;
        }
    }

    private static FontFile LoadOne(string file, string name, string bbox)
    {
        var assembly = typeof(BanglaText).Assembly;
        var resource = assembly.GetManifestResourceNames().First(n => n.EndsWith("." + file, StringComparison.Ordinal));
        byte[] data;
        using (var stream = assembly.GetManifestResourceStream(resource)!)
        using (var ms = new MemoryStream())
        {
            stream.CopyTo(ms);
            data = ms.ToArray();
        }

        Blob blob;
        var pin = GCHandle.Alloc(data, GCHandleType.Pinned);
        try { blob = new Blob(pin.AddrOfPinnedObject(), data.Length, MemoryMode.Duplicate); }
        finally { pin.Free(); }

        var face = new HbFace(blob, 0);
        var font = new HbFont(face);
        font.SetScale(face.UnitsPerEm, face.UnitsPerEm);
        return new FontFile { Name = name, Data = data, Font = font, Face = face, Blob = blob, UnitsPerEm = face.UnitsPerEm, BBox = bbox };
    }
}
