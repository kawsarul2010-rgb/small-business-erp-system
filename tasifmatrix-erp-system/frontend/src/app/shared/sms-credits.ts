import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService, problemOf } from '../core/api.service';
import { durationLabel } from '../core/billing';
import { t } from '../core/i18n/i18n';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { LayoutService } from '../core/layout.service';
import { BillingPayment, PlanOption, SmsBalance, SmsCreditSource } from '../core/models';
import { MoneyPipe } from './pipes';

/** The most SMS one payment can buy (the server's limit too). */
export const MAX_SMS_PURCHASE = 100_000;

/** Written as icon: '...' so the icon font build includes them. */
const SOURCE: Record<SmsCreditSource, { label: string; icon: string }> = {
  PURCHASE: { label: 'Bought', icon: 'shopping_cart' },
  FREE: { label: 'Free', icon: 'redeem' },
  MANUAL: { label: 'Added for you', icon: 'support_agent' },
};

export function smsSourceLabel(source: SmsCreditSource): string {
  return SOURCE[source].label;
}

/** Quick choices: the smallest purchase, then round numbers above it. */
export function smsPresets(min: number): number[] {
  return [...new Set([min, 300, 500, 1000, 2000].filter((q) => q >= min))].sort((a, b) => a - b).slice(0, 5);
}

/** What a payment bought, for payment lists: "3 months", "300 SMS" or "3 months + 300 SMS". */
export function paymentWhat(p: Pick<BillingPayment, 'planName' | 'durationMonths' | 'smsQuantity'>): string {
  const sms = p.smsQuantity > 0 ? t('{n} SMS', { n: p.smsQuantity.toLocaleString('en-US') }) : null;
  if (p.durationMonths <= 0) return sms ?? p.planName;
  const plan = `${p.planName} · ${durationLabel(p.durationMonths)}`;
  return sms ? `${plan} + ${sms}` : plan;
}

/**
 * Opens the payment dialog: SMS only, or a package with SMS added if the business wants.
 * The dialog starts the bKash payment itself and moves the browser to bKash.
 */
export function openBuySms(dialog: MatDialog, layout: LayoutService, balance: SmsBalance | null, plan?: PlanOption): void {
  dialog.open(BuySmsDialog, { ...layout.dialog({ balance, plan: plan ?? null } satisfies BuySmsData, '480px'), autoFocus: false });
}

interface BuySmsData {
  /** Null when SMS cannot be bought (prepaid SMS off): then only the package is paid. */
  balance: SmsBalance | null;
  plan: PlanOption | null;
}

@Component({
  selector: 'app-buy-sms-dialog',
  imports: [TranslatePipe, DecimalPipe, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatSlideToggleModule, MoneyPipe],
  styles: `
    .line { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; padding: 10px 0; font-size: 14.5px; }
    .line + .line { border-top: 1px dashed var(--erp-border); }
    .line .what { color: var(--erp-text); }
    .line .sub { display: block; font-size: 12.5px; color: var(--erp-muted); }
    .add { display: flex; align-items: center; gap: 12px; margin: 6px 0 4px; padding: 12px 14px; border-radius: 12px; background: var(--erp-card-2); border: 1px solid var(--erp-border); }
    .add .text { flex: 1; font-size: 14px; }
    .add .hint { display: block; font-size: 12.5px; color: var(--erp-muted); }
    .q-label { font-weight: 600; font-size: 13.5px; margin: 14px 0 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .chip { border: 1px solid var(--erp-border); background: var(--erp-card); color: var(--erp-text); border-radius: 999px; padding: 7px 14px;
      font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; font-variant-numeric: tabular-nums; }
    .chip.on { border-color: var(--erp-brand); background: var(--erp-brand-soft); color: var(--erp-brand-fg); }
    mat-form-field { width: 100%; }
    .note { margin: 2px 0 6px; font-size: 12.5px; line-height: 1.5; color: var(--erp-muted); }
    .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 12px; border-top: 2px solid var(--erp-border);
      font-size: 15px; font-weight: 700; }
    .total b { font-size: 22px; font-variant-numeric: tabular-nums; }
    .bkash { background: #e2136e !important; color: #fff !important; font-weight: 650; }
    .bkash-mark { display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 8px; border-radius: 6px; background: #fff; color: #e2136e; font-weight: 800; font-size: 14px; }
    .err { color: var(--erp-negative); font-size: 13.5px; }
  `,
  template: `
    <h2 mat-dialog-title>{{ data.plan ? ('Pay for {plan}' | t: { plan: data.plan.name }) : ('Buy SMS' | t) }}</h2>
    <mat-dialog-content>
      @if (data.plan; as p) {
        <div class="line">
          <span class="what">{{ p.name }}<span class="sub">{{ length(p.durationMonths) }}</span></span>
          <b>{{ p.price | money }}</b>
        </div>
        @if (smsAllowed) {
          <label class="add">
            <span class="text">{{ 'Add SMS to this payment' | t }}<span class="hint">{{ 'For order and payment messages to your customers and suppliers.' | t }}</span></span>
            <mat-slide-toggle [checked]="addSms()" (change)="addSms.set($event.checked)" [attr.aria-label]="'Add SMS to this payment' | t" />
          </label>
        }
      }

      @if (buyingSms(); as b) {
        <div class="q-label">{{ 'How many SMS?' | t }}</div>
        <div class="chips">
          @for (q of presets; track q) {
            <button type="button" class="chip" [class.on]="quantity() === q" (click)="quantity.set(q)">{{ q | number }}</button>
          }
        </div>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'Number of SMS' | t }}</mat-label>
          <input matInput type="number" inputmode="numeric" step="1" [min]="b.minPurchase" [max]="max" [ngModel]="quantity()" (ngModelChange)="quantity.set(+$event)" />
          <mat-hint>{{ 'At least {n}' | t: { n: b.minPurchase } }}</mat-hint>
        </mat-form-field>
        <div class="line">
          <span class="what">{{ '{n} SMS × {price}' | t: { n: (quantity() | number), price: (b.unitPrice | money) } }}</span>
          <b>{{ smsAmount() | money }}</b>
        </div>
        <p class="note">{{ 'Valid for {n} months from today. A long message uses 2 or more SMS.' | t: { n: b.validityMonths } }}</p>
      }

      <div class="total"><span>{{ 'Total' | t }}</span><b>{{ total() | money }}</b></div>
      @if (problem()) { <p class="err">{{ problem() | t }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | t }}</button>
      <button mat-flat-button class="bkash" (click)="pay()" [disabled]="busy() || !!problem()">
        <span class="bkash-mark">b</span>{{ 'Pay {amount} with bKash' | t: { amount: (total() | money) } }}
      </button>
    </mat-dialog-actions>
  `,
})
export class BuySmsDialog {
  readonly data = inject<BuySmsData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);

  readonly max = MAX_SMS_PURCHASE;
  /** SMS can be added to this payment: prepaid SMS is on for this business. */
  readonly smsAllowed = !!this.data.balance?.canBuy;
  readonly presets = smsPresets(this.data.balance?.minPurchase ?? 100);
  readonly addSms = signal(false);
  readonly quantity = signal(this.data.plan ? (this.presets.find((q) => q >= 300) ?? this.presets[0]) : this.presets[0]);
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);

  /** The balance, when SMS are part of this payment. */
  readonly buyingSms = computed(() => (this.smsAllowed && (!this.data.plan || this.addSms()) ? this.data.balance : null));
  readonly smsAmount = computed(() => {
    const b = this.buyingSms();
    return b ? Math.round(this.quantity() * b.unitPrice * 100) / 100 : 0;
  });
  readonly total = computed(() => Math.round(((this.data.plan?.price ?? 0) + this.smsAmount()) * 100) / 100);

  readonly problem = computed(() => {
    const b = this.buyingSms();
    if (b) {
      const q = this.quantity();
      if (!Number.isInteger(q) || q < b.minPurchase) return `Buy at least ${b.minPurchase} SMS.`;
      if (q > MAX_SMS_PURCHASE) return 'You can buy up to 100,000 SMS at once.';
    }
    if (this.total() <= 0) return 'There is nothing to pay.';
    return this.serverError();
  });

  length(months: number): string {
    return durationLabel(months);
  }

  pay(): void {
    if (this.problem()) return;
    this.busy.set(true);
    this.serverError.set(null);
    const body = { planUuid: this.data.plan?.uuid ?? null, smsQuantity: this.buyingSms() ? this.quantity() : null };
    this.api.post<{ redirectUrl: string; invoiceNumber: string }>('/billing/checkout', body).subscribe({
      next: (r) => { window.location.href = r.redirectUrl; },
      error: (e) => { this.busy.set(false); this.serverError.set(problemOf(e).title ?? 'Could not start the payment.'); },
    });
  }
}

/**
 * The SMS balance: how many SMS the business can still send, when they expire, the price, and
 * every pack. Without prices or buying inside the Android app (see the Billing page).
 */
@Component({
  selector: 'app-sms-balance',
  imports: [TranslatePipe, DatePipe, DecimalPipe, MatButtonModule, MatIconModule, MoneyPipe],
  styles: `
    :host { display: block; }
    .sms { padding: 20px 22px; border-left: 4px solid var(--erp-positive); }
    .sms.low { border-left-color: var(--erp-warning); }
    .sms.empty { border-left-color: var(--erp-negative); }
    .head { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--erp-tint-teal-bg); color: var(--erp-tint-teal-fg); }
    .low .icon { background: var(--erp-tint-amber-bg); color: var(--erp-tint-amber-fg); }
    .empty .icon { background: var(--erp-tint-rose-bg); color: var(--erp-tint-rose-fg); }
    .main { flex: 1; min-width: 200px; }
    .k { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--erp-faint); }
    .big { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .big small { font-size: 14px; font-weight: 600; color: var(--erp-muted); letter-spacing: 0; margin-left: 4px; }
    .line { margin-top: 2px; font-size: 13.5px; color: var(--erp-muted); line-height: 1.45; }
    .empty .line { color: var(--erp-negative); }
    .bkash { background: #e2136e !important; color: #fff !important; height: 44px; font-weight: 650; }
    .bkash-mark { display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 8px; border-radius: 6px; background: #fff; color: #e2136e; font-weight: 800; font-size: 14px; }
    .facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 14px; font-size: 13px; color: var(--erp-muted); }
    .facts b { color: var(--erp-text); font-weight: 650; }
    .special { display: inline-flex; align-items: center; gap: 4px; padding: 1px 9px 1px 6px; border-radius: 999px; font-size: 11.5px; font-weight: 650;
      background: var(--erp-chip-success-bg); color: var(--erp-chip-success-fg); }
    .special mat-icon { font-size: 14px; width: 14px; height: 14px; }
    details { margin-top: 14px; border-top: 1px solid var(--erp-border); padding-top: 10px; }
    summary { cursor: pointer; font-size: 13.5px; font-weight: 600; color: var(--erp-brand); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13.5px; }
    th { text-align: left; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--erp-muted); padding: 8px 8px; border-bottom: 1px solid var(--erp-border); }
    td { padding: 9px 8px; border-bottom: 1px solid var(--erp-border); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    tr.gone td { opacity: .55; }
    .src { display: inline-flex; align-items: center; gap: 6px; }
    .src mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--erp-faint); }
    .exp { font-size: 11px; font-weight: 700; color: var(--erp-negative); margin-left: 4px; }
    .compact .facts, .compact details { display: none; }
    @media (max-width: 600px) {
      .sms { padding: 16px; }
      .bkash { width: 100%; }
      .hide-sm { display: none; }
    }
  `,
  template: `
    @if (balance(); as b) {
      <section class="card sms" [class.low]="b.available > 0 && b.available <= lowAt" [class.empty]="b.available === 0" [class.compact]="compact()">
        <div class="head">
          <span class="icon"><mat-icon>{{ b.available === 0 ? 'sms_failed' : 'sms' }}</mat-icon></span>
          <div class="main">
            <div class="k">{{ 'SMS balance' | t }}</div>
            <div class="big">{{ b.available | number }}<small>{{ 'SMS left' | t }}</small></div>
            <div class="line">
              @if (b.available === 0) {
                {{ (inApp() ? 'No SMS left. Order and payment messages are not sent.' : 'No SMS left. Order and payment messages are not sent until you buy more.') | t }}
              } @else if (b.nextExpiry) {
                @if (b.nextExpiryCount >= b.available) { {{ 'They expire on {date}.' | t: { date: (b.nextExpiry | date: 'd MMM yyyy') } }} }
                @else { {{ '{n} of them expire on {date}.' | t: { n: (b.nextExpiryCount | number), date: (b.nextExpiry | date: 'd MMM yyyy') } }} }
              }
            </div>
          </div>
          @if (canBuy()) {
            <button mat-flat-button class="bkash" (click)="buy.emit()"><span class="bkash-mark">b</span>{{ 'Buy SMS' | t }}</button>
          }
        </div>

        @if (!inApp()) {
          <div class="facts">
            <span><b>{{ b.unitPrice | money }}</b> {{ 'per SMS' | t }}</span>
            @if (b.specialPrice) { <span class="special"><mat-icon>sell</mat-icon>{{ 'Special price for your business' | t }}</span> }
            <span>{{ 'Each pack lasts {n} months' | t: { n: b.validityMonths } }}</span>
            <span>{{ 'A long message uses 2 or more SMS' | t }}</span>
          </div>
        }

        @if (b.packs.length) {
          <details>
            <summary>{{ 'SMS packs ({n})' | t: { n: b.packs.length } }}</summary>
            <table>
              <thead>
                <tr>
                  <th>{{ 'Added' | t }}</th>
                  <th class="hide-sm">{{ 'From' | t }}</th>
                  <th class="num">{{ 'SMS' | t }}</th>
                  <th class="num hide-sm">{{ 'Used' | t }}</th>
                  <th class="num">{{ 'Left' | t }}</th>
                  <th>{{ 'Expires' | t }}</th>
                </tr>
              </thead>
              <tbody>
                @for (p of b.packs; track p.uuid) {
                  <tr [class.gone]="p.expired || p.left === 0">
                    <td class="nowrap">{{ p.createdDate | date: 'd MMM yyyy' }}</td>
                    <td class="hide-sm"><span class="src"><mat-icon>{{ icon(p.source) }}</mat-icon>{{ label(p.source) | t }}</span></td>
                    <td class="num">{{ p.quantity | number }}</td>
                    <td class="num hide-sm">{{ p.used | number }}</td>
                    <td class="num">{{ p.left | number }}</td>
                    <td class="nowrap">{{ p.expiresAt | date: 'd MMM yyyy' }}@if (p.expired) { <span class="exp">{{ 'Expired' | t }}</span> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        }
      </section>
    }
  `,
})
export class SmsBalanceCard {
  readonly balance = input.required<SmsBalance | null>();
  /** Show the Buy SMS button (an admin, on the website, with bKash ready). */
  readonly canBuy = input(false);
  /** Inside the Android app: no prices and no buying. */
  readonly inApp = input(false);
  /** Just the number and the expiry (the SMS log page). */
  readonly compact = input(false);
  readonly buy = output<void>();

  /** At or below this many SMS the card turns amber. */
  readonly lowAt = 20;

  label(source: SmsCreditSource): string {
    return SOURCE[source].label;
  }

  icon(source: SmsCreditSource): string {
    return SOURCE[source].icon;
  }
}
