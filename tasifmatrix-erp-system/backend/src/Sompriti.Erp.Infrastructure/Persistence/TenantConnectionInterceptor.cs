using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Sompriti.Erp.Infrastructure.Persistence;

/// <summary>
/// The database half of business separation. Each time EF opens a connection on behalf of a
/// signed-in business, it switches to the row-level-security role erp_tenant and records the
/// business; PostgreSQL then hides every other business's rows from that connection, whatever
/// the query says (see migration 0004).
///
/// Connections opened with no business - migrations, sign-in, the super admin's platform
/// screens, background jobs - stay the database owner, which is not subject to row-level
/// security. Those paths see other businesses only where the code asks for it with
/// IgnoreQueryFilters().
///
/// Both branches set the state explicitly rather than trusting the pool to have reset it,
/// so a connection can never carry one request's business into the next.
/// </summary>
public sealed class TenantConnectionInterceptor : DbConnectionInterceptor
{
    public const string TenantRole = "erp_tenant";

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var command = Build(connection, eventData);
        command.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using var command = Build(connection, eventData);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static DbCommand Build(DbConnection connection, ConnectionEndEventData eventData)
    {
        var command = connection.CreateCommand();
        command.CommandText = CommandFor((eventData.Context as AppDbContext)?.ConnectionTenant);
        return command;
    }

    /// <summary>The statement run on every newly opened connection.</summary>
    public static string CommandFor(Guid? tenant) => tenant is { } id
        // A Guid formats as hex digits and hyphens only, so it is safe to write into the statement.
        ? $"SET ROLE {TenantRole}; SELECT set_config('app.tenant_id', '{id:D}', false);"
        : "RESET ROLE; SELECT set_config('app.tenant_id', '', false);";
}
