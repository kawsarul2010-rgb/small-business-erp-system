using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.AppReleases;

/// <summary>
/// The answer the Android app gets when it starts. Advice: UP_TO_DATE, OPTIONAL (show "update
/// available"), REQUIRED (block the app until it is updated). Notes: what changed in every newer
/// release, newest first.
/// </summary>
public sealed record AppVersionCheckDto(AppUpdateAdvice Advice, string? LatestVersion, IReadOnlyList<AppReleaseNoteDto> Notes);

public sealed record AppReleaseNoteDto(string Version, AppUpdateType UpdateType, string? ReleaseNotes);

public sealed record AppReleaseDto(Guid Uuid, string VersionName, AppUpdateType UpdateType, string? ReleaseNotes, bool IsPublished,
    DateTimeOffset CreatedDate, DateTimeOffset UpdatedDate, string UpdatedByUserName, Guid Revision);

public sealed record AppReleaseRequest(string? VersionName, AppUpdateType? UpdateType, string? ReleaseNotes, bool? IsPublished, Guid? Revision);

/// <summary>
/// Versions of the Android app. The super admin adds each version once Google Play has published
/// it and says whether it is a minor update (offered) or a major one (required). The app asks on
/// start-up, signed in or not.
/// </summary>
public sealed class AppReleaseService(IAppDbContext db, ICurrentUser currentUser)
{
    public const string Android = "ANDROID";
    public const int NotesMax = 1000;

    /// <summary>For the app: is there a newer version, and must it be installed?</summary>
    public async Task<AppVersionCheckDto> CheckAsync(string? platform, string? installed, CancellationToken ct)
    {
        if (!string.Equals(platform?.Trim(), "android", StringComparison.OrdinalIgnoreCase))
            return new AppVersionCheckDto(AppUpdateAdvice.UpToDate, null, []);
        var releases = await db.AppReleases.AsNoTracking().Where(r => r.Platform == Android && r.IsPublished).ToListAsync(ct);
        var check = AppUpdateRules.Evaluate(installed, releases);
        return new AppVersionCheckDto(check.Advice, check.Latest?.VersionName,
            check.Newer.Select(r => new AppReleaseNoteDto(r.VersionName, r.UpdateType, r.ReleaseNotes)).ToList());
    }

    // ------------------------------------------------------------------ super admin

    public async Task<IReadOnlyList<AppReleaseDto>> ListAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var rows = await db.AppReleases.AsNoTracking().Where(r => r.Platform == Android).ToListAsync(ct);
        return rows
            .OrderByDescending(r => AppVersion.TryParse(r.VersionName, out var v) ? v : default)
            .Select(ToDto).ToList();
    }

    public async Task<AppReleaseDto> SaveAsync(Guid? id, AppReleaseRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var name = r.VersionName?.Trim();
        new Validator()
            .Required("versionName", name, "Version", 20)
            .When(name is not null && !AppVersion.TryParse(name, out _), "versionName", "Write the version as numbers and dots, e.g. 1.0.1.")
            .When(r.UpdateType is null, "updateType", "Choose whether this is a minor or a major update.")
            .MaxLength("releaseNotes", r.ReleaseNotes, "What's new", NotesMax)
            .ThrowIfInvalid();
        AppVersion.TryParse(name, out var version);
        var normalized = version.ToString();

        var others = await db.AppReleases.AsNoTracking().Where(x => x.Platform == Android && x.Uuid != id).Select(x => x.VersionName).ToListAsync(ct);
        if (others.Any(o => AppVersion.TryParse(o, out var v) && v.CompareTo(version) == 0))
            throw DomainException.Validation("versionName", "This version is already in the list.");

        AppRelease release;
        if (id is { } existing)
        {
            release = (await db.AppReleases.FirstOrDefaultAsync(x => x.Uuid == existing, ct)).OrNotFound("Version");
            RevisionGuard.Check(db, release, r.Revision ?? Guid.Empty);
        }
        else
        {
            release = new AppRelease { Uuid = Guid.NewGuid(), Platform = Android };
            db.AppReleases.Add(release);
        }
        release.VersionName = normalized;
        release.UpdateType = r.UpdateType!.Value;
        release.ReleaseNotes = Validator.Clean(r.ReleaseNotes)?.Replace("\r\n", "\n");
        release.IsPublished = r.IsPublished ?? true;
        await db.SaveChangesAsync(ct);
        return ToDto(release);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var release = (await db.AppReleases.FirstOrDefaultAsync(x => x.Uuid == id, ct)).OrNotFound("Version");
        db.AppReleases.Remove(release);
        await db.SaveChangesAsync(ct);
    }

    private static AppReleaseDto ToDto(AppRelease r) => new(r.Uuid, r.VersionName, r.UpdateType, r.ReleaseNotes, r.IsPublished,
        r.CreatedDate, r.UpdatedDate, r.UpdatedByUserName, r.Revision);

    private void EnsureSuperAdmin()
    {
        if (!currentUser.IsSuperAdmin()) throw DomainException.Forbidden();
    }
}
