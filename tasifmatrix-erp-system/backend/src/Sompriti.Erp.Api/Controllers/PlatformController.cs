using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.Platform;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>
/// The super admin's API: the businesses using the system and their admin accounts.
/// Business users can never reach it (role check here, and PlatformBoundaryMiddleware).
/// </summary>
[ApiController]
[Route("api/v1/platform")]
[Authorize(Roles = Roles.SuperAdmin)]
public sealed class PlatformController(PlatformService service) : ControllerBase
{
    [HttpGet("summary")]
    public Task<PlatformSummaryDto> Summary(CancellationToken ct) => service.SummaryAsync(ct);

    [HttpGet("businesses")]
    public Task<PagedResult<BusinessListItemDto>> List([FromQuery] BusinessListQuery q, CancellationToken ct) => service.ListAsync(q, ct);

    [HttpGet("businesses/{id:guid}")]
    public Task<BusinessDetailDto> Get(Guid id, CancellationToken ct) => service.GetAsync(id, ct);

    /// <summary>Sent SMS per month for billing the business, newest month first.</summary>
    [HttpGet("businesses/{id:guid}/sms-usage")]
    public Task<BusinessSmsUsageDto> SmsUsage(Guid id, [FromQuery] int months = 12, CancellationToken ct = default) =>
        service.SmsUsageAsync(id, months, ct);

    /// <summary>Creates the business and its first admin. The response carries the admin's temporary password, once.</summary>
    [HttpPost("businesses")]
    public async Task<ActionResult<CreatedBusinessDto>> Create(CreateBusinessRequest r, CancellationToken ct)
    {
        var created = await service.CreateAsync(r, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Business.Uuid }, created);
    }

    [HttpPut("businesses/{id:guid}")]
    public Task<BusinessDetailDto> Update(Guid id, UpdateBusinessRequest r, CancellationToken ct) => service.UpdateAsync(id, r, ct);

    [HttpPost("businesses/{id:guid}/suspend")]
    public Task<BusinessDetailDto> Suspend(Guid id, SuspendBusinessRequest r, CancellationToken ct) => service.SuspendAsync(id, r, ct);

    [HttpPost("businesses/{id:guid}/activate")]
    public Task<BusinessDetailDto> Activate(Guid id, RevisionRequest r, CancellationToken ct) => service.ActivateAsync(id, r, ct);

    [HttpPost("businesses/{id:guid}/admins")]
    public Task<IssuedCredentialsDto> AddAdmin(Guid id, BusinessAdminRequest r, CancellationToken ct) => service.AddAdminAsync(id, r, ct);

    [HttpPost("businesses/{id:guid}/admins/{userId:guid}/reset-password")]
    public Task<IssuedCredentialsDto> ResetAdminPassword(Guid id, Guid userId, CancellationToken ct) =>
        service.ResetAdminPasswordAsync(id, userId, ct);
}
