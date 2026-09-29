using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Auth;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Platform;

// ---------------------------------------------------------------------------------------- DTOs

/// <summary>
/// How much a business uses the system. Counts only: the super admin manages businesses but
/// never sees their customers, prices, sales amounts or payments.
/// </summary>
public sealed record BusinessUsageDto(int ActiveUsers, int Companies, int SalesOrders, int PurchaseOrders,
    int OrdersThisMonth, DateTimeOffset? LastOrderDate, DateTimeOffset? LastSignInDate);

public sealed record BusinessListItemDto(Guid Uuid, string Code, string Name, TenantStatus Status,
    string? ContactName, string? ContactPhone, string? ContactEmail, BusinessUsageDto Usage,
    DateTimeOffset CreatedDate, Guid Revision);

public sealed record BusinessAdminDto(Guid Uuid, string UserName, string Email, string PhoneNumber,
    DateTimeOffset? LastLoginDate, bool IsLocked, bool MustChangePassword);

public sealed record BusinessDetailDto(Guid Uuid, string Code, string Name, TenantStatus Status,
    string? ContactName, string? ContactEmail, string? ContactPhone, string? Notes,
    DateTimeOffset? SuspendedDate, string? SuspendReason, BusinessUsageDto Usage, IReadOnlyList<BusinessAdminDto> Admins,
    Guid Revision, DateTimeOffset CreatedDate, string CreatedByUserName, DateTimeOffset UpdatedDate, string UpdatedByUserName);

/// <summary>A temporary password, shown to the super admin once and never stored in readable form.</summary>
public sealed record IssuedCredentialsDto(Guid UserUuid, string UserName, string Email, string TemporaryPassword);

public sealed record CreatedBusinessDto(BusinessDetailDto Business, IssuedCredentialsDto Admin);

public sealed record BusinessAdminRequest(string? UserName, string? Email, string? PhoneNumber);

public sealed record CreateBusinessRequest(string? Code, string? Name, string? ContactName, string? ContactEmail,
    string? ContactPhone, string? Notes, BusinessAdminRequest? Admin);

public sealed record UpdateBusinessRequest(string? Code, string? Name, string? ContactName, string? ContactEmail,
    string? ContactPhone, string? Notes, Guid? Revision);

public sealed record SuspendBusinessRequest(string? Reason, Guid? Revision);

public sealed record BusinessListQuery : PageQuery
{
    public TenantStatus? Status { get; init; }
}

public sealed record PlatformSummaryDto(int Businesses, int ActiveBusinesses, int SuspendedBusinesses, int ActiveUsers, int OrdersThisMonth);

// ---------------------------------------------------------------------------------------- service

/// <summary>
/// The super admin's side of the system: create, edit, suspend and reactivate businesses, and
/// look after their admin accounts.
///
/// These requests run outside any business, so every query here opts out of the business filter
/// explicitly and narrows by the business being managed instead. Nothing here returns a
/// business's own records - only counts and its admin accounts.
/// </summary>
public sealed class PlatformService(IAppDbContext db, ICurrentUser currentUser, IPasswordHasher hasher,
    AuthService auth, TimeProvider clock)
{
    private void EnsureSuperAdmin()
    {
        // The controller already requires the role; this keeps the service safe if called from elsewhere.
        if (!currentUser.IsSuperAdmin()) throw DomainException.Forbidden();
    }

    // ------------------------------------------------------------------ read

    public async Task<PlatformSummaryDto> SummaryAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var monthStart = MonthStart();
        var statuses = await db.Tenants.AsNoTracking().Select(t => t.Status).ToListAsync(ct);
        var users = await db.Users.IgnoreQueryFilters().CountAsync(u => u.TenantUuid != null && u.Status == RecordStatus.Active, ct);
        var sales = await db.SalesOrders.IgnoreQueryFilters().CountAsync(o => o.Status == RecordStatus.Active && o.OrderDate >= monthStart, ct);
        var purchases = await db.PurchaseOrders.IgnoreQueryFilters().CountAsync(o => o.Status == RecordStatus.Active && o.OrderDate >= monthStart, ct);
        return new PlatformSummaryDto(statuses.Count, statuses.Count(s => s == TenantStatus.Active),
            statuses.Count(s => s == TenantStatus.Suspended), users, sales + purchases);
    }

    public async Task<PagedResult<BusinessListItemDto>> ListAsync(BusinessListQuery q, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var tenants = db.Tenants.AsNoTracking();
        if (q.Status is { } status) tenants = tenants.Where(t => t.Status == status);
        if (q.Term is { } term)
        {
            var like = term.ToLower();
            tenants = tenants.Where(t => t.TenantName.ToLower().Contains(like) || t.TenantCode.Contains(like)
                || (t.ContactName != null && t.ContactName.ToLower().Contains(like))
                || (t.ContactPhone != null && t.ContactPhone.Contains(like)));
        }

        var page = await tenants.OrderBy(t => t.TenantName).ToPagedAsync(q, t => t, ct);
        var usage = await UsageAsync(page.Items.Select(t => t.Uuid).ToList(), ct);
        var items = page.Items.Select(t => new BusinessListItemDto(t.Uuid, t.TenantCode, t.TenantName, t.Status,
            t.ContactName, Phone(t.ContactPhone), t.ContactEmail, usage[t.Uuid], t.CreatedDate, t.Revision)).ToList();
        return new PagedResult<BusinessListItemDto>(items, page.Page, page.PageSize, page.TotalCount);
    }

    public async Task<BusinessDetailDto> GetAsync(Guid id, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var t = (await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == id, ct)).OrNotFound("Business");
        var usage = (await UsageAsync([id], ct))[id];
        var now = clock.GetUtcNow();
        var admins = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.TenantUuid == id && u.Role == Role.Admin && u.Status == RecordStatus.Active)
            .OrderBy(u => u.UserName)
            .Select(u => new BusinessAdminDto(u.Uuid, u.UserName, u.Email, u.PhoneNumber, u.LastLoginDate,
                u.LockoutEndDate != null && u.LockoutEndDate > now, u.MustChangePassword))
            .ToListAsync(ct);
        return new BusinessDetailDto(t.Uuid, t.TenantCode, t.TenantName, t.Status, t.ContactName, t.ContactEmail,
            Phone(t.ContactPhone), t.Notes, t.SuspendedDate, t.SuspendReason, usage,
            admins.Select(a => a with { PhoneNumber = BdMobile.ToDisplay(a.PhoneNumber) }).ToList(),
            t.Revision, t.CreatedDate, t.CreatedByUserName, t.UpdatedDate, t.UpdatedByUserName);
    }

    /// <summary>Usage per business, in one grouped query per table rather than one per business.</summary>
    private async Task<Dictionary<Guid, BusinessUsageDto>> UsageAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        var monthStart = MonthStart();
        var users = await db.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.TenantUuid != null && ids.Contains(u.TenantUuid.Value) && u.Status == RecordStatus.Active)
            .GroupBy(u => u.TenantUuid!.Value)
            .Select(g => new { Tenant = g.Key, Count = g.Count(), LastLogin = g.Max(u => u.LastLoginDate) })
            .ToListAsync(ct);
        var companies = await db.Companies.IgnoreQueryFilters().AsNoTracking()
            .Where(c => ids.Contains(c.TenantUuid) && c.Status == RecordStatus.Active)
            .GroupBy(c => c.TenantUuid)
            .Select(g => new { Tenant = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var sales = await db.SalesOrders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => ids.Contains(o.TenantUuid) && o.Status == RecordStatus.Active)
            .GroupBy(o => o.TenantUuid)
            .Select(g => new { Tenant = g.Key, Count = g.Count(), ThisMonth = g.Count(o => o.OrderDate >= monthStart), Last = g.Max(o => (DateTimeOffset?)o.CreatedDate) })
            .ToListAsync(ct);
        var purchases = await db.PurchaseOrders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => ids.Contains(o.TenantUuid) && o.Status == RecordStatus.Active)
            .GroupBy(o => o.TenantUuid)
            .Select(g => new { Tenant = g.Key, Count = g.Count(), ThisMonth = g.Count(o => o.OrderDate >= monthStart), Last = g.Max(o => (DateTimeOffset?)o.CreatedDate) })
            .ToListAsync(ct);

        return ids.ToDictionary(id => id, id =>
        {
            var u = users.FirstOrDefault(x => x.Tenant == id);
            var s = sales.FirstOrDefault(x => x.Tenant == id);
            var p = purchases.FirstOrDefault(x => x.Tenant == id);
            DateTimeOffset? last = new[] { s?.Last, p?.Last }.Max();
            return new BusinessUsageDto(u?.Count ?? 0, companies.FirstOrDefault(x => x.Tenant == id)?.Count ?? 0,
                s?.Count ?? 0, p?.Count ?? 0, (s?.ThisMonth ?? 0) + (p?.ThisMonth ?? 0), last, u?.LastLogin);
        });
    }

    // ------------------------------------------------------------------ write

    /// <summary>Creates a business together with its first admin, who must change the password at first sign-in.</summary>
    public async Task<CreatedBusinessDto> CreateAsync(CreateBusinessRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var (code, name, contactPhone) = ValidateBusiness(r.Code, r.Name, r.ContactName, r.ContactEmail, r.ContactPhone, r.Notes);
        if (r.Admin is null) throw DomainException.Validation("admin.email", "The business needs its first admin.");
        var admin = await ValidateAdminAsync(r.Admin, "admin.", ct);
        await EnsureCodeFreeAsync(code, exceptId: null, ct);

        var tenant = new Tenant
        {
            Uuid = Guid.NewGuid(),
            TenantCode = code,
            TenantName = name,
            ContactName = Validator.Clean(r.ContactName),
            ContactEmail = Validator.Clean(r.ContactEmail)?.ToLowerInvariant(),
            ContactPhone = contactPhone,
            Notes = Validator.Clean(r.Notes),
        };
        var (user, password) = NewAdmin(tenant.Uuid, admin);

        // Two saves inside one transaction: the admin row references the business, and EF Core only
        // orders inserts by relationships it knows about. With no relationship mapped it sorts by
        // table name, which puts app_user before tenant and fails the foreign key. Saving the
        // business first makes the order explicit; the transaction still makes it all-or-nothing.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(ct);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new CreatedBusinessDto(await GetAsync(tenant.Uuid, ct),
            new IssuedCredentialsDto(user.Uuid, user.UserName, user.Email, password));
    }

    public async Task<BusinessDetailDto> UpdateAsync(Guid id, UpdateBusinessRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var (code, name, contactPhone) = ValidateBusiness(r.Code, r.Name, r.ContactName, r.ContactEmail, r.ContactPhone, r.Notes);
        var tenant = (await db.Tenants.FirstOrDefaultAsync(t => t.Uuid == id, ct)).OrNotFound("Business");
        RevisionGuard.Check(db, tenant, r.Revision ?? Guid.Empty);
        await EnsureCodeFreeAsync(code, exceptId: id, ct);

        tenant.TenantCode = code;
        tenant.TenantName = name;
        tenant.ContactName = Validator.Clean(r.ContactName);
        tenant.ContactEmail = Validator.Clean(r.ContactEmail)?.ToLowerInvariant();
        tenant.ContactPhone = contactPhone;
        tenant.Notes = Validator.Clean(r.Notes);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>
    /// Stops the business signing in. Its data is untouched and it comes back exactly as it was
    /// when reactivated. Signed-in users are stopped on their next request.
    /// </summary>
    public async Task<BusinessDetailDto> SuspendAsync(Guid id, SuspendBusinessRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var reason = Validator.Clean(r.Reason);
        new Validator().Required("reason", reason, "Reason", 500).ThrowIfInvalid();
        var tenant = (await db.Tenants.FirstOrDefaultAsync(t => t.Uuid == id, ct)).OrNotFound("Business");
        RevisionGuard.Check(db, tenant, r.Revision ?? Guid.Empty);
        if (tenant.Status == TenantStatus.Suspended)
            throw DomainException.Rule(ErrorCodes.InvalidStatusTransition, "This business is already suspended.");

        tenant.Status = TenantStatus.Suspended;
        tenant.SuspendedDate = clock.GetUtcNow();
        tenant.SuspendReason = reason;

        // End every session now rather than waiting for refresh tokens to expire.
        var now = clock.GetUtcNow();
        var userIds = await db.Users.IgnoreQueryFilters().Where(u => u.TenantUuid == id).Select(u => u.Uuid).ToListAsync(ct);
        var sessions = await db.RefreshTokens.Where(t => userIds.Contains(t.UserUuid) && t.RevokedDate == null).ToListAsync(ct);
        foreach (var session in sessions) session.RevokedDate = now;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<BusinessDetailDto> ActivateAsync(Guid id, RevisionRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var tenant = (await db.Tenants.FirstOrDefaultAsync(t => t.Uuid == id, ct)).OrNotFound("Business");
        RevisionGuard.Check(db, tenant, r.Revision);
        if (tenant.Status == TenantStatus.Active)
            throw DomainException.Rule(ErrorCodes.InvalidStatusTransition, "This business is already active.");
        tenant.Status = TenantStatus.Active;
        tenant.SuspendedDate = null;
        tenant.SuspendReason = null;
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Adds another admin - for when the only admin has left or lost access.</summary>
    public async Task<IssuedCredentialsDto> AddAdminAsync(Guid id, BusinessAdminRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        if (!await db.Tenants.AnyAsync(t => t.Uuid == id, ct)) throw DomainException.NotFound("Business");
        var admin = await ValidateAdminAsync(r, "", ct);
        var (user, password) = NewAdmin(id, admin);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return new IssuedCredentialsDto(user.Uuid, user.UserName, user.Email, password);
    }

    /// <summary>
    /// Gives a business admin a new temporary password, unlocks the account and signs it out
    /// everywhere. Only admins: a business's other accounts are its own admin's to manage.
    /// </summary>
    public async Task<IssuedCredentialsDto> ResetAdminPasswordAsync(Guid id, Guid userId, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var user = (await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Uuid == userId && u.TenantUuid == id && u.Role == Role.Admin && u.Status == RecordStatus.Active, ct))
            .OrNotFound("Business admin");
        var password = PasswordPolicy.GenerateTemporary();
        user.PasswordHash = hasher.Hash(password);
        user.MustChangePassword = true;
        user.FailedLoginCount = 0;
        user.LockoutEndDate = null;
        await auth.RevokeAllAsync(user.Uuid, ct);
        await db.SaveChangesAsync(ct);
        return new IssuedCredentialsDto(user.Uuid, user.UserName, user.Email, password);
    }

    // ------------------------------------------------------------------ helpers

    private sealed record ValidAdmin(string UserName, string Email, string Phone);

    private static (string Code, string Name, string? Phone) ValidateBusiness(string? rawCode, string? rawName,
        string? contactName, string? contactEmail, string? contactPhone, string? notes)
    {
        var code = TenantCodes.Normalize(rawCode);
        var name = Validator.Clean(rawName);
        var email = Validator.Clean(contactEmail);
        var phone = BdMobile.Normalize(contactPhone);
        new Validator()
            .Required("code", code, "Business code", 30)
            .When(code is not null && !TenantCodes.IsValid(code), "code", "Business code must be " + TenantCodes.Description.ToLowerInvariant())
            .Required("name", name, "Business name", 150)
            .MaxLength("contactName", contactName, "Contact name", 100)
            .MaxLength("contactEmail", email, "Contact email", 200)
            .When(email is not null && !Validator.IsEmail(email), "contactEmail", "Contact email is not valid.")
            .When(!string.IsNullOrWhiteSpace(contactPhone) && phone is null, "contactPhone", "Enter a valid Bangladesh mobile number, e.g. 01712345678.")
            .MaxLength("notes", notes, "Notes", 1000)
            .ThrowIfInvalid();
        return (code!, name!, phone);
    }

    private async Task<ValidAdmin> ValidateAdminAsync(BusinessAdminRequest r, string prefix, CancellationToken ct)
    {
        string phone;
        try
        {
            phone = AuthService.ValidateProfile(r.UserName, r.Email, r.PhoneNumber, password: null, passwordRequired: false);
        }
        catch (DomainException e) when (prefix.Length > 0)
        {
            // Report the admin's fields under "admin.*" so the form marks the right inputs.
            throw new DomainException(e.Kind, e.Code, e.Message, e.Errors.ToDictionary(kv => prefix + kv.Key, kv => kv.Value));
        }
        var email = r.Email!.Trim().ToLowerInvariant();
        if (await db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email.ToLower() == email, ct))
            throw DomainException.Validation(prefix + "email", "An account with this email already exists.");
        return new ValidAdmin(r.UserName!.Trim(), email, phone);
    }

    private (AppUser User, string Password) NewAdmin(Guid tenantUuid, ValidAdmin a)
    {
        var password = PasswordPolicy.GenerateTemporary();
        var user = new AppUser
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = tenantUuid,
            UserName = a.UserName,
            Email = a.Email,
            PhoneNumber = a.Phone,
            Role = Role.Admin,
            PasswordHash = hasher.Hash(password),
            MustChangePassword = true,
        };
        return (user, password);
    }

    private async Task EnsureCodeFreeAsync(string code, Guid? exceptId, CancellationToken ct)
    {
        if (await db.Tenants.AnyAsync(t => t.TenantCode == code && t.Uuid != exceptId, ct))
            throw DomainException.Validation("code", "Another business already uses this code.");
    }

    private static string? Phone(string? stored) => stored is null ? null : BdMobile.ToDisplay(stored);

    private DateOnly MonthStart()
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().ToOffset(BusinessClock.Offset).DateTime);
        return new DateOnly(today.Year, today.Month, 1);
    }
}
