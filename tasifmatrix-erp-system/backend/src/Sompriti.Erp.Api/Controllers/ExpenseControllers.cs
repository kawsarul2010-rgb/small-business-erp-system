using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Expenses;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>
/// The expense book. Admins and managers record expenses; only an admin corrects or voids one.
/// A manager sees the expenses they recorded themselves (enforced in ExpenseService).
/// </summary>
[ApiController]
[Route("api/v1/expenses")]
[Authorize(Roles = Roles.AdminOrManager)]
public sealed class ExpensesController(ExpenseService service) : ControllerBase
{
    [HttpGet]
    public Task<ExpensePage> List([FromQuery] ExpenseQuery q, CancellationToken ct) => service.ListAsync(q, ct);

    [HttpGet("{id:guid}")]
    public Task<ExpenseDto> Get(Guid id, CancellationToken ct) => service.GetAsync(id, ct);

    [HttpPost]
    public async Task<ActionResult<ExpenseDto>> Create(ExpenseSaveRequest r, CancellationToken ct)
    {
        var dto = await service.CreateAsync(r, ct);
        return CreatedAtAction(nameof(Get), new { id = dto.Uuid }, dto);
    }

    [HttpPut("{id:guid}"), Authorize(Roles = Roles.Admin)]
    public Task<ExpenseDto> Update(Guid id, ExpenseSaveRequest r, CancellationToken ct) => service.UpdateAsync(id, r, ct);

    [HttpPost("{id:guid}/void"), Authorize(Roles = Roles.Admin)]
    public Task<ExpenseDto> Void(Guid id, VoidExpenseRequest r, CancellationToken ct) => service.VoidAsync(id, r, ct);
}

[ApiController]
[Route("api/v1/expense-categories")]
[Authorize(Roles = Roles.AdminOrManager)]
public sealed class ExpenseCategoriesController(ExpenseService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<ExpenseCategoryDto>> List(CancellationToken ct) => service.CategoriesAsync(ct);

    [HttpPost, Authorize(Roles = Roles.Admin)]
    public Task<ExpenseCategoryDto> Create(ExpenseCategorySaveRequest r, CancellationToken ct) => service.CreateCategoryAsync(r, ct);

    [HttpPut("{id:guid}"), Authorize(Roles = Roles.Admin)]
    public Task<ExpenseCategoryDto> Update(Guid id, ExpenseCategorySaveRequest r, CancellationToken ct) => service.UpdateCategoryAsync(id, r, ct);

    [HttpDelete("{id:guid}"), Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] Guid revision, CancellationToken ct)
    {
        await service.DeleteCategoryAsync(id, revision, ct);
        return NoContent();
    }
}
