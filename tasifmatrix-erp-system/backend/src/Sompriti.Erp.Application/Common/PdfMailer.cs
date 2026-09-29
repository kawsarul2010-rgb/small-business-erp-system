using System.Net;
using Sompriti.Erp.Domain.Common;

namespace Sompriti.Erp.Application.Common;

/// <summary>What the user typed into the share dialog. Only the recipient is required.</summary>
public sealed record EmailPdfRequest(string? To, string? ToName, string? Subject, string? Message);

/// <summary>
/// Emails a generated PDF as a real attachment.
///
/// This exists because a browser cannot attach a file to an email for the user - a mailto: link
/// carries text only. Sending from the server is the one path on a desktop that actually delivers
/// the document, so orders and reports both route through here.
/// </summary>
public sealed class PdfMailer(IEmailSender email, IBusinessProfile business, ICurrentUser currentUser)
{
    /// <param name="description">
    /// One line naming the document, e.g. "Sales invoice 100042". Also the default subject,
    /// prefixed with the business name, when the user left the subject empty.
    /// </param>
    public async Task SendAsync(EmailPdfRequest request, string description,
        string fileName, byte[] pdf, CancellationToken ct)
    {
        var to = Validator.Clean(request.To);
        new Validator()
            .Required("to", to, "Recipient email", 200)
            .When(to is not null && !Validator.IsEmail(to), "to", "Recipient email is not valid.")
            .MaxLength("subject", request.Subject, "Subject", 200)
            .MaxLength("message", request.Message, "Message", 2000)
            .ThrowIfInvalid();

        // Fail before the user is told it was sent, rather than logging into a void.
        if (!email.Enabled)
            throw DomainException.Rule(ErrorCodes.BusinessRule,
                "Email sending is not set up on the server, so the PDF cannot be emailed from here. " +
                "An administrator needs to set Email:Provider (Brevo or Resend) and Email:ApiKey. " +
                "You can still download the PDF and attach it yourself.");

        // The business's own name, so its customers see who the invoice is from - not the software.
        var businessName = await business.NameAsync(ct);
        var subject = Validator.Clean(request.Subject) ?? $"{businessName}: {description}";
        var toName = Validator.Clean(request.ToName) ?? to!;
        var body = Body(businessName, description, Validator.Clean(request.Message));

        await email.SendAsync(to!, toName, subject, body,
            [new EmailAttachment(fileName, "application/pdf", pdf)], ct);
    }

    private string Body(string businessName, string description, string? message)
    {
        var business = WebUtility.HtmlEncode(businessName);
        var sender = WebUtility.HtmlEncode(currentUser.IsAuthenticated ? currentUser.UserName : "the system");
        var note = message is null
            ? ""
            // The user's own words, so newlines are kept as line breaks.
            : $"<p style=\"white-space:pre-wrap\">{WebUtility.HtmlEncode(message)}</p>";

        return $"""
            {note}<p>{WebUtility.HtmlEncode(description)} is attached to this email as a PDF.</p>
            <p style="color:#666;font-size:13px">Sent from {business} by {sender}.</p>
            """;
    }
}
