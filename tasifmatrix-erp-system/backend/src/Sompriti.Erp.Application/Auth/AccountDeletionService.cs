using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Auth;

/// <summary>
/// What deleting the signed-in account involves. MustCloseBusiness: the person is the business's
/// only admin, so deleting their account closes the business and deletes all of its records.
/// </summary>
public sealed record AccountDeletionInfoDto(bool MustCloseBusiness, string? BusinessName, string? BusinessCode, int OtherUsers);

/// <summary>
/// Password: the person's current password. CloseBusiness and BusinessCode (typed again) are
/// required from the only admin, who closes the whole business.
/// </summary>
public sealed record DeleteAccountRequest(string? Password, bool? CloseBusiness, string? BusinessCode);

/// <summary>
/// Lets people delete their own account, as Google Play requires. The person's sign-in details are
/// erased and their name is removed from the business's records; the records themselves stay with
/// the business. The only admin of a business instead closes it: every record of the business is
/// deleted and every account in it is erased. Subscription payments are kept as accounting records.
/// The work is done by the database functions in migration 0010, on the owner connection.
/// </summary>
public sealed class AccountDeletionService(
    IAppDbContext db,
    ISystemDbFactory systemDb,
    ICurrentUser currentUser,
    IPasswordHasher hasher,
    ILogger<AccountDeletionService> logger)
{
    public async Task<AccountDeletionInfoDto> InfoAsync(CancellationToken ct)
    {
        var (user, tenant) = await LoadAsync(ct);
        var others = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.TenantUuid == tenant.Uuid && u.Uuid != user.Uuid && u.Status == RecordStatus.Active)
            .Select(u => u.Role).ToListAsync(ct);
        var mustClose = user.Role == Role.Admin && !others.Contains(Role.Admin);
        return new AccountDeletionInfoDto(mustClose, tenant.TenantName, mustClose ? tenant.TenantCode : null, others.Count);
    }

    public async Task DeleteAsync(DeleteAccountRequest r, CancellationToken ct)
    {
        var (user, tenant) = await LoadAsync(ct);
        if (string.IsNullOrEmpty(r.Password) || !hasher.Verify(user.PasswordHash, r.Password))
            throw DomainException.Validation("password", "The password is not correct.");

        var sys = systemDb.Create();
        await using var tx = await sys.Database.BeginTransactionAsync(ct);
        // One deletion at a time per business, so two admins cannot each leave the other as the "other admin".
        await sys.Database.ExecuteSqlRawAsync("SELECT 1 FROM tenant WHERE uuid = {0} FOR UPDATE", [tenant.Uuid], ct);
        var otherAdmins = await sys.Users.IgnoreQueryFilters().CountAsync(u => u.TenantUuid == tenant.Uuid && u.Uuid != user.Uuid
            && u.Role == Role.Admin && u.Status == RecordStatus.Active, ct);
        var mustClose = user.Role == Role.Admin && otherAdmins == 0;

        if (mustClose)
        {
            if (r.CloseBusiness != true)
                throw DomainException.Rule(ErrorCodes.BusinessRule,
                    "You are the only admin of this business. Make someone else an admin first, or close the business.");
            if (!string.Equals(r.BusinessCode?.Trim(), tenant.TenantCode, StringComparison.OrdinalIgnoreCase))
                throw DomainException.Validation("businessCode", "Type your business code exactly as shown.");
            await sys.Database.ExecuteSqlRawAsync("SELECT app_close_business({0})", [tenant.Uuid], ct);
            await tx.CommitAsync(ct);
            logger.LogWarning("Business {Code} ({Business}) was closed by its admin {User}; its records were deleted",
                tenant.TenantCode, tenant.Uuid, user.Uuid);
            return;
        }

        if (r.CloseBusiness == true)
            throw DomainException.Rule(ErrorCodes.BusinessRule, "Only the business's only admin can close it.");
        await sys.Database.ExecuteSqlRawAsync("SELECT app_forget_user({0})", [user.Uuid], ct);
        await tx.CommitAsync(ct);
        logger.LogInformation("User {User} of business {Code} deleted their account", user.Uuid, tenant.TenantCode);
    }

    private async Task<(AppUser User, Tenant Tenant)> LoadAsync(CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) throw DomainException.Forbidden();
        if (currentUser.IsSuperAdmin())
            throw DomainException.Rule(ErrorCodes.BusinessRule, "The platform owner's account cannot be deleted here.");
        var tenantUuid = currentUser.RequireTenant();
        var user = (await db.Users.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(u => u.Uuid == currentUser.UserUuid && u.TenantUuid == tenantUuid && u.Status == RecordStatus.Active, ct))
            .OrNotFound("User");
        // Business rows are read on the owner connection: a business cannot read its own tenant row
        // through every path, and nothing here is written through this context.
        var tenant = (await systemDb.Create().Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Uuid == tenantUuid, ct)).OrNotFound("Business");
        return (user, tenant);
    }
}
