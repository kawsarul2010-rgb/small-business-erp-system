using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Sompriti.Erp.Application.Common;

/// <summary>The name printed on a business's own reports and emails (see <see cref="BusinessProfile"/>).</summary>
public interface IBusinessProfile
{
    Task<string> NameAsync(CancellationToken ct);
    Task<string> NameOfAsync(Guid? tenantUuid, CancellationToken ct);
    string ProductName { get; }
}

/// <summary>
/// The name printed on a business's own reports and emails. Each business sees its own name;
/// outside a business (the super admin, sign-in emails for a platform account) it falls back
/// to the product name.
/// </summary>
public sealed class BusinessProfile(IAppDbContext db, ICurrentUser currentUser, IOptions<AppOptions> app) : IBusinessProfile
{
    private string? _current;

    /// <summary>The signed-in business's name, looked up once per request.</summary>
    public async Task<string> NameAsync(CancellationToken ct) =>
        _current ??= await NameOfAsync(currentUser.TenantUuid, ct);

    /// <summary>A given business's name - for flows that run before anyone is signed in.</summary>
    public async Task<string> NameOfAsync(Guid? tenantUuid, CancellationToken ct)
    {
        if (tenantUuid is not { } id) return app.Value.ProductName;
        var name = await db.Tenants.AsNoTracking().Where(t => t.Uuid == id).Select(t => t.TenantName).FirstOrDefaultAsync(ct);
        return string.IsNullOrWhiteSpace(name) ? app.Value.ProductName : name;
    }

    public string ProductName => app.Value.ProductName;
}
