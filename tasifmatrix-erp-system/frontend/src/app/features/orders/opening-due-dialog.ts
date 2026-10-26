import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ApiService, dateToIso, isoToDate } from '../../core/api.service';
import { OrderDetail, OrderKind } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { MoneyPipe, formatMoney } from '../../shared/pipes';
import { orderMeta } from './order-kind';

export interface OpeningDueDialogData {
  kind: OrderKind;
  /** New previous due for this customer or supplier. */
  party?: { uuid: string; name: string; code: string };
  /** Correcting an existing previous due. */
  order?: OrderDetail;
}

/**
 * Records (or corrects) a customer's or supplier's previous due - what was owed before the business
 * started using the app - without entering the old orders. Closes with the saved previous due.
 */
@Component({
  selector: 'app-opening-due-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatButtonModule, MatIconModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>{{ (order ? 'Edit previous due' : 'Add previous due') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="party">{{ partyName }} <span class="code">{{ partyCode }}</span></p>
        <p class="muted hint">
          {{ (data.kind === 'sales'
            ? 'What this customer already owed you before you started using the app. No old orders are needed and stock is not changed.'
            : 'What you already owed this supplier before you started using the app. No old orders are needed and stock is not changed.') | t }}
        </p>
        <div class="form-grid">
          <mat-form-field floatLabel="always">
            <mat-label>{{ 'Previous due' | t }}</mat-label>
            <span matTextPrefix>Tk&nbsp;</span>
            <input matInput type="number" min="0.01" step="0.01" formControlName="amount" cdkFocusInitial />
            @if (order && order.totalPaidAmount > 0) {
              <mat-hint>{{ 'Already paid {amount}' | t: { amount: (order.totalPaidAmount | money) } }}</mat-hint>
            }
            <mat-error>{{ amountError() }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Due as of' | t }}</mat-label>
            <input matInput [matDatepicker]="dp" formControlName="dueDate" [max]="maxDate" />
            <mat-datepicker-toggle matIconSuffix [for]="dp" /><mat-datepicker #dp />
            <mat-error>{{ err('dueDate', 'Date') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'Note' | t }}</mat-label>
            <input matInput formControlName="notes" [placeholder]="'e.g. From the old ledger book' | t" />
          </mat-form-field>
        </div>
        <p class="muted small">{{ 'Collect it later with Add payment, like any other due.' | t }}</p>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .party { margin: 0 0 4px; font-weight: 600; font-size: 15px; }
    .hint { margin: 0 0 14px; font-size: 13px; }
    .small { font-size: 12.5px; margin: 0; }
  `,
})
export class OpeningDueDialog {
  readonly data = inject<OpeningDueDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<OpeningDueDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly order = this.data.order ?? null;
  readonly partyName = this.order?.party.name ?? this.data.party?.name ?? '';
  readonly partyCode = this.order?.party.code ?? this.data.party?.code ?? '';
  /** The amount cannot drop below what is already paid against it. */
  private readonly minAmount = Math.max(0.01, this.order?.totalPaidAmount ?? 0);
  /** The date cannot move after the first payment. */
  readonly maxDate = this.order?.payments.length
    ? isoToDate([...this.order.payments].map((p) => p.paymentDate).sort()[0])
    : null;

  readonly form = inject(FormBuilder).group({
    amount: [this.order?.totalAmount ?? (null as number | null), [Validators.required, Validators.min(this.minAmount)]],
    dueDate: [this.order ? isoToDate(this.order.orderDate) : (new Date() as Date | null), Validators.required],
    notes: [this.order?.notes ?? '', Validators.maxLength(1000)],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  amountError(): string {
    const c = this.form.controls.amount;
    if (c.hasError('min') && this.minAmount > 0.01) {
      return t('Cannot be less than what is already paid ({amount}).', { amount: formatMoney(this.minAmount) });
    }
    return controlError(c, 'Previous due');
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const api = orderMeta(this.data.kind).api;
    this.busy.set(true);
    const req = this.order
      ? this.api.put<OrderDetail>(`${api}/${this.order.uuid}/opening-due`, {
          revision: this.order.revision, amount: v.amount, dueDate: dateToIso(v.dueDate), notes: v.notes,
        })
      : this.api.post<OrderDetail>(`${api}/opening-due`, {
          partyUuid: this.data.party!.uuid, amount: v.amount, dueDate: dateToIso(v.dueDate), notes: v.notes,
        });
    req.subscribe({
      next: (saved) => {
        this.notify.success('Previous due of {amount} saved for {name}.', { amount: formatMoney(saved.totalAmount), name: saved.party.name });
        this.ref.close(saved);
      },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
