using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Posts;

/// <summary>A post as a business reads it. Unread: published after the person last opened the page.</summary>
public sealed record PostDto(Guid Uuid, string Title, string Body, bool IsPinned, DateTimeOffset PublishedDate, bool Unread);

public sealed record PostBusinessDto(Guid Uuid, string Name, string Code);

/// <summary>A post as the super admin manages it. Businesses empty with AllBusinesses: everyone.</summary>
public sealed record PlatformPostDto(Guid Uuid, string Title, string Body, PostChannel ShowOn, bool AllBusinesses,
    IReadOnlyList<PostBusinessDto> Businesses, bool AdminsOnly, bool IsPinned, bool IsPublished, DateTimeOffset? PublishedDate,
    DateTimeOffset UpdatedDate, string UpdatedByUserName, Guid Revision);

public sealed record PostRequest(string? Title, string? Body, PostChannel? ShowOn, bool? AllBusinesses, IReadOnlyList<Guid>? BusinessUuids,
    bool? AdminsOnly, bool? IsPinned, bool? IsPublished, Guid? Revision);

public static class PostRules
{
    public const int TitleMax = 150;
    public const int BodyMax = 5000;

    /// <summary>"app" from the Android app, anything else (or nothing) is the website.</summary>
    public static PostChannel ChannelOf(string? channel) =>
        string.Equals(channel?.Trim(), "app", StringComparison.OrdinalIgnoreCase) ? PostChannel.App : PostChannel.Web;
}

/// <summary>
/// Posts from the super admin. Businesses read the published posts meant for them on the screen
/// they use (website or Android app); the super admin writes, publishes, pins and deletes them.
/// Readable even when a subscription has run out (see SubscriptionGateMiddleware).
/// </summary>
public sealed class PostService(IAppDbContext db, ICurrentUser currentUser, TimeProvider clock)
{
    private const int ListLimit = 100;

    // ------------------------------------------------------------------ businesses

    /// <summary>Published posts for the signed-in person on this screen, pinned first, then newest.</summary>
    public async Task<IReadOnlyList<PostDto>> ListAsync(string? channel, CancellationToken ct)
    {
        var seenAt = await SeenAtAsync(ct);
        var posts = await Visible(channel)
            .OrderByDescending(p => p.IsPinned).ThenByDescending(p => p.PublishedDate)
            .Take(ListLimit)
            .ToListAsync(ct);
        return posts.Select(p => new PostDto(p.Uuid, p.Title, p.Body, p.IsPinned, p.PublishedDate!.Value,
            seenAt is null || p.PublishedDate > seenAt)).ToList();
    }

    /// <summary>How many posts arrived since the person last opened the page (for the menu badge).</summary>
    public async Task<int> UnreadCountAsync(string? channel, CancellationToken ct)
    {
        var seenAt = await SeenAtAsync(ct);
        var query = Visible(channel);
        if (seenAt is { } seen) query = query.Where(p => p.PublishedDate > seen);
        return await query.CountAsync(ct);
    }

    /// <summary>
    /// Marks everything published so far as read. Written directly so the person's record keeps its
    /// revision and "last changed" details: reading posts is not an edit of the user.
    /// </summary>
    public async Task MarkSeenAsync(CancellationToken ct)
    {
        currentUser.RequireTenant();
        await db.Database.ExecuteSqlRawAsync("UPDATE app_user SET posts_seen_at = {0} WHERE uuid = {1}",
            [clock.GetUtcNow(), currentUser.UserUuid], ct);
    }

    private IQueryable<SuperAdminPost> Visible(string? channel)
    {
        var tenant = currentUser.RequireTenant();
        var on = PostRules.ChannelOf(channel);
        var isAdmin = currentUser.Role == Role.Admin;
        return db.SuperAdminPosts.AsNoTracking()
            .Where(p => p.IsPublished && p.PublishedDate != null)
            .Where(p => p.ShowOn == PostChannel.All || p.ShowOn == on)
            .Where(p => p.TargetBusinessUuids == null || p.TargetBusinessUuids.Contains(tenant))
            .Where(p => !p.AdminsOnly || isAdmin);
    }

    private Task<DateTimeOffset?> SeenAtAsync(CancellationToken ct)
    {
        var me = currentUser.UserUuid;
        return db.Users.AsNoTracking().Where(u => u.Uuid == me).Select(u => u.PostsSeenAt).FirstOrDefaultAsync(ct);
    }

    // ------------------------------------------------------------------ super admin

    public async Task<IReadOnlyList<PlatformPostDto>> PlatformListAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var posts = await db.SuperAdminPosts.AsNoTracking()
            .OrderByDescending(p => p.IsPinned).ThenByDescending(p => p.PublishedDate ?? p.CreatedDate)
            .ToListAsync(ct);
        var ids = posts.Where(p => p.TargetBusinessUuids != null).SelectMany(p => p.TargetBusinessUuids!).Distinct().ToList();
        var names = ids.Count == 0
            ? []
            : await db.Tenants.AsNoTracking().Where(t => ids.Contains(t.Uuid))
                .Select(t => new PostBusinessDto(t.Uuid, t.TenantName, t.TenantCode)).ToListAsync(ct);
        return posts.Select(p => ToDto(p, names)).ToList();
    }

    /// <summary>Every business, for choosing who sees a post.</summary>
    public async Task<IReadOnlyList<PostBusinessDto>> BusinessesAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        return await db.Tenants.AsNoTracking().OrderBy(t => t.TenantName)
            .Select(t => new PostBusinessDto(t.Uuid, t.TenantName, t.TenantCode)).ToListAsync(ct);
    }

    public async Task<PlatformPostDto> SaveAsync(Guid? id, PostRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var allBusinesses = r.AllBusinesses ?? true;
        var targets = (r.BusinessUuids ?? []).Distinct().ToArray();
        new Validator()
            .Required("title", r.Title, "Title", PostRules.TitleMax)
            .Required("body", r.Body, "Message", PostRules.BodyMax)
            .When(!allBusinesses && targets.Length == 0, "businessUuids", "Choose at least one business.")
            .ThrowIfInvalid();
        if (!allBusinesses && await db.Tenants.CountAsync(t => targets.Contains(t.Uuid), ct) != targets.Length)
            throw DomainException.Validation("businessUuids", "One of the chosen businesses does not exist.");

        SuperAdminPost post;
        if (id is { } existing)
        {
            post = (await db.SuperAdminPosts.FirstOrDefaultAsync(p => p.Uuid == existing, ct)).OrNotFound("Post");
            RevisionGuard.Check(db, post, r.Revision ?? Guid.Empty);
        }
        else
        {
            post = new SuperAdminPost { Uuid = Guid.NewGuid() };
            db.SuperAdminPosts.Add(post);
        }

        post.Title = r.Title!.Trim();
        post.Body = NormalizeBody(r.Body!);
        post.ShowOn = r.ShowOn ?? PostChannel.All;
        post.TargetBusinessUuids = allBusinesses ? null : targets;
        post.AdminsOnly = r.AdminsOnly ?? false;
        post.IsPinned = r.IsPinned ?? false;
        post.IsPublished = r.IsPublished ?? true;
        // The first publication dates the post; later edits do not bring it back as "new".
        if (post.IsPublished && post.PublishedDate is null) post.PublishedDate = clock.GetUtcNow();

        await db.SaveChangesAsync(ct);
        return (await PlatformListAsync(ct)).First(p => p.Uuid == post.Uuid);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var post = (await db.SuperAdminPosts.FirstOrDefaultAsync(p => p.Uuid == id, ct)).OrNotFound("Post");
        db.SuperAdminPosts.Remove(post);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Trims the ends and Windows line breaks; keeps the lines the super admin typed.</summary>
    public static string NormalizeBody(string body) => body.Replace("\r\n", "\n").Replace('\r', '\n').Trim();

    private static PlatformPostDto ToDto(SuperAdminPost p, IReadOnlyList<PostBusinessDto> names) => new(
        p.Uuid, p.Title, p.Body, p.ShowOn, p.TargetBusinessUuids is null,
        (p.TargetBusinessUuids ?? []).Select(id => names.FirstOrDefault(n => n.Uuid == id) ?? new PostBusinessDto(id, "(deleted business)", ""))
            .OrderBy(b => b.Name).ToList(),
        p.AdminsOnly, p.IsPinned, p.IsPublished, p.PublishedDate, p.UpdatedDate, p.UpdatedByUserName, p.Revision);

    private void EnsureSuperAdmin()
    {
        if (!currentUser.IsSuperAdmin()) throw DomainException.Forbidden();
    }
}
