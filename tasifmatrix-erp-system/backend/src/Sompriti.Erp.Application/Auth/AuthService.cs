using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Auth;

/// <summary>Self-registration. BusinessCode names the business the person is joining.</summary>
public sealed record RegisterRequest(string? UserName, string? Email, string? PhoneNumber, string? Password, string? BusinessCode = null);
/// <summary>
/// Registers a new business with the person as its first admin. BusinessCode may be left out:
/// it is then made from the business name.
/// </summary>
public sealed record RegisterBusinessRequest(string? BusinessName, string? BusinessCode, string? UserName, string? Email,
    string? PhoneNumber, string? Password, Guid? BusinessSizeUuid = null);
/// <summary>
/// What the sign-up page offers: whether a business may register itself, and - when billing is on -
/// the sizes to choose from, the free trial and the packages with their price for each size.
/// </summary>
public sealed record SignupOptionsDto(bool BusinessSignup, bool BillingEnabled = false, int TrialDays = 0,
    IReadOnlyList<SizeOptionDto>? Sizes = null, IReadOnlyList<PlanOfferDto>? Plans = null);
public sealed record LoginRequest(string? Email, string? Password);
public sealed record RefreshRequest(string? RefreshToken);
public sealed record ForgotPasswordRequest(string? Email);
public sealed record ResetPasswordRequest(string? Token, string? NewPassword);
public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

/// <summary>BusinessUuid/Name/Code are null for the super admin, who belongs to no business.</summary>
public sealed record CurrentUserDto(Guid Uuid, string UserName, string Email, string PhoneNumber, Role Role,
    Guid? SupplierUuid, string? SupplierName, Guid? CustomerUuid, string? CustomerName, bool MustChangePassword,
    Guid? BusinessUuid = null, string? BusinessName = null, string? BusinessCode = null);

public sealed record AuthResponse(string AccessToken, DateTimeOffset AccessTokenExpiresAt, string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt, CurrentUserDto User);

public sealed class AuthOptions
{
    public const string Section = "Auth";
    public int RefreshTokenDays { get; set; } = 7;
    public int MaxFailedLogins { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int PasswordResetMinutes { get; set; } = 30;
}

/// <remarks>
/// Sign-in happens before anyone's business is known, so the lookups here opt out of the
/// business filter explicitly (IgnoreQueryFilters) and narrow by the user's own id or email
/// instead. Every other service relies on the filter.
/// </remarks>
public sealed class AuthService(
    IAppDbContext db, ICurrentUser currentUser, IPasswordHasher hasher, ITokenService tokens, IEmailSender email,
    IOptions<AuthOptions> authOptions, IOptions<AppOptions> appOptions, IBusinessProfile business,
    TimeProvider clock, ILogger<AuthService> logger, BillingSettingsCache billingSettings)
{
    private readonly AuthOptions _opt = authOptions.Value;

    /// <summary>Users across all businesses - for sign-in flows only. Email addresses are unique system-wide.</summary>
    private IQueryable<AppUser> AllUsers => db.Users.IgnoreQueryFilters();

    public async Task<AuthResponse> RegisterAsync(RegisterRequest r, CancellationToken ct)
    {
        var code = TenantCodes.Normalize(r.BusinessCode);
        if (code is null) throw DomainException.Validation("businessCode", "Business code is required. Ask your business for it.");
        var phone = ValidateProfile(r.UserName, r.Email, r.PhoneNumber, r.Password);

        // A suspended business is reported the same as an unknown one: a stranger learns nothing about it.
        var tenant = await db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantCode == code && t.Status == TenantStatus.Active, ct);
        if (tenant is null)
            throw DomainException.Validation("businessCode", "No business uses this code. Check it with your business.");

        var emailNorm = r.Email!.Trim().ToLowerInvariant();
        if (await AllUsers.AnyAsync(u => u.Email.ToLower() == emailNorm, ct))
            throw DomainException.Conflict(ErrorCodes.DuplicateCode, "An account with this email already exists.");

        var user = new AppUser
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = tenant.Uuid,
            UserName = r.UserName!.Trim(),
            Email = emailNorm,
            PhoneNumber = phone,
            PasswordHash = hasher.Hash(r.Password!),
            Role = Role.User, // SRS 5: registration always creates USER
        };
        db.SetAuditUser(user.Uuid, user.UserName);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return await IssueAsync(user, ct);
    }

    public async Task<SignupOptionsDto> SignupOptionsAsync(CancellationToken ct)
    {
        // Signed out: this context is the database owner, so the billing tables are readable.
        var s = await billingSettings.GetAsync(db, ct);
        var sizes = await db.BusinessSizes.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.SortOrder).ThenBy(x => x.SizeName)
            .Select(x => new SizeOptionDto(x.Uuid, x.SizeName, x.Description)).ToListAsync(ct);
        var plans = new List<PlanOfferDto>();
        if (s.BillingEnabled)
        {
            var activePlans = await db.SubscriptionPlans.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.SortOrder).ThenBy(x => x.DurationMonths).ToListAsync(ct);
            var sizeIds = sizes.Select(x => x.Uuid).ToList();
            var prices = await db.SubscriptionPlanPrices.AsNoTracking().Where(x => sizeIds.Contains(x.SizeUuid)).ToListAsync(ct);
            plans = activePlans.Select(p => new PlanOfferDto(p.Uuid, p.PlanName, p.Description, p.DurationMonths,
                    prices.Where(x => x.PlanUuid == p.Uuid).Select(x => new PlanPriceDto(x.SizeUuid, x.Price)).ToList()))
                .Where(p => p.Prices.Count > 0).ToList();
        }
        return new SignupOptionsDto(appOptions.Value.AllowBusinessSignup, s.BillingEnabled, s.BillingEnabled ? s.TrialDays : 0, sizes, plans);
    }

    /// <summary>
    /// Creates a business and its first admin from the sign-up page, and signs the admin in.
    /// The business is active straight away; the super admin sees it on the Businesses page and
    /// can suspend it like any other.
    /// </summary>
    public async Task<AuthResponse> RegisterBusinessAsync(RegisterBusinessRequest r, CancellationToken ct)
    {
        if (!appOptions.Value.AllowBusinessSignup)
            throw DomainException.Rule(ErrorCodes.BusinessRule,
                $"Registering a new business is turned off. Please contact {business.ProductName} support.");

        // Business and personal fields are checked together, so the form marks every problem at once.
        var name = Validator.Clean(r.BusinessName);
        var code = TenantCodes.Normalize(string.IsNullOrWhiteSpace(r.BusinessCode) ? TenantCodes.Suggest(name) : r.BusinessCode);
        var v = new Validator()
            .Required("businessName", name, "Business name", 150)
            .Required("businessCode", code, "Business code", 30)
            .When(code is not null && !TenantCodes.IsValid(code), "businessCode",
                "Business code must be " + TenantCodes.Description.ToLowerInvariant());
        var phone = AddProfileRules(v, r.UserName, r.Email, r.PhoneNumber, r.Password, passwordRequired: true);
        var activeSizes = await db.BusinessSizes.AsNoTracking().Where(x => x.IsActive).Select(x => x.Uuid).ToListAsync(ct);
        v.When(activeSizes.Count > 0 && r.BusinessSizeUuid is null, "businessSizeUuid", "Choose your business size.")
         .When(r.BusinessSizeUuid is { } chosen && !activeSizes.Contains(chosen), "businessSizeUuid", "Choose your business size.");
        v.ThrowIfInvalid();

        var emailNorm = r.Email!.Trim().ToLowerInvariant();
        if (await AllUsers.AnyAsync(u => u.Email.ToLower() == emailNorm, ct))
            throw DomainException.Validation("email", "An account with this email already exists.");
        if (await db.Tenants.AnyAsync(t => t.TenantCode == code, ct))
            throw DomainException.Validation("businessCode", "Another business already uses this code.");

        var tenant = new Tenant
        {
            Uuid = Guid.NewGuid(),
            TenantCode = code!,
            TenantName = name!,
            ContactName = r.UserName!.Trim(),
            ContactEmail = emailNorm,
            ContactPhone = phone,
            BusinessSizeUuid = r.BusinessSizeUuid,
        };
        // With billing on, the free trial starts now (no trial: payment is due now, with the grace days to pay).
        var billing = await billingSettings.GetAsync(db, ct);
        if (billing.BillingEnabled)
        {
            tenant.SubscriptionEndsAt = clock.GetUtcNow().AddDays(billing.TrialDays);
            tenant.OnTrial = billing.TrialDays > 0;
        }
        var user = new AppUser
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = tenant.Uuid,
            UserName = r.UserName!.Trim(),
            Email = emailNorm,
            PhoneNumber = phone!,
            PasswordHash = hasher.Hash(r.Password!),
            Role = Role.Admin,          // the owner runs the business's account
            MustChangePassword = false, // they chose the password themselves
            LastLoginDate = clock.GetUtcNow(),
        };

        // As in PlatformService.CreateAsync: the business row first, then its admin, in one transaction.
        db.SetAuditUser(user.Uuid, user.UserName);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(ct);
        db.Users.Add(user);
        db.Companies.Add(MasterData.CompanyService.NewForBusiness(tenant));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("Business {Code} registered from the sign-up page by {Email}", tenant.TenantCode, user.Email);
        return await IssueAsync(user, ct);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Email) || string.IsNullOrEmpty(r.Password))
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidCredentials, "Invalid email or password.");

        var emailNorm = r.Email.Trim().ToLowerInvariant();
        var user = await AllUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == emailNorm && u.Status == RecordStatus.Active, ct);
        var now = clock.GetUtcNow();

        if (user is null)
        {
            hasher.Hash(r.Password); // similar timing for unknown accounts
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidCredentials, "Invalid email or password.");
        }

        db.SetAuditUser(user.Uuid, user.UserName);

        if (user.LockoutEndDate is { } until && until > now)
        {
            var minutes = Math.Max(1, (int)Math.Ceiling((until - now).TotalMinutes));
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.AccountLocked,
                $"Too many failed attempts. Try again in {minutes} minute(s).");
        }

        if (!hasher.Verify(user.PasswordHash, r.Password))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= _opt.MaxFailedLogins)
            {
                user.FailedLoginCount = 0;
                user.LockoutEndDate = now.AddMinutes(_opt.LockoutMinutes);
            }
            await db.SaveChangesAsync(ct);
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidCredentials, "Invalid email or password.");
        }

        // Checked only after the password, so the message does not reveal which emails exist.
        await EnsureBusinessActiveAsync(user, ct);

        user.FailedLoginCount = 0;
        user.LockoutEndDate = null;
        user.LastLoginDate = now;
        await db.SaveChangesAsync(ct);
        return await IssueAsync(user, ct);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.RefreshToken))
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidToken, "Session expired. Please log in again.");
        var hash = HashToken(r.RefreshToken);
        var now = clock.GetUtcNow();
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || token.RevokedDate is not null || token.ExpiresDate <= now)
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidToken, "Session expired. Please log in again.");

        var user = await AllUsers.FirstOrDefaultAsync(u => u.Uuid == token.UserUuid && u.Status == RecordStatus.Active, ct);
        if (user is null)
            throw new DomainException(ErrorKind.Unauthorized, ErrorCodes.InvalidToken, "Session expired. Please log in again.");
        // A suspension takes effect on the next refresh, at most one access-token lifetime later.
        await EnsureBusinessActiveAsync(user, ct);

        token.RevokedDate = now; // rotation
        return await IssueAsync(user, ct);
    }

    public async Task LogoutAsync(RefreshRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.RefreshToken)) return;
        var hash = HashToken(r.RefreshToken);
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedDate == null, ct);
        if (token is null) return;
        token.RevokedDate = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    public async Task<CurrentUserDto> MeAsync(CancellationToken ct)
    {
        var user = await AllUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Uuid == currentUser.UserUuid && u.Status == RecordStatus.Active, ct);
        return await ToDtoAsync(user.OrNotFound("User"), ct);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest r, CancellationToken ct)
    {
        var v = new Validator();
        v.When(string.IsNullOrEmpty(r.CurrentPassword), "currentPassword", "Current password is required.");
        v.When(!PasswordPolicy.IsValid(r.NewPassword), "newPassword", PasswordPolicy.Description);
        v.ThrowIfInvalid();

        var user = (await AllUsers.FirstOrDefaultAsync(u => u.Uuid == currentUser.UserUuid && u.Status == RecordStatus.Active, ct)).OrNotFound("User");
        if (!hasher.Verify(user.PasswordHash, r.CurrentPassword!))
            throw DomainException.Validation("currentPassword", "Current password is incorrect.");
        if (hasher.Verify(user.PasswordHash, r.NewPassword!))
            throw DomainException.Validation("newPassword", "New password must be different from the current password.");

        user.PasswordHash = hasher.Hash(r.NewPassword!);
        user.MustChangePassword = false;
        await RevokeAllAsync(user.Uuid, ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>SRS 6.8: always succeeds from the caller's point of view.</summary>
    public async Task ForgotPasswordAsync(ForgotPasswordRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Email)) return;
        var emailNorm = r.Email.Trim().ToLowerInvariant();
        var user = await AllUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Email.ToLower() == emailNorm && u.Status == RecordStatus.Active, ct);
        if (user is null) return;

        var now = clock.GetUtcNow();
        var raw = NewToken();
        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            Uuid = Guid.NewGuid(),
            UserUuid = user.Uuid,
            TokenHash = HashToken(raw),
            CreatedDate = now,
            ExpiresDate = now.AddMinutes(_opt.PasswordResetMinutes),
        });
        await db.SaveChangesAsync(ct);

        var link = $"{appOptions.Value.PublicBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(raw)}";
        var name = WebUtility.HtmlEncode(user.UserName);
        var businessName = await business.NameOfAsync(user.TenantUuid, ct);
        var app = WebUtility.HtmlEncode(businessName);
        var html = $"""
            <p>Hello {name},</p>
            <p>We received a request to reset your {app} password.</p>
            <p><a href="{link}">Reset your password</a></p>
            <p>This link expires in {_opt.PasswordResetMinutes} minutes. If you did not request this, you can ignore this email.</p>
            """;
        try
        {
            await email.SendAsync(user.Email, user.UserName, $"{businessName}: reset your password", html, ct: ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Password reset email failed for user {UserUuid}", user.Uuid);
        }
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Token))
            throw DomainException.Rule(ErrorCodes.InvalidToken, "This reset link is invalid or has expired.");
        if (!PasswordPolicy.IsValid(r.NewPassword))
            throw DomainException.Validation("newPassword", PasswordPolicy.Description);

        var now = clock.GetUtcNow();
        var hash = HashToken(r.Token);
        var token = await db.PasswordResetTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null || token.UsedDate is not null || token.ExpiresDate <= now)
            throw DomainException.Rule(ErrorCodes.InvalidToken, "This reset link is invalid or has expired.");

        var user = await AllUsers.FirstOrDefaultAsync(u => u.Uuid == token.UserUuid && u.Status == RecordStatus.Active, ct);
        if (user is null)
            throw DomainException.Rule(ErrorCodes.InvalidToken, "This reset link is invalid or has expired.");

        db.SetAuditUser(user.Uuid, user.UserName);
        token.UsedDate = now;
        user.PasswordHash = hasher.Hash(r.NewPassword!);
        user.MustChangePassword = false;
        user.FailedLoginCount = 0;
        user.LockoutEndDate = null;
        await RevokeAllAsync(user.Uuid, ct);
        await db.SaveChangesAsync(ct);

        try
        {
            await email.SendAsync(user.Email, user.UserName, $"{await business.NameOfAsync(user.TenantUuid, ct)}: your password was changed",
                $"<p>Hello {WebUtility.HtmlEncode(user.UserName)},</p><p>Your password was changed. If this was not you, contact your administrator immediately.</p>", ct: ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Password changed confirmation email failed for user {UserUuid}", user.Uuid);
        }
    }

    // ------------------------------------------------------------------ helpers

    public async Task RevokeAllAsync(Guid userUuid, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var active = await db.RefreshTokens.Where(t => t.UserUuid == userUuid && t.RevokedDate == null).ToListAsync(ct);
        foreach (var t in active) t.RevokedDate = now;
    }

    private async Task<AuthResponse> IssueAsync(AppUser user, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var (access, accessExp) = tokens.CreateAccessToken(user);
        var raw = NewToken();
        var refresh = new RefreshToken
        {
            Uuid = Guid.NewGuid(),
            UserUuid = user.Uuid,
            TokenHash = HashToken(raw),
            CreatedDate = now,
            ExpiresDate = now.AddDays(_opt.RefreshTokenDays),
        };
        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync(ct);
        return new AuthResponse(access, accessExp, raw, refresh.ExpiresDate, await ToDtoAsync(user, ct));
    }

    /// <summary>
    /// Refuses sign-in for a suspended business. The message names the product rather than the
    /// business: the person signing in works for the business and needs to know whom to call.
    /// </summary>
    private async Task EnsureBusinessActiveAsync(AppUser user, CancellationToken ct)
    {
        if (user.TenantUuid is not { } tenantUuid) return; // super admin
        var status = await db.Tenants.AsNoTracking().Where(t => t.Uuid == tenantUuid).Select(t => (TenantStatus?)t.Status).FirstOrDefaultAsync(ct);
        if (status != TenantStatus.Active)
            throw new DomainException(ErrorKind.Forbidden, ErrorCodes.BusinessSuspended,
                $"This business account is suspended. Please contact {business.ProductName} support.");
    }

    private async Task<CurrentUserDto> ToDtoAsync(AppUser u, CancellationToken ct)
    {
        // Called during sign-in too, before a business is set, so the links are looked up
        // without the filter but only inside the user's own business.
        var supplierName = u.SupplierUuid is { } sid
            ? await db.Suppliers.IgnoreQueryFilters().AsNoTracking().Where(s => s.Uuid == sid && s.TenantUuid == u.TenantUuid).Select(s => s.Name).FirstOrDefaultAsync(ct) : null;
        var customerName = u.CustomerUuid is { } cid
            ? await db.Customers.IgnoreQueryFilters().AsNoTracking().Where(s => s.Uuid == cid && s.TenantUuid == u.TenantUuid).Select(s => s.Name).FirstOrDefaultAsync(ct) : null;
        var tenant = u.TenantUuid is { } tid
            ? await db.Tenants.AsNoTracking().Where(t => t.Uuid == tid).Select(t => new { t.TenantName, t.TenantCode }).FirstOrDefaultAsync(ct) : null;
        return new CurrentUserDto(u.Uuid, u.UserName, u.Email, BdMobile.ToDisplay(u.PhoneNumber), u.Role,
            u.SupplierUuid, supplierName, u.CustomerUuid, customerName, u.MustChangePassword,
            u.TenantUuid, tenant?.TenantName, tenant?.TenantCode);
    }

    /// <summary>Validates name/email/phone/password; returns the normalized phone.</summary>
    internal static string ValidateProfile(string? userName, string? emailAddress, string? phone, string? password, bool passwordRequired = true)
    {
        var v = new Validator();
        var normalized = AddProfileRules(v, userName, emailAddress, phone, password, passwordRequired);
        v.ThrowIfInvalid();
        return normalized!;
    }

    /// <summary>Adds the name/email/phone/password rules to <paramref name="v"/>; returns the normalized phone (null if invalid).</summary>
    private static string? AddProfileRules(Validator v, string? userName, string? emailAddress, string? phone, string? password, bool passwordRequired)
    {
        v.Required("userName", userName, "Name", 100)
            .Required("email", emailAddress, "Email", 200)
            .Required("phoneNumber", phone, "Phone number");
        v.When(!string.IsNullOrWhiteSpace(emailAddress) && !IsEmail(emailAddress), "email", "Email is not valid.");
        var normalized = BdMobile.Normalize(phone);
        v.When(!string.IsNullOrWhiteSpace(phone) && normalized is null, "phoneNumber", "Enter a valid Bangladesh mobile number, e.g. 01712345678.");
        if (passwordRequired || !string.IsNullOrEmpty(password))
            v.When(!PasswordPolicy.IsValid(password), "password", PasswordPolicy.Description);
        return normalized;
    }

    private static bool IsEmail(string value) => Validator.IsEmail(value);

    private static string NewToken() => Base64Url(RandomNumberGenerator.GetBytes(48));

    public static string HashToken(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
