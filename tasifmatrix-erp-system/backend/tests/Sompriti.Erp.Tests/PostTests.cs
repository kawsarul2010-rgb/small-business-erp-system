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
    [InlineData("/api/v1/app/version")]
    public async Task A_frozen_business_can_still_reach_billing_and_posts(string path) =>
        Assert.Equal(200, await StatusFor(path));

    [Theory]
    [InlineData("/api/v1/sales-orders")]
    [InlineData("/api/v1/postsx")]
    public async Task Everything_else_answers_402(string path) =>
        Assert.Equal(402, await StatusFor(path));
}

public class AppUpdateRulesTests
{
    private static Sompriti.Erp.Domain.Entities.AppRelease R(string v, AppUpdateType t, bool published = true) =>
        new() { VersionName = v, UpdateType = t, IsPublished = published };

    [Theory]
    [InlineData("1.0.1", "1.0.0", 1)]
    [InlineData("1.10", "1.9.9", 1)]
    [InlineData("1.2", "1.2.0", 0)]
    [InlineData("2", "10", -1)]
    public void Versions_compare_by_number(string a, string b, int expected)
    {
        Assert.True(Sompriti.Erp.Domain.Rules.AppVersion.TryParse(a, out var x));
        Assert.True(Sompriti.Erp.Domain.Rules.AppVersion.TryParse(b, out var y));
        Assert.Equal(expected, Math.Sign(x.CompareTo(y)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("v1.0")]
    [InlineData("1..2")]
    [InlineData("1.0.0-beta")]
    [InlineData("1.2.3.4.5")]
    public void Odd_versions_are_refused(string text) => Assert.False(Sompriti.Erp.Domain.Rules.AppVersion.TryParse(text, out _));

    [Fact]
    public void Newer_minor_is_optional_and_newer_major_is_required()
    {
        var releases = new[] { R("1.0.0", AppUpdateType.Minor), R("1.0.1", AppUpdateType.Minor), R("1.1.0", AppUpdateType.Major), R("1.1.1", AppUpdateType.Minor) };
        var fromOld = Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("1.0.0", releases);
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.Required, fromOld.Advice); // 1.1.0 is major, even though 1.1.1 is minor
        Assert.Equal("1.1.1", fromOld.Latest!.VersionName);
        Assert.Equal("1.1.1,1.1.0,1.0.1", string.Join(",", fromOld.Newer.Select(r => r.VersionName)));

        var fromMajor = Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("1.1.0", releases);
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.Optional, fromMajor.Advice);
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.UpToDate, Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("1.1.1", releases).Advice);
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.UpToDate, Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("2.0", releases).Advice);
    }

    [Fact]
    public void Unpublished_releases_and_unreadable_versions_never_lock_anyone_out()
    {
        var releases = new[] { R("2.0.0", AppUpdateType.Major, published: false) };
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.UpToDate, Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("1.0.0", releases).Advice);
        Assert.Equal(Sompriti.Erp.Domain.Rules.AppUpdateAdvice.UpToDate,
            Sompriti.Erp.Domain.Rules.AppUpdateRules.Evaluate("garbage", [R("2.0.0", AppUpdateType.Major)]).Advice);
    }
}

public class SizeRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);
    private static readonly Sompriti.Erp.Domain.Rules.SizeLimit Small = new(Guid.NewGuid(), "Small", 1, true, 2000);
    private static readonly Sompriti.Erp.Domain.Rules.SizeLimit Medium = new(Guid.NewGuid(), "Medium", 2, true, 6000);
    private static readonly Sompriti.Erp.Domain.Rules.SizeLimit Large = new(Guid.NewGuid(), "Large", 3, true, null);
    private static readonly Sompriti.Erp.Domain.Rules.SizeLimit[] Sizes = [Small, Medium, Large];

    [Fact]
    public void Orders_are_averaged_over_three_months_or_the_business_age()
    {
        Assert.Equal(2000, Sompriti.Erp.Domain.Rules.SizeRules.OrdersPerMonth(6000, Now.AddYears(-1), Now));
        Assert.Equal(1500, Sompriti.Erp.Domain.Rules.SizeRules.OrdersPerMonth(3000, Now.AddDays(-60), Now)); // two months old
        Assert.Equal(900, Sompriti.Erp.Domain.Rules.SizeRules.OrdersPerMonth(900, Now.AddDays(-10), Now));   // counts as one month
    }

    [Fact]
    public void Within_the_limit_is_fine_and_above_it_suggests_the_size_that_fits()
    {
        Assert.False(Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(2000, Small.Uuid, Sizes).Outgrown);
        var medium = Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(2001, Small.Uuid, Sizes);
        Assert.True(medium.Outgrown);
        Assert.Equal("Medium", medium.Suggested!.Name);
        Assert.Equal("Large", Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(9000, Small.Uuid, Sizes).Suggested!.Name);
        Assert.False(Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(1_000_000, Large.Uuid, Sizes).Outgrown); // no limit
        Assert.False(Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(5000, null, Sizes).Outgrown);            // no size yet
    }

    [Fact]
    public void Inactive_sizes_are_never_suggested_and_the_largest_is_the_last_resort()
    {
        var sizes = new[] { Small, Medium with { IsActive = false }, Large with { MaxOrdersPerMonth = 8000 } };
        Assert.Equal("Large", Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(3000, Small.Uuid, sizes).Suggested!.Name);
        Assert.Equal("Large", Sompriti.Erp.Domain.Rules.SizeRules.Evaluate(50_000, Small.Uuid, sizes).Suggested!.Name);
    }
}
