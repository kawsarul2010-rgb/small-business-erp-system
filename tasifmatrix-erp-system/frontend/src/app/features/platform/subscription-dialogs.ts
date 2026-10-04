import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/api.service';
import { durationLabel } from '../../core/billing';
import { BillingPayment, BusinessDetail, BusinessSubscription, PlanAdmin, SizeAdmin } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { formatMoney } from '../../shared/pipes';

/** Paid-until date from a picked day: the end of that day in Bangladesh (UTC+6). */
function endOfDayDhaka(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  return new Date(Date.UTC(y, m, day, 23 - 6, 59, 59)).toISOString();
}

// ====================================================================== change a business's subscription

@Component({
  selector: 'app-subscription-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule, MatSlideToggleModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ 'Subscription of {name}' | t: { name: data.business.name } }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field class="full">
          <mat-label>{{ 'Business size' | t }}</mat-label>
          <mat-select formControlName="sizeUuid">
            @for (z of sizes(); track z.uuid) { <mat-option [value]="z.uuid">{{ z.name }}@if (!z.isActive) { ({{ 'not offered' | t }}) }</mat-option> }
          </mat-select>
          <mat-hint>{{ 'Decides which prices the business pays.' | t }}</mat-hint>
        </mat-form-field>

        <div class="switch-row" [class.off]="!form.controls.billingExempt.value">
          <mat-icon>{{ form.controls.billingExempt.value ? 'money_off' : 'payments' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Never billed' | t }}</span>
            <span class="switch-hint">{{ 'For your own or partner businesses: never reminded, never paused.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="billingExempt" [attr.aria-label]="'Never billed' | t" />
        </div>

        @if (!form.controls.billingExempt.value) {
          <h3 class="section">{{ 'Paid until' | t }}</h3>
          <p class="muted small">{{ 'Change the date only to correct it or to give extra time. Payments extend it by themselves.' | t }}</p>
          <div class="form-grid">
            <mat-form-field>
              <mat-label>{{ 'Paid until' | t }}</mat-label>
              <input matInput [matDatepicker]="dp" formControlName="endsAt" />
              <mat-datepicker-toggle matIconSuffix [for]="dp" />
              <mat-datepicker #dp />
            </mat-form-field>
            <div class="trial-toggle">
              <mat-slide-toggle formControlName="onTrial">{{ 'This is a free trial' | t }}</mat-slide-toggle>
            </div>
          </div>
        }
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .section { margin: 18px 0 2px; font-size: 14px; font-weight: 650; }
    .small { font-size: 12.5px; margin: 0 0 12px; }
    .trial-toggle { display: flex; align-items: center; min-height: 56px; }
  `,
})
export class SubscriptionDialog implements OnInit {
  readonly data = inject<{ business: BusinessDetail; subscription: BusinessSubscription }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SubscriptionDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly sizes = signal<SizeAdmin[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly original = this.data.subscription.status.endsAt;

  readonly form = inject(FormBuilder).group({
    sizeUuid: [this.data.subscription.sizeUuid],
    billingExempt: [this.data.subscription.billingExempt],
    endsAt: [this.original ? new Date(this.original) : (null as Date | null)],
    onTrial: [this.data.subscription.status.onTrial],
  });

  ngOnInit(): void {
    this.api.get<SizeAdmin[]>('/platform/billing/sizes').subscribe({ next: (s) => this.sizes.set(s) });
  }

  save(): void {
    this.busy.set(true);
    const v = this.form.getRawValue();
    const picked = v.endsAt ? endOfDayDhaka(v.endsAt) : null;
    const changedDate = picked && (!this.original || new Date(this.original).toDateString() !== v.endsAt!.toDateString());
    const body = {
      sizeUuid: v.sizeUuid,
      billingExempt: v.billingExempt,
      endsAt: changedDate ? picked : null,
      onTrial: v.onTrial,
    };
    this.api.put<BusinessSubscription>(`/platform/billing/businesses/${this.data.business.uuid}`, body).subscribe({
      next: (s) => { this.notify.success('Saved.'); this.ref.close(s); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ====================================================================== record a payment taken by hand

@Component({
  selector: 'app-manual-payment-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ 'Record a payment' | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted small">{{ 'For money {name} paid you outside the app (cash, bank, personal bKash). The subscription is extended just like an online payment.' | t: { name: data.business.name } }}</p>
        <div class="form-grid">
          <mat-form-field class="span-2">
            <mat-label>{{ 'Package' | t }}</mat-label>
            <mat-select formControlName="planUuid">
              <mat-option [value]="null">{{ 'Other length' | t }}</mat-option>
              @for (p of plans(); track p.uuid) {
                <mat-option [value]="p.uuid">{{ p.name }} · {{ length(p.durationMonths) }}@if (priceFor(p) !== null) { · {{ money(priceFor(p)) }} }</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (!form.controls.planUuid.value) {
            <mat-form-field>
              <mat-label>{{ 'Length' | t }}</mat-label>
              <input matInput type="number" min="1" max="60" formControlName="months" />
              <span matTextSuffix>{{ 'months' | t }}</span>
              <mat-error>{{ err('months', 'Length') }}</mat-error>
            </mat-form-field>
          }
          <mat-form-field floatLabel="always">
            <mat-label>{{ 'Amount received' | t }}</mat-label>
            <span matTextPrefix>Tk&nbsp;</span>
            <input matInput type="number" min="0" inputmode="decimal" formControlName="amount" />
            <mat-error>{{ err('amount', 'Amount') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'Note' | t }}</mat-label>
            <input matInput formControlName="note" [placeholder]="'e.g. Cash, received by Kawsar' | t" />
          </mat-form-field>
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Record payment' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.small { font-size: 12.5px; margin: 0 0 14px; line-height: 1.5; }`,
})
export class ManualPaymentDialog implements OnInit {
  readonly data = inject<{ business: BusinessDetail; subscription: BusinessSubscription }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ManualPaymentDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly plans = signal<PlanAdmin[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).group({
    planUuid: [null as string | null],
    months: [1 as number | null, [Validators.min(1), Validators.max(60)]],
    amount: [null as number | null, [Validators.required, Validators.min(0)]],
    note: ['', Validators.maxLength(300)],
  });
  private readonly planValue = toSignal(this.form.controls.planUuid.valueChanges, { initialValue: null });
  readonly chosen = computed(() => this.plans().find((p) => p.uuid === this.planValue()) ?? null);

  constructor() {
    // Choosing a package fills in its price for this business's size.
    this.form.controls.planUuid.valueChanges.subscribe((id) => {
      const plan = this.plans().find((p) => p.uuid === id);
      const price = plan ? this.priceFor(plan) : null;
      if (price !== null) this.form.controls.amount.setValue(price);
    });
  }

  ngOnInit(): void {
    this.api.get<PlanAdmin[]>('/platform/billing/plans').subscribe({ next: (p) => this.plans.set(p.filter((x) => x.isActive)) });
  }

  length(months: number): string {
    return durationLabel(months);
  }

  money(v: number | null): string {
    return formatMoney(v);
  }

  priceFor(p: PlanAdmin): number | null {
    const size = this.data.subscription.sizeUuid;
    return size ? p.prices.find((x) => x.sizeUuid === size)?.price ?? null : null;
  }

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = { planUuid: v.planUuid, months: v.planUuid ? null : Number(v.months), amount: Number(v.amount), note: v.note };
    this.api.post<BillingPayment>(`/platform/billing/businesses/${this.data.business.uuid}/payments`, body).subscribe({
      next: (p) => { this.notify.success('Payment recorded. Paid until {date}.', { date: p.periodEnd ? new Date(p.periodEnd).toLocaleDateString('en-GB') : '-' }); this.ref.close(p); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

