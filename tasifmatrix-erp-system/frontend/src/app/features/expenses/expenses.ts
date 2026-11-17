import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { tap } from 'rxjs';
import { ApiService, dateToIso, errorMessage, isoToDate } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { Expense, ExpenseCategory, ExpensePage, PaymentMethod } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { LabelPipe, MoneyPipe } from '../../shared/pipes';
import { ReportExport } from '../../shared/report-export';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_BANKING', label: 'Mobile banking (bKash, Nagad...)' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

/** The first and last day of the current month: the expense book opens on this month. */
function thisMonth(): [Date, Date] {
  const now = new Date();
  return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)];
}

/**
 * The expense book: salary, rent, transport, bills - what the business spends on running itself.
 * Managers record the day's expenses and see their own; an admin sees all, corrects and voids.
 */
@Component({
  selector: 'app-expenses',
  imports: [TranslatePipe, DatePipe, ReactiveFormsModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatCheckboxModule, MatProgressBarModule, MatTooltipModule,
    ListFooter, LabelPipe, MoneyPipe, ReportExport],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Expenses' | t }}</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">{{ (auth.isAdmin()
              ? 'Salary, rent, transport, bills - what the business spends on running itself. Stock bought for sale is a purchase order, not an expense.'
              : 'Record the day\\'s expenses here. You see the expenses you recorded.') | t }}</div>
          }
        </div>
        <div class="actions">
          <app-report-export path="/reports/expenses/pdf" [filters]="pdfFilters()" [label]="'Expense report' | t" />
          @if (auth.isAdmin()) {
            @if (layout.isHandset()) {
              <button mat-icon-button (click)="manageCategories()" [attr.aria-label]="'Categories' | t"><mat-icon>category</mat-icon></button>
            } @else {
              <button mat-stroked-button (click)="manageCategories()"><mat-icon>category</mat-icon>{{ 'Categories' | t }}</button>
            }
          }
          @if (!layout.isHandset()) {
            <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon>{{ 'Add expense' | t }}</button>
          }
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'Search paid to, note or number' | t }}</mat-label>
            <input matInput (input)="list.search($any($event.target).value)" />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'Date' | t }}</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate [formControl]="from" [placeholder]="'From' | t" />
              <input matEndDate [formControl]="to" [placeholder]="'To' | t" (dateChange)="filtersChanged()" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'Category' | t }}</mat-label>
            <mat-select [formControl]="category" (selectionChange)="filtersChanged()">
              <mat-option [value]="null">{{ 'All categories' | t }}</mat-option>
              @for (c of categories(); track c.uuid) { <mat-option [value]="c.uuid">{{ c.categoryName | t }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-checkbox [formControl]="showVoid" (change)="filtersChanged()">{{ 'Show voided' | t }}</mat-checkbox>
          <button mat-button (click)="allDates()">{{ 'All dates' | t }}</button>
        </div>

        <div class="summary">
          <span class="muted">{{ '{n} expense(s)' | t: { n: list.total() } }}</span>
          <span class="total">{{ 'Total' | t }}: <strong>{{ totalAmount() | money }}</strong></span>
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (e of list.items(); track e.uuid) {
              <div class="m-card" [class.void]="e.isVoid">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ e.categoryName | t }}</div>
                    <div class="m-sub">#{{ e.expenseNumber }} · {{ e.expenseDate | date: 'dd MMM yyyy' }} · {{ e.paymentMethod | label }}</div>
                  </div>
                  <div class="m-right">
                    <span class="m-amount amount">{{ e.amount | money }}</span>
                    @if (e.isVoid) { <span class="chip-void">{{ 'Void' | t }}</span> }
                  </div>
                </div>
                @if (e.paidTo || e.note) { <div class="m-sub note">{{ e.paidTo }}@if (e.paidTo && e.note) { · }{{ e.note }}</div> }
                @if (e.isVoid && e.voidReason) { <div class="m-sub note negative">{{ 'Voided: {reason}' | t: { reason: e.voidReason } }}</div> }
                @if (auth.isAdmin() && !e.isVoid) {
                  <div class="card-actions">
                    <button mat-button (click)="edit(e)"><mat-icon>edit</mat-icon>{{ 'Edit' | t }}</button>
                    <button mat-button class="danger-text" (click)="voidExpense(e)"><mat-icon>block</mat-icon>{{ 'Void' | t }}</button>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
              <ng-container matColumnDef="expenseNumber"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'No.' | t }}</th><td mat-cell *matCellDef="let e" class="code">{{ e.expenseNumber }}</td></ng-container>
              <ng-container matColumnDef="expenseDate"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Date' | t }}</th><td mat-cell *matCellDef="let e" class="nowrap">{{ e.expenseDate | date: 'dd MMM yyyy' }}</td></ng-container>
              <ng-container matColumnDef="categoryName"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Category' | t }}</th><td mat-cell *matCellDef="let e">{{ e.categoryName | t }}</td></ng-container>
              <ng-container matColumnDef="paidTo"><th mat-header-cell *matHeaderCellDef>{{ 'Paid to / note' | t }}</th>
                <td mat-cell *matCellDef="let e">{{ e.paidTo }}@if (e.note) { <div class="muted">{{ e.note }}</div> }@if (e.isVoid) { <div class="negative small">{{ 'Voided: {reason}' | t: { reason: e.voidReason } }}</div> }</td></ng-container>
              <ng-container matColumnDef="method"><th mat-header-cell *matHeaderCellDef>{{ 'Method' | t }}</th><td mat-cell *matCellDef="let e" class="nowrap">{{ e.paymentMethod | label }}</td></ng-container>
              <ng-container matColumnDef="amount"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Amount' | t }}</th><td mat-cell *matCellDef="let e" class="num nowrap amount"><strong>{{ e.amount | money }}</strong></td></ng-container>
              <ng-container matColumnDef="by"><th mat-header-cell *matHeaderCellDef>{{ 'By' | t }}</th><td mat-cell *matCellDef="let e" class="muted">{{ e.createdByUserName }}</td></ng-container>
              <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let e" class="num nowrap">
                  @if (e.isVoid) { <span class="chip-void">{{ 'Void' | t }}</span> }
                  @else if (auth.isAdmin()) {
                    <button mat-icon-button [matTooltip]="'Edit' | t" (click)="edit(e)"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button [matTooltip]="'Void' | t" (click)="voidExpense(e)"><mat-icon>block</mat-icon></button>
                  }
                </td></ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns" [class.void]="row.isVoid"></tr>
            </table>
          </div>
        }

        @if (!list.loading() && list.items().length === 0) { <div class="empty">{{ (list.error() ?? 'No expenses for these filters.') | t }}</div> }
        <app-list-footer [list]="list" />
      </div>

      @if (layout.isHandset()) {
        <button mat-fab class="fab" [attr.aria-label]="'Add expense' | t" (click)="create()"><mat-icon>add</mat-icon></button>
      }
    </div>
  `,
  styles: `
    .summary { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 16px 10px; flex-wrap: wrap; }
    .summary .total { font-size: 15px; }
    .note { margin-top: 6px; }
    .small { font-size: 12px; }
    .card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 6px; }
    .danger-text { color: var(--erp-chip-danger-fg); }
    .chip-void { font-size: 11px; font-weight: 600; color: var(--erp-chip-danger-fg); background: var(--erp-chip-danger-bg); border-radius: 999px; padding: 2px 8px; }
    .void .amount, tr.void .amount { text-decoration: line-through; opacity: .6; }
  `,
})
export class ExpensesPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly from = new FormControl<Date | null>(thisMonth()[0]);
  readonly to = new FormControl<Date | null>(thisMonth()[1]);
  readonly category = new FormControl<string | null>(null);
  readonly showVoid = new FormControl(false, { nonNullable: true });
  readonly categories = signal<ExpenseCategory[]>([]);
  readonly totalAmount = signal(0);
  /** Bumped whenever a filter outside the list's own query changes, so the print filters follow. */
  private readonly filterVersion = signal(0);

  readonly columns = ['expenseNumber', 'expenseDate', 'categoryName', 'paidTo', 'method', 'amount', 'by', 'actions'];
  readonly list = new ListState<Expense>((q) =>
    this.api.get<ExpensePage>('/expenses', { ...q, ...this.filters() }).pipe(tap((p) => this.totalAmount.set(p.totalAmount))));

  /** The printed report covers every expense matching the filters on screen (voided ones are never printed). */
  readonly pdfFilters = computed(() => {
    this.filterVersion();
    const q = this.list.query();
    const { includeVoid, ...rest } = this.filters();
    void includeVoid;
    return { ...rest, search: q.search || null, sort: q.sort || null };
  });

  ngOnInit(): void {
    this.loadCategories();
    this.list.reload();
  }

  private filters() {
    return {
      fromDate: dateToIso(this.from.value),
      toDate: dateToIso(this.to.value),
      categoryUuid: this.category.value,
      includeVoid: this.showVoid.value,
    };
  }

  filtersChanged(): void {
    this.filterVersion.update((v) => v + 1);
    this.list.resetToFirstPage();
  }

  allDates(): void {
    this.from.setValue(null);
    this.to.setValue(null);
    this.filtersChanged();
  }

  loadCategories(): void {
    this.api.get<ExpenseCategory[]>('/expense-categories').subscribe({ next: (c) => this.categories.set(c), error: (e) => this.notify.error(e) });
  }

  create(): void {
    this.openEditor(null);
  }

  edit(e: Expense): void {
    this.openEditor(e);
  }

  private openEditor(expense: Expense | null): void {
    this.dialog.open(ExpenseDialog, this.layout.dialog({ expense, categories: this.categories() }, '560px'))
      .afterClosed().subscribe((changed) => changed && this.list.reload());
  }

  voidExpense(e: Expense): void {
    this.dialog.open(VoidExpenseDialog, this.layout.dialog(e, '480px')).afterClosed().subscribe((reason?: string) => {
      if (!reason) return;
      this.api.post<Expense>(`/expenses/${e.uuid}/void`, { revision: e.revision, voidReason: reason }).subscribe({
        next: () => { this.notify.success('Expense #{no} voided.', { no: e.expenseNumber }); this.list.reload(); },
        error: (err) => { this.notify.error(err); this.list.reload(); },
      });
    });
  }

  manageCategories(): void {
    this.dialog.open(CategoriesDialog, this.layout.dialog(null, '520px')).afterClosed().subscribe(() => this.loadCategories());
  }
}

// ---------------------------------------------------------------------- add / edit

@Component({
  selector: 'app-expense-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{ (data.expense ? 'Edit expense #{no}' : 'Add expense') | t: { no: data.expense?.expenseNumber } }}</h2>
    <form [formGroup]="form" (ngSubmit)="save(false)">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'Amount (Tk)' | t }}</mat-label>
            <input matInput type="number" inputmode="decimal" min="0" step="0.01" formControlName="amount" cdkFocusInitial />
            <mat-error>{{ err('amount', 'Amount') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Category' | t }}</mat-label>
            <mat-select formControlName="categoryUuid">
              @for (c of categories; track c.uuid) { <mat-option [value]="c.uuid">{{ c.categoryName | t }}</mat-option> }
            </mat-select>
            <mat-error>{{ err('categoryUuid', 'Category') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Date' | t }}</mat-label>
            <input matInput [matDatepicker]="dp" formControlName="expenseDate" />
            <mat-datepicker-toggle matIconSuffix [for]="dp" /><mat-datepicker #dp />
            <mat-error>{{ err('expenseDate', 'Date') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Paid by' | t }}</mat-label>
            <mat-select formControlName="paymentMethod">
              @for (m of methods; track m.value) { <mat-option [value]="m.value">{{ m.label | t }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'Paid to (optional)' | t }}</mat-label>
            <input matInput formControlName="paidTo" [placeholder]="'e.g. employee name, landlord, DESCO' | t" />
            <mat-error>{{ err('paidTo', 'Paid to') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'Note (optional)' | t }}</mat-label>
            <textarea matInput rows="2" formControlName="note"></textarea>
            <mat-error>{{ err('note', 'Note') }}</mat-error>
          </mat-form-field>
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(savedAny)">{{ 'Cancel' | t }}</button>
        @if (!data.expense) {
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="save(true)">{{ 'Save and add another' | t }}</button>
        }
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ExpenseDialog {
  readonly data = inject<{ expense: Expense | null; categories: ExpenseCategory[] }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ExpenseDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly methods = METHODS;
  /** True once anything was saved, so the list reloads however the dialog closes. */
  savedAny = false;

  /** An expense may keep a category removed from the list since; it is offered alongside the others. */
  readonly categories: ExpenseCategory[] = (() => {
    const e = this.data.expense;
    const list = this.data.categories;
    return e && !list.some((c) => c.uuid === e.categoryUuid)
      ? [...list, { uuid: e.categoryUuid, categoryName: e.categoryName, revision: '' }]
      : list;
  })();

  readonly form = inject(FormBuilder).group({
    amount: [this.data.expense?.amount ?? (null as number | null), [Validators.required, Validators.min(0.01)]],
    categoryUuid: [this.data.expense?.categoryUuid ?? (null as string | null), Validators.required],
    expenseDate: [this.data.expense ? isoToDate(this.data.expense.expenseDate) : (new Date() as Date | null), Validators.required],
    paymentMethod: [this.data.expense?.paymentMethod ?? ('CASH' as PaymentMethod), Validators.required],
    paidTo: [this.data.expense?.paidTo ?? '', Validators.maxLength(150)],
    note: [this.data.expense?.note ?? '', Validators.maxLength(500)],
  });

  constructor() {
    this.ref.backdropClick().subscribe(() => this.ref.close(this.savedAny));
  }

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(another: boolean): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { ...v, expenseDate: dateToIso(v.expenseDate), revision: this.data.expense?.revision };
    const req = this.data.expense
      ? this.api.put<Expense>(`/expenses/${this.data.expense.uuid}`, body)
      : this.api.post<Expense>('/expenses', body);
    this.busy.set(true);
    this.error.set(null);
    req.subscribe({
      next: (e) => {
        this.savedAny = true;
        this.busy.set(false);
        this.notify.success(this.data.expense ? 'Expense #{no} saved.' : 'Expense #{no} added.', { no: e.expenseNumber });
        if (!another) { this.ref.close(true); return; }
        // Same day, category and method are the usual next entry; the amount and who are not.
        this.form.patchValue({ amount: null, paidTo: '', note: '' });
        this.form.markAsUntouched();
      },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ---------------------------------------------------------------------- void

@Component({
  selector: 'app-void-expense-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ 'Void expense #{no}' | t: { no: data.expenseNumber } }}</h2>
    <mat-dialog-content>
      <p>{{ 'The expense stays in the book, marked VOID, and no longer counts in totals or profit. This cannot be undone.' | t }}</p>
      <mat-form-field class="full-width">
        <mat-label>{{ 'Reason' | t }}</mat-label>
        <textarea matInput rows="3" [formControl]="reason" cdkFocusInitial></textarea>
        <mat-error>{{ 'A reason is required.' | t }}</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | t }}</button>
      <button mat-flat-button class="danger" (click)="confirm()">{{ 'Void expense' | t }}</button>
    </mat-dialog-actions>
  `,
})
export class VoidExpenseDialog {
  readonly data = inject<Expense>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<VoidExpenseDialog>);
  readonly reason = inject(FormBuilder).control('', [Validators.required, Validators.maxLength(500)]);

  confirm(): void {
    if (this.reason.invalid || !this.reason.value?.trim()) { this.reason.markAsTouched(); return; }
    this.ref.close(this.reason.value.trim());
  }
}

// ---------------------------------------------------------------------- categories

@Component({
  selector: 'app-expense-categories-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <h2 mat-dialog-title>{{ 'Expense categories' | t }}</h2>
    <mat-dialog-content>
      <form class="add-row" (ngSubmit)="add()">
        <mat-form-field subscriptSizing="dynamic" class="grow">
          <mat-label>{{ 'New category' | t }}</mat-label>
          <input matInput [formControl]="newName" [placeholder]="'e.g. Advertising' | t" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()"><mat-icon>add</mat-icon>{{ 'Add' | t }}</button>
      </form>
      @if (error()) { <p class="negative">{{ error() | t }}</p> }
      <div class="rows">
        @for (c of categories(); track c.uuid) {
          <div class="row">
            @if (editing() === c.uuid) {
              <mat-form-field subscriptSizing="dynamic" class="grow">
                <input matInput [formControl]="editName" (keydown.enter)="rename(c)" (keydown.escape)="editing.set(null)" />
              </mat-form-field>
              <button mat-icon-button [matTooltip]="'Save' | t" (click)="rename(c)"><mat-icon>check_circle</mat-icon></button>
              <button mat-icon-button [matTooltip]="'Cancel' | t" (click)="editing.set(null)"><mat-icon>close</mat-icon></button>
            } @else {
              <span class="grow">{{ c.categoryName | t }}</span>
              <button mat-icon-button [matTooltip]="'Rename' | t" (click)="startEdit(c)"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button [matTooltip]="'Remove' | t" (click)="remove(c)"><mat-icon>delete</mat-icon></button>
            }
          </div>
        }
      </div>
      <p class="muted hint">{{ 'Removing a category hides it from the list. Expenses already recorded under it keep it.' | t }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>{{ 'Done' | t }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .add-row { display: flex; gap: 8px; align-items: center; margin: 6px 0 8px; }
    .grow { flex: 1; min-width: 0; }
    .rows { display: flex; flex-direction: column; }
    .row { display: flex; align-items: center; gap: 4px; min-height: 48px; border-bottom: 1px solid var(--erp-border); }
    .hint { font-size: 12px; margin-top: 12px; }
  `,
})
export class CategoriesDialog implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly categories = signal<ExpenseCategory[]>([]);
  readonly editing = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly newName = new FormControl('', { nonNullable: true });
  readonly editName = new FormControl('', { nonNullable: true });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<ExpenseCategory[]>('/expense-categories').subscribe((c) => this.categories.set(c));
  }

  add(): void {
    const name = this.newName.value.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.post<ExpenseCategory>('/expense-categories', { categoryName: name }).subscribe({
      next: () => { this.newName.setValue(''); this.busy.set(false); this.load(); },
      error: (e) => { this.error.set(errorMessage(e)); this.busy.set(false); },
    });
  }

  startEdit(c: ExpenseCategory): void {
    this.editName.setValue(c.categoryName);
    this.editing.set(c.uuid);
  }

  rename(c: ExpenseCategory): void {
    const name = this.editName.value.trim();
    if (!name || name === c.categoryName) { this.editing.set(null); return; }
    this.error.set(null);
    this.api.put<ExpenseCategory>(`/expense-categories/${c.uuid}`, { categoryName: name, revision: c.revision }).subscribe({
      next: () => { this.editing.set(null); this.load(); },
      error: (e) => { this.error.set(errorMessage(e)); this.load(); },
    });
  }

  remove(c: ExpenseCategory): void {
    const message = t('Remove "{name}" from the list?', { name: t(c.categoryName) });
    this.dialog.open(ConfirmDialog, { data: { title: 'Remove category?', message, confirmText: 'Remove', danger: true } })
      .afterClosed().subscribe((ok) => {
        if (!ok) return;
        this.error.set(null);
        this.api.delete(`/expense-categories/${c.uuid}`, { revision: c.revision }).subscribe({
          next: () => this.load(),
          error: (e) => { this.error.set(errorMessage(e)); this.load(); },
        });
      });
  }
}
