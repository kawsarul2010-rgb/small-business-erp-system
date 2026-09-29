using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Infrastructure.Persistence;

/// <summary>
/// Applies versioned SQL migrations (embedded Persistence/Migrations/NNNN_name.sql files), checks
/// that every business table is protected by row-level security, and seeds the first super admin.
/// A PostgreSQL advisory lock guarantees only one app instance migrates at a time.
/// Runs outside any business, on the owner connection.
/// </summary>
public sealed class DatabaseInitializer(AppDbContext db, IPasswordHasher hasher, IConfiguration config, ILogger<DatabaseInitializer> logger)
{
    private const long AdvisoryLockKey = 72_600_001;

    public async Task InitializeAsync(CancellationToken ct)
    {
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await db.Database.ExecuteSqlRawAsync($"SELECT pg_advisory_lock({AdvisoryLockKey})", ct);
            try
            {
                await MigrateAsync(ct);
                await EnsureRowLevelSecurityAsync(ct);
                await SeedSuperAdminAsync(ct);
            }
            finally
            {
                await db.Database.ExecuteSqlRawAsync($"SELECT pg_advisory_unlock({AdvisoryLockKey})", ct);
            }
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private async Task MigrateAsync(CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(100) PRIMARY KEY, applied_date timestamptz NOT NULL DEFAULT now())", ct);

        var applied = (await db.Database.SqlQueryRaw<string>("SELECT version AS \"Value\" FROM schema_migrations").ToListAsync(ct))
            .ToHashSet(StringComparer.Ordinal);

        var assembly = typeof(DatabaseInitializer).Assembly;
        var scripts = assembly.GetManifestResourceNames()
            .Where(n => n.Contains(".Persistence.Migrations.", StringComparison.Ordinal) && n.EndsWith(".sql", StringComparison.OrdinalIgnoreCase))
            .Select(n => (Resource: n, Version: VersionOf(n)))
            .OrderBy(s => s.Version, StringComparer.Ordinal)
            .ToList();

        foreach (var (resource, version) in scripts)
        {
            if (applied.Contains(version)) continue;
            logger.LogInformation("Applying database migration {Version}", version);
            var sql = await ReadAsync(assembly, resource);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Plain ADO.NET command so the script text is sent exactly as written.
            await using (var cmd = db.Database.GetDbConnection().CreateCommand())
            {
                cmd.CommandText = sql;
                cmd.Transaction = tx.GetDbTransaction();
                await cmd.ExecuteNonQueryAsync(ct);
            }
            await db.Database.ExecuteSqlRawAsync("INSERT INTO schema_migrations (version) VALUES ({0})", [version], ct);
            await tx.CommitAsync(ct);
        }
    }

    /// <summary>
    /// Refuses to start if any table holding business data (it has a tenant_uuid column) is not
    /// protected by row-level security. A future migration that adds such a table and forgets the
    /// policy would otherwise leak silently; this makes it fail loudly on the first deploy instead.
    /// </summary>
    private async Task EnsureRowLevelSecurityAsync(CancellationToken ct)
    {
        var unprotected = await db.Database.SqlQueryRaw<string>("""
            SELECT c.relname AS "Value"
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_uuid' AND NOT a.attisdropped
            WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity
            """).ToListAsync(ct);
        if (unprotected.Count > 0)
            throw new InvalidOperationException(
                "These tables hold business data but have no row-level security: " + string.Join(", ", unprotected) +
                ". Add ENABLE ROW LEVEL SECURITY and a tenant_isolation policy in a migration (see 0004_multi_business.sql).");
    }

    /// <summary>
    /// Creates the platform owner's account from SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD
    /// when no super admin exists yet. The account belongs to no business and must change its
    /// password at first sign-in.
    /// </summary>
    private async Task SeedSuperAdminAsync(CancellationToken ct)
    {
        var users = db.Users.IgnoreQueryFilters();
        if (await users.AnyAsync(u => u.Role == Role.SuperAdmin && u.Status == RecordStatus.Active, ct)) return;

        var email = config["SEED_SUPERADMIN_EMAIL"];
        var password = config["SEED_SUPERADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("No super admin exists. Set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one on startup.");
            return;
        }
        if (!PasswordPolicy.IsValid(password))
        {
            logger.LogError("SEED_SUPERADMIN_PASSWORD does not meet the password policy: {Policy}", PasswordPolicy.Description);
            return;
        }

        var normalized = email.Trim().ToLowerInvariant();
        if (await users.AnyAsync(u => u.Email.ToLower() == normalized, ct))
        {
            // Never turn a business's own user into the platform owner: that would detach them from
            // their business and hand them every other business's settings.
            logger.LogError("SEED_SUPERADMIN_EMAIL {Email} already belongs to a business user. Use a different email for the super admin.", normalized);
            return;
        }

        db.Users.Add(new AppUser
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = null,
            UserName = config["SEED_SUPERADMIN_NAME"] ?? "Super Admin",
            Email = normalized,
            PhoneNumber = BdMobile.Normalize(config["SEED_SUPERADMIN_PHONE"]) ?? "8801700000000",
            PasswordHash = hasher.Hash(password),
            Role = Role.SuperAdmin,
            MustChangePassword = true,
        });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded super admin {Email}. The password must be changed after first login.", normalized);
    }

    private static string VersionOf(string resourceName)
    {
        // "Sompriti.Erp.Infrastructure.Persistence.Migrations.0001_initial.sql" -> "0001_initial"
        var marker = ".Persistence.Migrations.";
        var name = resourceName[(resourceName.IndexOf(marker, StringComparison.Ordinal) + marker.Length)..];
        return name[..^4];
    }

    private static async Task<string> ReadAsync(Assembly assembly, string resource)
    {
        await using var stream = assembly.GetManifestResourceStream(resource)!;
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
    }
}
