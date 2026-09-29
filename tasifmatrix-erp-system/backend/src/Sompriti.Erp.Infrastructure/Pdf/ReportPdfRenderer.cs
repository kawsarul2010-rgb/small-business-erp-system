using System.Globalization;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.Reports;
using Sompriti.Erp.Domain.Common;
using static Sompriti.Erp.Infrastructure.Pdf.SimplePdf;

namespace Sompriti.Erp.Infrastructure.Pdf;

/// <summary>
/// Renders any of the reports as an A4 landscape-free table: a heading that records which
/// filters produced it, the rows, and a totals band. The heading matters as much as the
/// numbers - a printed report with no date range on it cannot be checked later.
/// </summary>
public sealed class ReportPdfRenderer(ICurrentUser currentUser, TimeProvider clock) : IReportPdfRenderer
{
    private const float Margin = 36;
    private const float Right = PageWidth - Margin;
    private const float ContentWidth = PageWidth - Margin * 2;
    private const float BottomLimit = PageHeight - 70;
    private const float RowHeight = 17;

    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public byte[] Render(ReportDocument doc)
    {
        var pdf = new SimplePdf();
        var y = Margin;

        // ---------------------------------------------------------------- heading
        pdf.Text(Margin, y, Fit(doc.BusinessName, 340, 16, true), 16, bold: true);
        pdf.Text(Right, y + 3, doc.Title.ToUpperInvariant(), 13, bold: true, align: Align.Right);
        y += 24;

        foreach (var (label, value) in doc.Filters)
        {
            pdf.Text(Margin, y, label, 9, gray: 0.4f);
            pdf.Text(Margin + 80, y, Fit(value, ContentWidth - 80, 9, true), 9, bold: true);
            y += 13;
        }

        y += 4;
        pdf.Line(Margin, y, Right, y, 1, 0.2f);
        y += 10;

        // ---------------------------------------------------------------- table
        var columns = Layout(doc.Columns);

        if (doc.Rows.Count == 0)
        {
            y = TableHeader(pdf, columns, y);
            pdf.Text(Margin + 4, y + 4, "No records match these filters.", 9, gray: 0.4f);
            y += RowHeight;
        }
        else
        {
            y = TableHeader(pdf, columns, y);
            foreach (var row in doc.Rows)
            {
                if (y + RowHeight > BottomLimit)
                {
                    pdf.NewPage();
                    y = TableHeader(pdf, columns, Margin);
                }
                Row(pdf, columns, row.Cells, y, bold: false);
                y += RowHeight;
                pdf.Line(Margin, y, Right, y, 0.3f, 0.85f);
            }
        }

        // ---------------------------------------------------------------- totals
        if (doc.Totals.Count > 0)
        {
            if (y + RowHeight + 6 > BottomLimit) { pdf.NewPage(); y = Margin; }
            y += 2;
            pdf.FillRect(Margin, y, ContentWidth, RowHeight + 1, 0.92f);
            Row(pdf, columns, doc.Totals, y, bold: true);
            y += RowHeight + 1;
            pdf.Line(Margin, y, Right, y, 0.8f, 0.3f);
        }

        // ---------------------------------------------------------------- footer
        var printed = clock.GetUtcNow().ToOffset(BusinessClock.Offset).ToString("dd MMM yyyy hh:mm tt", Inv);
        var by = currentUser.IsAuthenticated ? currentUser.UserName : "system";
        var pages = pdf.PageCount;
        for (var i = 0; i < pages; i++)
        {
            var pageNo = i + 1;
            pdf.DrawOnPage(i, p =>
            {
                p.Line(Margin, PageHeight - 44, Right, PageHeight - 44, 0.5f, 0.7f);
                p.Text(Margin, PageHeight - 38, $"Printed on {printed} by {by}", 8, gray: 0.4f);
                p.Text(Right, PageHeight - 38, $"Page {pageNo} of {pages}", 8, gray: 0.4f, align: Align.Right);
            });
        }

        return pdf.Build();
    }

    /// <summary>Gives every flexible column an equal share of what the fixed ones leave.</summary>
    private static List<ReportColumn> Layout(IReadOnlyList<ReportColumn> columns)
    {
        var fixedWidth = columns.Where(c => c.Width > 0).Sum(c => c.Width);
        var flexible = columns.Count(c => c.Width <= 0);
        var share = flexible > 0 ? (ContentWidth - fixedWidth) / flexible : 0;
        return columns.Select(c => c.Width > 0 ? c : c with { Width = share }).ToList();
    }

    private static float TableHeader(SimplePdf pdf, List<ReportColumn> columns, float y)
    {
        pdf.FillRect(Margin, y, ContentWidth, RowHeight + 1, 0.92f);
        Row(pdf, columns, columns.Select(c => c.Title).ToArray(), y, bold: true);
        return y + RowHeight + 1;
    }

    private static void Row(SimplePdf pdf, List<ReportColumn> columns, IReadOnlyList<string> cells, float y, bool bold)
    {
        var x = Margin;
        for (var i = 0; i < columns.Count; i++)
        {
            var col = columns[i];
            var cell = i < cells.Count ? cells[i] : "";
            var align = col.RightAligned ? Align.Right : Align.Left;
            var tx = col.RightAligned ? x + col.Width - 4 : x + 4;
            pdf.Text(tx, y + 4.5f, Fit(cell, col.Width - 8, 8.5f, bold), 8.5f, bold, align);
            x += col.Width;
        }
    }
}
