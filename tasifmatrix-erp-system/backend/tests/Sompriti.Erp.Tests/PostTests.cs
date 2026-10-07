using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Posts;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Tests;

public class PostRulesTests
{
    [Theory]
    [InlineData("app", PostChannel.App)]
    [InlineData(" APP ", PostChannel.App)]
    [InlineData("web", PostChannel.Web)]
    [InlineData(null, PostChannel.Web)]
    [InlineData("", PostChannel.Web)]
    [InlineData("something", PostChannel.Web)]
    public void Channel_defaults_to_the_website(string? channel, PostChannel expected) =>
        Assert.Equal(expected, PostRules.ChannelOf(channel));

    [Fact]
    public void Body_keeps_the_lines_but_not_the_ends()
    {
        Assert.Equal("Line one\nLine two\n\nLast", PostService.NormalizeBody("  Line one\r\nLine two\r\n\r\nLast \n"));
        Assert.Equal("a\nb", PostService.NormalizeBody("a\rb"));
    }
}

public class SubscriptionGateTests
{
    private static async Task<int> StatusFor(string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ErpClaims.SubscriptionFrozen, "true")], "test"));
        context.Response.Body = new MemoryStream();
        var gate = new SubscriptionGateMiddleware(_ => Task.CompletedTask);
        await gate.InvokeAsync(context);
        return context.Response.StatusCode;
    }

    [Theory]
    [InlineData("/api/v1/billing")]
    [InlineData("/api/v1/posts")]
    [InlineData("/api/v1/posts/unread-count")]
    [InlineData("/api/v1/auth/me")]
    public async Task A_frozen_business_can_still_reach_billing_and_posts(string path) =>
        Assert.Equal(200, await StatusFor(path));

    [Theory]
    [InlineData("/api/v1/sales-orders")]
    [InlineData("/api/v1/postsx")]
    public async Task Everything_else_answers_402(string path) =>
        Assert.Equal(402, await StatusFor(path));
}
