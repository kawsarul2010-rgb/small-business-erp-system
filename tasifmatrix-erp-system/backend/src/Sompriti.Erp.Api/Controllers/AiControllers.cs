using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Ai;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>The AI features for a business's people. Whether AI is on, and the daily limit, are checked in AiAccess.</summary>
[ApiController]
[Route("api/v1/ai")]
[Authorize(Roles = "ADMIN,MANAGER,USER")]
public sealed class AiController(AiAccess access, HelpAssistantService help, BusinessAssistantService business, MemoScanService memo)
    : ControllerBase
{
    /// <summary>Whether to show the assistant, and how many questions are left today.</summary>
    [HttpGet("status")]
    public Task<AiStatusDto> Status(CancellationToken ct) => access.StatusAsync(ct);

    [HttpPost("help/ask"), EnableRateLimiting("ai")]
    public Task<HelpAnswerDto> AskHelp(HelpAskRequest r, CancellationToken ct) => help.AskAsync(r, ct);

    /// <summary>"Ask your business": answers from the business's own figures, read-only, within the asker's role.</summary>
    [HttpPost("business/ask"), Authorize(Roles = Roles.AdminOrManager), EnableRateLimiting("ai")]
    public Task<BusinessAnswerDto> AskBusiness(BusinessAskRequest r, CancellationToken ct) => business.AskAsync(r, ct);

    /// <summary>Reads a supplier memo photo into a draft purchase order. Nothing is saved; the photo is not kept.</summary>
    [HttpPost("memo/scan"), Authorize(Roles = "ADMIN"), EnableRateLimiting("ai"), RequestSizeLimit(8_000_000)]
    public Task<MemoScanDto> ScanMemo(MemoScanRequest r, CancellationToken ct) => memo.ScanAsync(r, ct);

    /// <summary>The scanned draft was saved: how many of its lines went in as read (the reader's accuracy).</summary>
    [HttpPost("memo/{id:guid}/outcome"), Authorize(Roles = "ADMIN")]
    public async Task<IActionResult> MemoOutcome(Guid id, MemoOutcomeRequest r, CancellationToken ct)
    {
        await access.RecordMemoOutcomeAsync(id, r, ct);
        return NoContent();
    }

    [HttpPost("answers/{id:guid}/rating")]
    public async Task<IActionResult> Rate(Guid id, AiRatingRequest r, CancellationToken ct)
    {
        await access.RateAsync(id, r, ct);
        return NoContent();
    }
}

/// <summary>The super admin's AI page.</summary>
[ApiController]
[Route("api/v1/platform/ai")]
[Authorize(Roles = Roles.SuperAdmin)]
public sealed class PlatformAiController(PlatformAiService service) : ControllerBase
{
    [HttpGet("settings")]
    public Task<AiSettingsDto> Settings(CancellationToken ct) => service.SettingsAsync(ct);

    [HttpPut("settings")]
    public Task<AiSettingsDto> SaveSettings(AiSettingsRequest r, CancellationToken ct) => service.SaveSettingsAsync(r, ct);

    [HttpGet("models")]
    public Task<IReadOnlyList<AiModelDto>> Models(CancellationToken ct) => service.ModelsAsync(ct);

    [HttpPost("test")]
    public Task<AiTestResultDto> Test(AiTestRequest r, CancellationToken ct) => service.TestAsync(r, ct);

    [HttpGet("businesses")]
    public Task<IReadOnlyList<AiBusinessDto>> Businesses(CancellationToken ct) => service.BusinessesAsync(ct);

    [HttpPut("businesses/{id:guid}")]
    public async Task<IActionResult> SetBusiness(Guid id, AiBusinessRequest r, CancellationToken ct)
    {
        await service.SetBusinessAsync(id, r, ct);
        return NoContent();
    }

    /// <summary>Runs the "Ask your business" eval questions with fixed test data (no business's data is used).</summary>
    [HttpPost("evals/business")]
    public Task<HelpEvalRunDto> RunBusinessEvals(AiTestRequest r, CancellationToken ct) => service.RunBusinessEvalsAsync(r, ct);

    /// <summary>Runs the help assistant's eval questions against the model (costs a few US cents).</summary>
    [HttpPost("evals/help")]
    public Task<HelpEvalRunDto> RunHelpEvals(AiTestRequest r, CancellationToken ct) => service.RunHelpEvalsAsync(r, ct);
}
