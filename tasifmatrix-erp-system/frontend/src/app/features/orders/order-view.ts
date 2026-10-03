import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService, dateToIso, isoToDate, problemOf } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { PlatformService } from '../../core/platform.service';
import { OrderDetail, OrderKind, PaymentMethod } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { LabelPipe, MoneyPipe, QtyPipe, formatMoney } from '../../shared/pipes';
import { openSharePdfDialog } from '../../shared/share-pdf-dialog';
import { StatusChip } from '../../shared/status-chip';
import { orderMeta } from './order-kind';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TParams, t } from '../../core/i18n/i18n';

@Component({
  selector: 'app-order-view',
  imports: [TranslatePipe, RouterLink, DatePipe, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, MatTooltipModule, MatSlideToggleModule, StatusChip, MoneyPipe, QtyPipe, LabelPipe],
  templateUrl: './order-view.html',
  styleUrl: './order-view.scss',
})
export class OrderViewPage implements OnInit {
  readonly kind = input<OrderKind>('sales');
  readonly id = input.required<string>();

  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  readonly platform = inject(PlatformService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly meta = computed(() => orderMeta(this.kind()));
  readonly order = signal<OrderDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly lineColumns = ['no', 'product', 'type', 'boxes', 'pcs', 'perBox', 'perPcs', 'total'];
  readonly paymentColumns = ['date', 'method', 'note', 'by', 'amount', 'actions'];

  /** Write permissions per SRS 5.1. */
  readonly canWrite = computed(() => (this.kind() === 'purchase' ? this.auth.isAdmin() : this.auth.canSales()));
  readonly canVoid = computed(() => this.auth.isAdmin());
  readonly isDraft = computed(() => this.order()?.postingStatus === 'DRAFT');
  readonly isFinal = computed(() => this.order()?.postingStatus === 'FINAL');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<OrderDetail>(`${this.meta().api}/${this.id()}`).subscribe({
      next: (o) => { this.order.set(o); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load the order.'); this.loading.set(false); },
    });
  }

  finalize(): void {
    const o = this.order()!;
    const stockSentence = this.kind() === 'sales'
      ? 'Stock for {n} line item(s) will be deducted from inventory.'
      : 'Stock for {n} line item(s) will be added to inventory.';
    this.notify.confirm({
      title: t('Finalize #{no}?', { no: o.orderNumber }),
      message: t(stockSentence, { n: o.lines.length }) + '\n' + t('After finalizing, the order and its lines can no longer be edited. Payments can still be added.')
        + (this.smsActive() ? '\n' + t('{mobile} gets an SMS.', { mobile: o.party.mobileNumber }) : ''),
      confirmText: 'Finalize',
    }).subscribe((ok) => {
      if (!ok) return;
      this.run(this.api.post<OrderDetail>(`${this.meta().api}/${o.uuid}/finalize`, { revision: o.revision }), 'Order #{no} finalized.', { no: o.orderNumber });
    });
  }

  voidOrder(): void {
    const o = this.order()!;
    this.dialog.open(VoidDialog, this.layout.dialog({ order: o, kind: this.kind() }, '480px')).afterClosed().subscribe((reason?: string) => {
      if (!reason) return;
      this.run(this.api.post<OrderDetail>(`${this.meta().api}/${o.uuid}/void`, { revision: o.revision, voidReason: reason }), 'Order #{no} voided.', { no: o.orderNumber });
    });
  }

  deleteDraft(): void {
    const o = this.order()!;
    this.notify.confirm({ title: 'Delete draft', message: t('Delete draft order #{no}?', { no: o.orderNumber }), confirmText: 'Delete', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.busy.set(true);
      this.api.delete(`${this.meta().api}/${o.uuid}`, { revision: o.revision }).subscribe({
        next: () => { this.notify.success('Draft deleted.'); void this.router.navigate([this.meta().route]); },
        error: (e) => { this.notify.error(e); this.busy.set(false); this.reloadOnConflict(e); },
      });
    });
  }

  /** SMS really goes out for this order: switched on, and not blocked by the business or the party. */
  readonly smsActive = computed(() => {
    const o = this.order();
    return !!o && o.sendSms && !o.smsBlockedReason;
  });

  setSms(on: boolean): void {
    const o = this.order()!;
    this.busy.set(true);
    this.api.post<OrderDetail>(`${this.meta().api}/${o.uuid}/sms`, { sendSms: on, revision: o.revision }).subscribe({
      next: (updated) => {
        this.order.set(updated);
        this.notify.success(on ? 'SMS turned on for this order.' : 'SMS turned off for this order.');
        this.busy.set(false);
      },
      error: (e: unknown) => {
        this.notify.error(e);
        this.order.set({ ...o }); // puts the switch back where the server has it
        this.busy.set(false);
        this.reloadOnConflict(e);
      },
    });
  }

  addPayment(): void {
    const o = this.order()!;
    this.dialog.open(PaymentDialog, this.layout.dialog({ order: o, api: this.meta().api }, '520px')).afterClosed().subscribe((updated?: OrderDetail) => {
      if (updated) this.order.set(updated);
    });
  }

  deletePayment(paymentUuid: string): void {
    const o = this.order()!;
    const p = o.payments.find((x) => x.uuid === paymentUuid)!;
    this.notify.confirm({
      title: 'Remove payment',
      message: t('Remove the payment of {amount} on {date}? It stays in the audit history as deleted.', { amount: formatMoney(p.paymentAmount), date: p.paymentDate }),
      confirmText: 'Remove',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.run(this.api.delete<OrderDetail>(`${this.meta().api}/${o.uuid}/payments/${paymentUuid}`, { revision: o.revision }), 'Payment removed.');
    });
  }

  /** Opens the PDF in a new tab (browser) or the system viewer (Android app). */
  pdf(download: boolean): void {
    const o = this.order()!;
    this.busy.set(true);
    const fileName = `${this.kind() === 'sales' ? 'sales-invoice' : 'purchase-order'}-${o.orderNumber}.pdf`;
    this.api.blob(`${this.meta().api}/${o.uuid}/pdf`).subscribe({
      next: async (blob) => {
        try {
          await this.platform.openPdf(blob, fileName, download);
        } catch (e) {
          this.notify.error(e);
        }
        this.busy.set(false);
      },
      error: (e) => { this.notify.error(e); this.busy.set(false); },
    });
  }

  /**
   * Browser sharing. The Android app has the system share sheet already, so this offers the
   * routes a desktop browser actually has: the Web Share API where it exists, WhatsApp with the
   * file saved alongside, or an email sent from the server with the PDF attached.
   */
  share(): void {
    const o = this.order()!;
    const title = `${this.kind() === 'sales' ? 'Sales invoice' : 'Purchase order'} #${o.orderNumber}`;
    this.busy.set(true);
    openSharePdfDialog(
      { api: this.api, dialog: this.dialog, layout: this.layout, notify: this.notify },
      `${this.meta().api}/${o.uuid}/pdf`,
      {},
      {
        title,
        fileName: `${this.kind() === 'sales' ? 'sales-invoice' : 'purchase-order'}-${o.orderNumber}.pdf`,
        mobileNumber: o.party.mobileNumber,
        message: `${title} for ${o.party.name}. Total ${formatMoney(o.totalAmount)}, due ${formatMoney(o.dueAmount)}.`,
      },
      () => this.busy.set(false),
    );
  }

  private run(req: Observable<OrderDetail>, message: string, params?: TParams): void {
    this.busy.set(true);
    req.subscribe({
      next: (updated) => {
        this.order.set(updated);
        this.notify.success(message, params);
        this.busy.set(false);
      },
      error: (e: unknown) => {
        this.notify.error(e);
        this.busy.set(false);
        this.reloadOnConflict(e);
      },
    });
  }

  private reloadOnConflict(e: unknown): void {
    if (problemOf(e).code === 'REVISION_CONFLICT') this.load();
  }
}

// ====================================================================== dialogs

@Component({
  selector: 'app-payment-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>{{ 'Add payment · #{no}' | t: { no: data.order.orderNumber } }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted" style="margin-top: 0">
          {{ 'Total {amount}' | t: { amount: (data.order.totalAmount | money) } }} · {{ 'Paid {amount}' | t: { amount: (data.order.totalPaidAmount | money) } }} ·
          <strong class="negative">{{ 'Due {amount}' | t: { amount: (data.order.dueAmount | money) } }}</strong>
        </p>
        <div class="form-grid">
          <mat-form-field floatLabel="always">
            <mat-label>{{ 'Amount' | t }}</mat-label>
            <span matTextPrefix>Tk&nbsp;</span>
            <input matInput type="number" min="0.01" step="0.01" [max]="data.order.dueAmount" formControlName="paymentAmount" cdkFocusInitial />
            <mat-error>{{ err('paymentAmount', 'Amount') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Method' | t }}</mat-label>
            <mat-select formControlName="paymentMethod">
              @for (m of methods; track m.value) { <mat-option [value]="m.value">{{ m.label | t }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Payment date' | t }}</mat-label>
            <input matInput [matDatepicker]="dp" formControlName="paymentDate" [min]="minDate" [max]="today" />
            <mat-datepicker-toggle matIconSuffix [for]="dp" /><mat-datepicker #dp />
            <mat-error>{{ err('paymentDate', 'Payment date') }}</mat-error>
          </mat-form-field>
          <div style="display: flex; align-items: center;">
            <button mat-button type="button" (click)="form.controls.paymentAmount.setValue(data.order.dueAmount)">{{ 'Pay full due' | t }}</button>
          </div>
          <mat-form-field class="span-2"><mat-label>{{ 'Note' | t }}</mat-label><input matInput formControlName="paymentNote" [placeholder]="'e.g. bKash TrxID' | t" /></mat-form-field>
        </div>
        <p class="muted" style="margin: 0">
          @if (data.order.sendSms && !data.order.smsBlockedReason) { {{ 'An SMS with the payment and the account balance will be sent to {mobile}.' | t: { mobile: data.order.party.mobileNumber } }} }
          @else { {{ 'No SMS is sent for this payment.' | t }} }
        </p>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Add payment' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PaymentDialog {
  readonly data = inject<{ order: OrderDetail; api: string }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PaymentDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly today = new Date();
  readonly minDate = isoToDate(this.data.order.orderDate);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly methods: { value: PaymentMethod; label: string }[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'MOBILE_BANKING', label: 'Mobile banking (bKash, Nagad...)' },
    { value: 'BANK', label: 'Bank transfer' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'OTHER', label: 'Other' },
  ];
  readonly form = inject(FormBuilder).group({
    paymentAmount: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(this.data.order.dueAmount)]],
    paymentMethod: ['CASH' as PaymentMethod, Validators.required],
    paymentDate: [new Date() as Date | null, Validators.required],
    paymentNote: [''],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.post<OrderDetail>(`${this.data.api}/${this.data.order.uuid}/payments`, {
      revision: this.data.order.revision,
      paymentAmount: v.paymentAmount,
      paymentMethod: v.paymentMethod,
      paymentDate: dateToIso(v.paymentDate),
      paymentNote: v.paymentNote,
    }).subscribe({
      next: (updated) => { this.notify.success('Payment added.'); this.ref.close(updated); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

@Component({
  selector: 'app-void-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ 'Void #{no}' | t: { no: data.order.orderNumber } }}</h2>
    <mat-dialog-content>
      @if (data.order.postingStatus === 'FINAL') {
        @if (data.order.payments.length > 0) {
          <p class="negative">{{ 'This order has {n} payment(s). Remove all payments before voiding.' | t: { n: data.order.payments.length } }}</p>
        } @else {
          <p>{{ (data.kind === 'sales'
            ? 'Voiding reverses the stock movement: stock will be added back. This cannot be undone.'
            : 'Voiding reverses the stock movement: stock will be deducted. This cannot be undone.') | t }}</p>
        }
      } @else {
        <p>{{ 'This draft will be marked VOID. Stock is not affected. This cannot be undone.' | t }}</p>
      }
      <mat-form-field class="full-width">
        <mat-label>{{ 'Reason' | t }}</mat-label>
        <textarea matInput rows="3" [formControl]="reason" cdkFocusInitial></textarea>
        <mat-error>{{ 'A reason is required.' | t }}</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | t }}</button>
      <button mat-flat-button class="danger" [disabled]="data.order.postingStatus === 'FINAL' && data.order.payments.length > 0" (click)="confirm()">{{ 'Void order' | t }}</button>
    </mat-dialog-actions>
  `,
})
export class VoidDialog {
  readonly data = inject<{ order: OrderDetail; kind: OrderKind }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<VoidDialog>);
  readonly reason = inject(FormBuilder).control('', [Validators.required, Validators.maxLength(500)]);

  confirm(): void {
    if (this.reason.invalid || !this.reason.value?.trim()) { this.reason.markAsTouched(); return; }
    this.ref.close(this.reason.value.trim());
  }
}
