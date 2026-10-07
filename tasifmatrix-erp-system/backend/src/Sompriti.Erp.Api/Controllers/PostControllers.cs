using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Posts;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>
/// Posts from the super admin, as a business reads them. channel is "web" or "app": a post can be
/// meant for the website only or the Android app only. Open even when the subscription has run out.
/// </summary>
[ApiController]
[Route("api/v1/posts")]
[Authorize(Roles = "ADMIN,MANAGER,USER")]
public sealed class PostsController(PostService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<PostDto>> List([FromQuery] string? channel, CancellationToken ct) => service.ListAsync(channel, ct);

    [HttpGet("unread-count")]
    public async Task<object> UnreadCount([FromQuery] string? channel, CancellationToken ct) =>
        new { count = await service.UnreadCountAsync(channel, ct) };

    [HttpPost("seen")]
    public async Task<IActionResult> Seen(CancellationToken ct)
    {
        await service.MarkSeenAsync(ct);
        return NoContent();
    }
}

/// <summary>The super admin writes, publishes, pins and deletes posts.</summary>
[ApiController]
[Route("api/v1/platform/posts")]
[Authorize(Roles = Roles.SuperAdmin)]
public sealed class PlatformPostsController(PostService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<PlatformPostDto>> List(CancellationToken ct) => service.PlatformListAsync(ct);

    [HttpGet("businesses")]
    public Task<IReadOnlyList<PostBusinessDto>> Businesses(CancellationToken ct) => service.BusinessesAsync(ct);

    [HttpPost]
    public Task<PlatformPostDto> Create(PostRequest r, CancellationToken ct) => service.SaveAsync(null, r, ct);

    [HttpPut("{id:guid}")]
    public Task<PlatformPostDto> Update(Guid id, PostRequest r, CancellationToken ct) => service.SaveAsync(id, r, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }
}
