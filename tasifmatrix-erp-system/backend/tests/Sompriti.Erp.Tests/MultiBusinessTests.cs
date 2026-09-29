using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;
using Sompriti.Erp.Infrastructure.Persistence;

namespace Sompriti.Erp.Tests;

/// <summary>
/// Business separation, application side. The database side (row-level security, composite keys,
/// per-business numbering) is proven against a real PostgreSQL by tools/verify-isolation.sql.
/// </summary>
public class TenantStampTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();

    [Fact]
    public void A_new_row_takes_the_signed_in_business() =>
        Assert.Equal(A, TenantStamp.ForNewRow(Guid.Empty, A, "Customer"));

    [Fact]
    public void Setting_the_same_business_explicitly_is_fine() =>
        Assert.Equal(A, TenantStamp.ForNewRow(A, A, "Customer"));

    [Fact]
    public void A_business_cannot_create_a_row_for_another_business()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => TenantStamp.ForNewRow(B, A, "Customer"));
        Assert.Contains("another business", ex.Message);
    }

    [Fact]
    public void Outside_a_business_the_row_must_name_its_business()
    {
        // The super admin creating a business's first admin says which business explicitly.
        Assert.Equal(B, TenantStamp.ForNewRow(B, null, "AppUser"));
        // ...and nothing is ever created without one.
        Assert.Throws<InvalidOperationException>(() => TenantStamp.ForNewRow(Guid.Empty, null, "Customer"));
    }
}

public class TenantCodeTests
{
    [Theory]
    [InlineData("sompriti")]
    [InlineData("rahim-store")]
    [InlineData("abc")]
    [InlineData("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5")] // 30 characters
    public void Accepts_well_formed_codes(string code) => Assert.True(TenantCodes.IsValid(code));

    [Theory]
    [InlineData("ab")]                              // too short
    [InlineData("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p")] // 31 characters
    [InlineData("-shop")]
    [InlineData("shop-")]
    [InlineData("rahim store")]
    [InlineData("Rahim")]                           // not normalised yet
    [InlineData("রহিম")]
    [InlineData("shop_1")]
    public void Rejects_everything_else(string code) => Assert.False(TenantCodes.IsValid(code));

    [Fact]
    public void Normalises_what_people_type() => Assert.Equal("sompriti", TenantCodes.Normalize("  Sompriti "));

    [Fact]
    public void Suggests_a_code_from_the_business_name()
    {
        Assert.Equal("rahim-store-co", TenantCodes.Suggest("Rahim Store & Co."));
        Assert.True(TenantCodes.IsValid(TenantCodes.Suggest("Karim Traders (Dhaka Branch) Limited")));
    }

    /// <summary>The C# rule and the database CHECK constraint must be the same rule.</summary>
    [Fact]
    public void Matches_the_database_constraint()
    {
        var sql = MigrationText.Read("0004_multi_business");
        Assert.Contains("CHECK (tenant_code ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$')", sql);
    }
}

public class TemporaryPasswordTests
{
    [Fact]
    public void Always_meets_the_password_policy_and_avoids_look_alike_characters()
    {
        var seen = new HashSet<string>();
        for (var i = 0; i < 500; i++)
        {
            var p = PasswordPolicy.GenerateTemporary();
            Assert.True(PasswordPolicy.IsValid(p), $"'{p}' breaks the policy");
            Assert.Equal(12, p.Length);
            Assert.False(p.IndexOfAny(['0', 'O', '1', 'l', 'I']) >= 0, $"'{p}' has a look-alike character");
            seen.Add(p);
        }
        Assert.Equal(500, seen.Count);
    }
}

public class SuperAdminRoleTests
{
    [Fact]
    public void Travels_as_SUPER_ADMIN()
    {
        Assert.Equal("SUPER_ADMIN", EnumText.ToText(Role.SuperAdmin));
        Assert.Equal(Role.SuperAdmin, EnumText.Parse<Role>("SUPER_ADMIN"));
        Assert.Equal(Roles.SuperAdmin, EnumText.ToText(Role.SuperAdmin));
    }

    [Fact]
    public void Existing_roles_keep_their_values() // Role is appended, so nothing stored numerically moves.
    {
        Assert.Equal(0, (int)Role.Admin);
        Assert.Equal(1, (int)Role.Manager);
        Assert.Equal(2, (int)Role.User);
    }
}

public class TenantConnectionTests
{
    [Fact]
    public void A_business_connection_switches_to_the_row_level_security_role()
    {
        var id = Guid.Parse("7c9e6679-7425-40de-944b-e07fc1f90ae7");
        Assert.Equal("SET ROLE erp_tenant; SELECT set_config('app.tenant_id', '7c9e6679-7425-40de-944b-e07fc1f90ae7', false);",
            TenantConnectionInterceptor.CommandFor(id));
    }

    [Fact]
    public void Any_other_connection_is_reset_explicitly() =>
        // Not left to the pool: a connection must never carry one request's business into the next.
        Assert.Equal("RESET ROLE; SELECT set_config('app.tenant_id', '', false);", TenantConnectionInterceptor.CommandFor(null));
}

public class PlatformBoundaryTests
{
    private static async Task<(bool PassedOn, int Status)> Run(string path, string? role)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();
        if (role is not null)
            context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ErpClaims.Role, role)], "Bearer", ErpClaims.Name, ErpClaims.Role));
        var passed = false;
        await new PlatformBoundaryMiddleware(_ => { passed = true; return Task.CompletedTask; }).InvokeAsync(context);
        return (passed, context.Response.StatusCode);
    }

    [Fact]
    public async Task The_super_admin_cannot_reach_business_data()
    {
        foreach (var path in new[] { "/api/v1/sales-orders", "/api/v1/customers/123", "/api/v1/reports/customers/pdf", "/api/v1/dashboard", "/api/v1/users" })
        {
            var (passed, status) = await Run(path, Roles.SuperAdmin);
            Assert.False(passed, path);
            Assert.Equal(403, status);
        }
    }

    [Fact]
    public async Task The_super_admin_reaches_the_platform_and_its_own_profile()
    {
        Assert.True((await Run("/api/v1/platform/businesses", Roles.SuperAdmin)).PassedOn);
        Assert.True((await Run("/api/v1/auth/me", Roles.SuperAdmin)).PassedOn);
        Assert.True((await Run("/api/v1/auth/change-password", Roles.SuperAdmin)).PassedOn);
    }

    [Fact]
    public async Task Business_users_cannot_reach_the_platform()
    {
        foreach (var role in new[] { Roles.Admin, Roles.Manager, Roles.User })
        {
            var (passed, status) = await Run("/api/v1/platform/businesses", role);
            Assert.False(passed, role);
            Assert.Equal(403, status);
            Assert.True((await Run("/api/v1/sales-orders", role)).PassedOn);
        }
    }

    [Fact]
    public async Task Signed_out_requests_and_the_website_pass_through() // authentication decides those
    {
        Assert.True((await Run("/api/v1/auth/login", null)).PassedOn);
        Assert.True((await Run("/platform/businesses", Roles.Admin)).PassedOn); // an Angular route, not the API
    }
}

public class RowLevelSecurityCoverageTests
{
    /// <summary>
    /// Every business-owned entity's table must have row-level security enabled by some migration.
    /// Adding an ITenantOwned entity without that fails here - before it can fail open in production.
    /// (The app also refuses to start in that state; this catches it earlier.)
    /// </summary>
    [Fact]
    public void Every_business_owned_table_is_protected()
    {
        var protectedTables = MigrationText.TablesWithRowLevelSecurity();
        var entities = typeof(ITenantOwned).Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(ITenantOwned).IsAssignableFrom(t));
        foreach (var entity in entities)
        {
            var table = AppDbContext.ToSnakeCase(entity.Name);
            Assert.True(protectedTables.Contains(table), $"{entity.Name} (table {table}) has no row-level security");
        }
        Assert.Contains("app_user", protectedTables);
        Assert.Contains("tenant", protectedTables);
    }
}

internal static class MigrationText
{
    public static string Read(string version)
    {
        var assembly = typeof(DatabaseInitializer).Assembly;
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith($".{version}.sql", StringComparison.Ordinal));
        using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
        return reader.ReadToEnd();
    }

    /// <summary>Tables given row-level security by any migration: single statements and the 0004 loop.</summary>
    public static HashSet<string> TablesWithRowLevelSecurity()
    {
        var assembly = typeof(DatabaseInitializer).Assembly;
        var tables = new HashSet<string>();
        foreach (var name in assembly.GetManifestResourceNames().Where(n => n.EndsWith(".sql", StringComparison.Ordinal)))
        {
            using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
            var sql = reader.ReadToEnd();
            foreach (Match m in Regex.Matches(sql, @"ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY"))
                tables.Add(m.Groups[1].Value);
            // FOREACH t IN ARRAY ARRAY[...] LOOP ... ENABLE ROW LEVEL SECURITY
            foreach (Match loop in Regex.Matches(sql, @"ARRAY\[(?<list>[^\]]*)\]\s*LOOP(?<body>.*?)END LOOP", RegexOptions.Singleline))
                if (loop.Groups["body"].Value.Contains("ENABLE ROW LEVEL SECURITY"))
                    foreach (Match t in Regex.Matches(loop.Groups["list"].Value, @"'(\w+)'"))
                        tables.Add(t.Groups[1].Value);
        }
        return tables;
    }
}
