using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.AppReleases;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>
/// The Android app asks on start-up whether it must be updated. Open to everyone (the sign-in screen
/// asks too) and to frozen businesses (see SubscriptionGateMiddleware).
/// </summary>
[ApiController]
[Route("api/v1/app")]
[AllowAnonymous]
public sealed class AppVersionController(AppReleaseService service) : ControllerBase
{
    /// <summary>GET api/v1/app/version?platform=android&amp;current=1.0.0</summary>
    [HttpGet("version")]
    public Task<AppVersionCheckDto> Check([FromQuery] string? platform, [FromQuery] string? current, CancellationToken ct) =>
        service.CheckAsync(platform, current, ct);
}

/// <summary>The super admin's list of app versions, each a minor (offered) or major (required) update.</summary>
[ApiController]
[Route("api/v1/platform/app-releases")]
[Authorize(Roles = Roles.SuperAdmin)]
public sealed class PlatformAppReleasesController(AppReleaseService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<AppReleaseDto>> List(CancellationToken ct) => service.ListAsync(ct);

    [HttpPost]
    public Task<AppReleaseDto> Create(AppReleaseRequest r, CancellationToken ct) => service.SaveAsync(null, r, ct);

    [HttpPut("{id:guid}")]
    public Task<AppReleaseDto> Update(Guid id, AppReleaseRequest r, CancellationToken ct) => service.SaveAsync(id, r, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }
}
