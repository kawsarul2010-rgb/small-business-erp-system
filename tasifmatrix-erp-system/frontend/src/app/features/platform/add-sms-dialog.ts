import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../../core/api.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BusinessDetail, SmsBalance } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/pipes';
import { MAX_SMS_PURCHASE } from '../../shared/sms-credits';

/**
 * The super admin adds SMS to a business: paid outside the app (cash, bank - the amount is
 * recorded as a payment) or given for free. The pack lasts the usual number of months.
 */
@Component({
  selector: 'app-add-sms-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>{{ 'Add SMS to {name}' | t: { name: data.business.name } }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted" style="margin-top: 0">
          {{ 'They last {n} months from today. Their price per SMS is {price}.' | t: { n: data.balance.validityMonths, price: (data.balance.unitPrice | money) } }}
        </p>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'Number of SMS' | t }}</mat-label>
            <input matInput type="number" inputmode="numeric" min="1" [max]="max" step="1" formControlName="quantity" cdkFocusInitial />
            <mat-error>{{ err('quantity', 'Number of SMS') }}</mat-error>
          </mat-form-field>
          <mat-form-field floatLabel="always">
            <mat-label>{{ 'Amount received' | t }}</mat-label>
            <span matTextPrefix>Tk&nbsp;</span>
            <input matInput type="number" inputmode="decimal" min="0" step="0.01" formControlName="amount" [placeholder]="'Free' | t" />
            <mat-hint>{{ 'Leave empty to give them for free.' | t }}</mat-hint>
            <mat-error>{{ err('amount', 'Amount') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'Note' | t }}</mat-label>
            <input matInput formControlName="note" [placeholder]="'e.g. Paid in cash, bKash TrxID' | t" />
          </mat-form-field>
        </div>
        @if (suggested(); as s) {
          <button mat-button type="button" (click)="form.controls.amount.setValue(s)">{{ 'Use {amount} (number × price)' | t: { amount: (s | money) } }}</button>
        }
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Add SMS' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class AddSmsDialog {
  readonly data = inject<{ business: BusinessDetail; balance: SmsBalance }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AddSmsDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly max = MAX_SMS_PURCHASE;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({
    quantity: [this.data.balance.minPurchase as number | null, [Validators.required, Validators.min(1), Validators.max(MAX_SMS_PURCHASE)]],
    amount: [null as number | null, [Validators.min(0)]],
    note: [''],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  /** The amount at the business's price, offered when nothing is entered yet. */
  suggested(): number | null {
    const q = Number(this.form.controls.quantity.value);
    if (!q || this.form.controls.amount.value !== null) return null;
    return Math.round(q * this.data.balance.unitPrice * 100) / 100;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.post<SmsBalance>(`/platform/billing/businesses/${this.data.business.uuid}/sms`, {
      quantity: Number(v.quantity),
      amount: v.amount === null || (v.amount as unknown) === '' ? null : Number(v.amount),
      note: v.note,
    }).subscribe({
      next: (balance) => { this.notify.success('{n} SMS added.', { n: Number(v.quantity) }); this.ref.close(balance); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
