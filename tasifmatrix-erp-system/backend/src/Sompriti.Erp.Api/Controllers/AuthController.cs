using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Sompriti.Erp.Application.Auth;

namespace Sompriti.Erp.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(AuthService auth, AccountDeletionService deletion) : ControllerBase
{
    [HttpPost("register"), AllowAnonymous, EnableRateLimiting("auth")]
    public Task<AuthResponse> Register(RegisterRequest request, CancellationToken ct) => auth.RegisterAsync(request, ct);

    /// <summary>Registers a new business with the caller as its admin, and signs them in.</summary>
    [HttpPost("register-business"), AllowAnonymous, EnableRateLimiting("signup")]
    public Task<AuthResponse> RegisterBusiness(RegisterBusinessRequest request, CancellationToken ct) =>
        auth.RegisterBusinessAsync(request, ct);

    /// <summary>What the sign-up page offers (whether businesses may register themselves).</summary>
    [HttpGet("signup-options"), AllowAnonymous]
    public Task<SignupOptionsDto> SignupOptions(CancellationToken ct) => auth.SignupOptionsAsync(ct);

    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("auth")]
    public Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) => auth.LoginAsync(request, ct);

    [HttpPost("refresh"), AllowAnonymous, EnableRateLimiting("refresh")]
    public Task<AuthResponse> Refresh(RefreshRequest request, CancellationToken ct) => auth.RefreshAsync(request, ct);

    [HttpPost("logout"), AllowAnonymous]
    public async Task<IActionResult> Logout(RefreshRequest request, CancellationToken ct)
    {
        await auth.LogoutAsync(request, ct);
        return NoContent();
    }

    [HttpPost("forgot-password"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        await auth.ForgotPasswordAsync(request, ct);
        return Ok(new { message = "If an account exists for this email, a password reset link has been sent." });
    }

    [HttpPost("reset-password"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return Ok(new { message = "Your password has been reset. You can now log in." });
    }

    [HttpGet("me"), Authorize]
    public Task<CurrentUserDto> Me(CancellationToken ct) => auth.MeAsync(ct);

    /// <summary>What deleting the signed-in account involves (whether it closes the business).</summary>
    [HttpGet("delete-account"), Authorize]
    public Task<AccountDeletionInfoDto> DeletionInfo(CancellationToken ct) => deletion.InfoAsync(ct);

    /// <summary>Deletes the signed-in account (or closes the business, for its only admin). Open while frozen.</summary>
    [HttpPost("delete-account"), Authorize, EnableRateLimiting("auth")]
    public async Task<IActionResult> DeleteAccount(DeleteAccountRequest request, CancellationToken ct)
    {
        await deletion.DeleteAsync(request, ct);
        return NoContent();
    }

    [HttpPost("change-password"), Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(request, ct);
        return Ok(new { message = "Password changed. Please log in again." });
    }
}
