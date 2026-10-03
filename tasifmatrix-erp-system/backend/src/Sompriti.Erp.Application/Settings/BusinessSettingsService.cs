using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Settings;

/// <summary>
/// The business's own settings. SmsSentThisMonth / SmsPartsThisMonth are read-only: what the
/// business sent this month (Bangladesh time), so it can check what it is billed for.
/// </summary>
public sealed record BusinessSettingsDto(bool SmsEnabled, bool SmsOnNewOrders, int SmsSentThisMonth, int SmsPartsThisMonth,
    Guid? Revision, DateTimeOffset? UpdatedDate, string? UpdatedByUserName);

public sealed record BusinessSettingsRequest(bool? SmsEnabled, bool? SmsOnNewOrders, Guid? Revision);

/// <summary>SMS switches of the signed-in business, with the defaults when it never saved any.</summary>
public sealed record SmsSettings(bool SmsEnabled, bool SmsOnNewOrders)
{
    public static readonly SmsSettings Defaults = new(SmsEnabled: true, SmsOnNewOrders: false);
}

public sealed class BusinessSettingsService(IAppDbContext db, TimeProvider clock)
{
    /// <summary>The signed-in business's SMS switches (the business filter picks its row).</summary>
    public static async Task<SmsSettings> SmsAsync(IAppDbContext db, CancellationToken ct)
    {
        var row = await db.BusinessSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        return row is null ? SmsSettings.Defaults : new SmsSettings(row.SmsEnabled, row.SmsOnNewOrders);
    }

    public async Task<BusinessSettingsDto> GetAsync(CancellationToken ct)
    {
        var row = await db.BusinessSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var defaults = SmsSettings.Defaults;

        var today = BusinessClock.Today(clock.GetUtcNow());
        var monthStartUtc = BusinessClock.StartOfDayUtc(new DateOnly(today.Year, today.Month, 1));
        var sent = await db.SmsOutbox.AsNoTracking()
            .Where(x => x.Status == SmsStatus.Sent && x.SentDate >= monthStartUtc)
            .Select(x => (int)x.SmsParts)
            .ToListAsync(ct);

        return new BusinessSettingsDto(row?.SmsEnabled ?? defaults.SmsEnabled, row?.SmsOnNewOrders ?? defaults.SmsOnNewOrders,
            sent.Count, sent.Sum(), row?.Revision, row?.UpdatedDate, row?.UpdatedByUserName);
    }

    public async Task<BusinessSettingsDto> UpdateAsync(BusinessSettingsRequest r, CancellationToken ct)
    {
        new Validator()
            .When(r.SmsEnabled is null, "smsEnabled", "Choose whether the business sends SMS.")
            .When(r.SmsOnNewOrders is null, "smsOnNewOrders", "Choose whether new orders send SMS.")
            .ThrowIfInvalid();

        var row = await db.BusinessSettings.FirstOrDefaultAsync(ct);
        if (row is null)
        {
            row = new BusinessSetting { Uuid = Guid.NewGuid() }; // the business is stamped on save
            db.BusinessSettings.Add(row);
        }
        else
        {
            RevisionGuard.Check(db, row, r.Revision ?? Guid.Empty);
        }
        row.SmsEnabled = r.SmsEnabled!.Value;
        row.SmsOnNewOrders = r.SmsOnNewOrders!.Value;
        await db.SaveChangesAsync(ct);
        return await GetAsync(ct);
    }
}
