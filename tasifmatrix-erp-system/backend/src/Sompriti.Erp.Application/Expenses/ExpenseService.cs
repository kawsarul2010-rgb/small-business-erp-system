using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Expenses;

// ---------------------------------------------------------------------- contracts

public sealed record ExpenseCategoryDto(Guid Uuid, string CategoryName, Guid Revision);

public sealed record ExpenseCategorySaveRequest(string? CategoryName, Guid? Revision);

public sealed record ExpenseDto(
    Guid Uuid, string ExpenseNumber, DateOnly ExpenseDate, Guid CategoryUuid, string CategoryName, decimal Amount,
    string? PaidTo, PaymentMethod PaymentMethod, string? Note, bool IsVoid, string? VoidReason,
    DateTimeOffset? VoidedDate, string? VoidedByUserName, DateTimeOffset CreatedDate, string CreatedByUserName, Guid Revision);

public sealed record ExpenseSaveRequest(
    DateOnly? ExpenseDate, Guid? CategoryUuid, decimal? Amount, string? PaidTo, PaymentMethod? PaymentMethod, string? Note, Guid? Revision);

public sealed record VoidExpenseRequest(Guid Revision, string? VoidReason);

public sealed record ExpenseQuery : PageQuery
{
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public Guid? CategoryUuid { get; init; }
    /// <summary>Show voided expenses as well (struck through). They never count in the total.</summary>
    public bool IncludeVoid { get; init; }
}

/// <summary>One page of expenses, and what every matching expense adds up to (voided ones left out).</summary>
public sealed record ExpensePage(IReadOnlyList<ExpenseDto> Items, int Page, int PageSize, int TotalCount, decimal TotalAmount);

// ---------------------------------------------------------------------- service

/// <summary>
/// The expense book: what the business spends on running itself. An admin records, corrects and
/// voids expenses and keeps the category list; a manager records the day's expenses and sees the
/// ones they recorded - not salaries or anything else the owner entered.
/// </summary>
public sealed class ExpenseService(IAppDbContext db, ICurrentUser user, TimeProvider clock)
{
    private static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<ExpenseRow, object?>>> SortMap = new()
    {
        ["expenseDate"] = x => x.E.ExpenseDate,
        ["amount"] = x => x.E.Amount,
        ["expenseNumber"] = x => x.E.ExpenseNumber,
        ["categoryName"] = x => x.CategoryName,
    };

    public sealed class ExpenseRow
    {
        public Expense E { get; set; } = null!;
        public string CategoryName { get; set; } = "";
    }

    // ================================================================== categories

    public async Task<IReadOnlyList<ExpenseCategoryDto>> CategoriesAsync(CancellationToken ct) =>
        await db.ExpenseCategories.AsNoTracking()
            .Where(c => c.Status == RecordStatus.Active)
            .OrderBy(c => c.CategoryName)
            .Select(c => new ExpenseCategoryDto(c.Uuid, c.CategoryName, c.Revision))
            .ToListAsync(ct);

    public async Task<ExpenseCategoryDto> CreateCategoryAsync(ExpenseCategorySaveRequest r, CancellationToken ct)
    {
        var name = ValidateCategory(r);
        await EnsureUniqueAsync(name, null, ct);
        var c = new ExpenseCategory { Uuid = Guid.NewGuid(), CategoryName = name };
        db.ExpenseCategories.Add(c);
        await db.SaveChangesAsync(ct);
        return new ExpenseCategoryDto(c.Uuid, c.CategoryName, c.Revision);
    }

    public async Task<ExpenseCategoryDto> UpdateCategoryAsync(Guid id, ExpenseCategorySaveRequest r, CancellationToken ct)
    {
        var name = ValidateCategory(r);
        var c = (await db.ExpenseCategories.FirstOrDefaultAsync(x => x.Uuid == id && x.Status == RecordStatus.Active, ct)).OrNotFound("Expense category");
        RevisionGuard.Check(db, c, r.Revision ?? Guid.Empty);
        await EnsureUniqueAsync(name, id, ct);
        c.CategoryName = name;
        await db.SaveChangesAsync(ct);
        return new ExpenseCategoryDto(c.Uuid, c.CategoryName, c.Revision);
    }

    /// <summary>Removes a category from the list. Expenses already recorded under it keep it.</summary>
    public async Task DeleteCategoryAsync(Guid id, Guid revision, CancellationToken ct)
    {
        var c = (await db.ExpenseCategories.FirstOrDefaultAsync(x => x.Uuid == id && x.Status == RecordStatus.Active, ct)).OrNotFound("Expense category");
        RevisionGuard.Check(db, c, revision);
        if (!await db.ExpenseCategories.AnyAsync(x => x.Uuid != id && x.Status == RecordStatus.Active, ct))
            throw DomainException.Rule(ErrorCodes.BusinessRule, "Keep at least one expense category.");
        c.Status = RecordStatus.Deleted;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>The default categories for a business being created (its sign-up or the super admin).</summary>
    public static IEnumerable<ExpenseCategory> DefaultCategories(Guid tenantUuid) =>
        ExpenseDefaults.Categories.Select(name => new ExpenseCategory { Uuid = Guid.NewGuid(), TenantUuid = tenantUuid, CategoryName = name });

    private static string ValidateCategory(ExpenseCategorySaveRequest r)
    {
        new Validator().Required("categoryName", r.CategoryName, "Category name", 100).ThrowIfInvalid();
        return r.CategoryName!.Trim();
    }

    private async Task EnsureUniqueAsync(string name, Guid? except, CancellationToken ct)
    {
        var lower = name.ToLower();
        if (await db.ExpenseCategories.AnyAsync(x => x.Status == RecordStatus.Active && x.CategoryName.ToLower() == lower && x.Uuid != except, ct))
            throw DomainException.Conflict(ErrorCodes.DuplicateCode, $"There is already a category named '{name}'.");
    }

    // ================================================================== expenses: reads

    /// <summary>Expenses the current user may see, with their category's name.</summary>
    private IQueryable<ExpenseRow> Visible()
    {
        if (user.Role is not (Role.Admin or Role.Manager)) throw DomainException.Forbidden();
        var expenses = db.Expenses.AsNoTracking();
        // A manager sees what they recorded themselves: salaries and the owner's costs stay private.
        if (user.Role == Role.Manager) expenses = expenses.Where(e => e.CreatedByUserUuid == user.UserUuid);
        return from e in expenses
               join c in db.ExpenseCategories.AsNoTracking() on e.CategoryUuid equals c.Uuid
               select new ExpenseRow { E = e, CategoryName = c.CategoryName };
    }

    /// <summary>The expenses matching the filters, newest first unless sorted otherwise.</summary>
    public IQueryable<ExpenseRow> Filtered(ExpenseQuery q)
    {
        var rows = Visible();
        if (!q.IncludeVoid) rows = rows.Where(x => x.E.VoidedDate == null);
        if (q.FromDate is { } f) rows = rows.Where(x => x.E.ExpenseDate >= f);
        if (q.ToDate is { } t) rows = rows.Where(x => x.E.ExpenseDate <= t);
        if (q.CategoryUuid is { } c) rows = rows.Where(x => x.E.CategoryUuid == c);
        if (q.Term is { } term)
        {
            var s = term.ToLower();
            rows = rows.Where(x => x.E.ExpenseNumber!.Contains(s)
                                   || (x.E.PaidTo != null && x.E.PaidTo.ToLower().Contains(s))
                                   || (x.E.Note != null && x.E.Note.ToLower().Contains(s))
                                   || x.CategoryName.ToLower().Contains(s));
        }
        return rows.ApplySort(q.Sort, SortMap, r => r.OrderByDescending(x => x.E.ExpenseDate).ThenByDescending(x => x.E.CreatedDate));
    }

    public async Task<ExpensePage> ListAsync(ExpenseQuery q, CancellationToken ct)
    {
        var rows = Filtered(q);
        var total = await rows.Where(x => x.E.VoidedDate == null).SumAsync(x => (decimal?)x.E.Amount, ct) ?? 0;
        var page = await rows.ToPagedAsync(q, x => x, ct);
        return new ExpensePage(page.Items.Select(ToDto).ToList(), page.Page, page.PageSize, page.TotalCount, total);
    }

    public async Task<ExpenseDto> GetAsync(Guid id, CancellationToken ct)
    {
        var row = await Visible().FirstOrDefaultAsync(x => x.E.Uuid == id, ct);
        return ToDto(row.OrNotFound("Expense"));
    }

    public static ExpenseDto ToDto(ExpenseRow x) => new(x.E.Uuid, x.E.ExpenseNumber ?? "", x.E.ExpenseDate, x.E.CategoryUuid, x.CategoryName,
        x.E.Amount, x.E.PaidTo, x.E.PaymentMethod, x.E.Note, x.E.VoidedDate is not null, x.E.VoidReason, x.E.VoidedDate,
        x.E.VoidedByUserName, x.E.CreatedDate, x.E.CreatedByUserName, x.E.Revision);

    // ================================================================== expenses: commands

    public async Task<ExpenseDto> CreateAsync(ExpenseSaveRequest r, CancellationToken ct)
    {
        Validate(r);
        await EnsureCategoryAsync(r.CategoryUuid!.Value, current: null, ct);
        var e = new Expense { Uuid = Guid.NewGuid() };
        Apply(e, r);
        db.Expenses.Add(e);
        await db.SaveChangesAsync(ct); // numbers it
        return await GetAsync(e.Uuid, ct);
    }

    public async Task<ExpenseDto> UpdateAsync(Guid id, ExpenseSaveRequest r, CancellationToken ct)
    {
        Validate(r);
        var e = (await db.Expenses.FirstOrDefaultAsync(x => x.Uuid == id, ct)).OrNotFound("Expense");
        RevisionGuard.Check(db, e, r.Revision ?? Guid.Empty);
        if (e.IsVoid) throw DomainException.Rule(ErrorCodes.BusinessRule, "A voided expense cannot be changed.");
        await EnsureCategoryAsync(r.CategoryUuid!.Value, current: e.CategoryUuid, ct);
        Apply(e, r);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Cancels an expense recorded by mistake. It stays in the book, marked void, and no longer counts.</summary>
    public async Task<ExpenseDto> VoidAsync(Guid id, VoidExpenseRequest r, CancellationToken ct)
    {
        new Validator().Required("voidReason", r.VoidReason, "Void reason", 500).ThrowIfInvalid();
        var e = (await db.Expenses.FirstOrDefaultAsync(x => x.Uuid == id, ct)).OrNotFound("Expense");
        RevisionGuard.Check(db, e, r.Revision);
        if (e.IsVoid) throw DomainException.Rule(ErrorCodes.BusinessRule, "This expense is already voided.");
        e.VoidedDate = clock.GetUtcNow();
        e.VoidedByUserUuid = user.UserUuid;
        e.VoidedByUserName = user.UserName;
        e.VoidReason = r.VoidReason!.Trim();
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private static void Validate(ExpenseSaveRequest r)
    {
        var v = new Validator().Required("categoryUuid", r.CategoryUuid, "Category");
        v.When(r.Amount is null, "amount", "Amount is required.");
        v.When(r.Amount is <= 0, "amount", "Amount must be greater than 0.");
        v.When(r.Amount is > 999_999_999_999m, "amount", "Amount is too large.");
        v.When(r.PaymentMethod is null, "paymentMethod", "Payment method is required.");
        v.MaxLength("paidTo", r.PaidTo, "Paid to", 150);
        v.MaxLength("note", r.Note, "Note", 500);
        v.ThrowIfInvalid();
    }

    /// <summary>A new or changed category must be on the list; an expense may keep one removed since.</summary>
    private async Task EnsureCategoryAsync(Guid categoryUuid, Guid? current, CancellationToken ct)
    {
        if (categoryUuid == current) return;
        if (!await db.ExpenseCategories.AnyAsync(c => c.Uuid == categoryUuid && c.Status == RecordStatus.Active, ct))
            throw DomainException.Validation("categoryUuid", "Choose a category from the list.");
    }

    private void Apply(Expense e, ExpenseSaveRequest r)
    {
        e.ExpenseDate = r.ExpenseDate ?? BusinessClock.Today(clock.GetUtcNow());
        e.CategoryUuid = r.CategoryUuid!.Value;
        e.Amount = Money.Round(r.Amount!.Value);
        e.PaidTo = Validator.Clean(r.PaidTo);
        e.PaymentMethod = r.PaymentMethod!.Value;
        e.Note = Validator.Clean(r.Note);
    }
}
