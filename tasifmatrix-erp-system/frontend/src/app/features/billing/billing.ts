import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { ApiService, problemOf } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BillingStore, durationLabel } from '../../core/billing';
import { LayoutService } from '../../core/layout.service';
import { BillingOverview, BillingPayment, Paged, PlanOption } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PlatformService } from '../../core/platform.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MoneyPipe } from '../../shared/pipes';
import { StatusChip } from '../../shared/status-chip';

/** Written as icon: '...' so the icon font build includes them. */
const STATE_ICONS: Record<string, { icon: string }> = {
  TRIAL: { icon: 'hourglass_top' },
  ACTIVE: { icon: 'verified' },
  GRACE_PERIOD: { icon: 'warning' },
  EXPIRED: { icon: 'lock' },
  NOT_BILLED: { icon: 'check_circle' },
};

/**
 * The business's subscription: where it stands, the packages for its size with their price, paying
 * with bKash (admins), and the payment history. Stays open when the subscription has run out.
 *
 * Inside the Android app only where the subscription stands and past payments are shown: Google
 * Play does not allow paying for the app's own subscription outside Google Play billing, nor
 * pointing people to another way to pay. Packages, prices and bKash stay on the website.
 */
@Component({
  selector: 'app-billing',
  imports: [TranslatePipe, DatePipe, FormsModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatFormFieldModule, MatSelectModule, MatTooltipModule, MoneyPipe, StatusChip],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Billing' | t }}</h1>
          <div class="subtitle">{{ (inApp ? 'Your subscription to {product}.' : 'Your subscription to {product} and its payments.') | t: { product: 'Tasif Matrix ERP' } }}</div>
        </div>
      </div>

      @if (loading() && !data()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @if (data(); as d) {
        <!-- ---------------------------------------------------------- where the business stands -->
        <section class="card status" [class]="'card status ' + statusTone()">
          <span class="status-icon"><mat-icon>{{ statusIcon() }}</mat-icon></span>
          <div class="status-body">
            <div class="status-top">
              <h2>
                @switch (d.status.state) {
                  @case ('NOT_BILLED') { {{ 'No payment needed' | t }} }
                  @case ('TRIAL') { {{ 'Free trial' | t }} }
                  @case ('ACTIVE') { {{ d.status.planName ?? ('Active' | t) }} }
                  @case ('GRACE_PERIOD') { {{ (inApp ? 'Grace period' : 'Payment overdue') | t }} }
                  @case ('EXPIRED') { {{ 'Subscription ended' | t }} }
                }
              </h2>
              @if (d.status.state !== 'NOT_BILLED') { <app-status [value]="d.status.state" /> }
            </div>
            <p class="status-line">
              @switch (d.status.state) {
                @case ('NOT_BILLED') { {{ 'Your business can use the app without a subscription right now.' | t }} }
                @case ('TRIAL') { {{ (d.status.daysLeft === 1 ? 'Free until {date} - 1 day left.' : 'Free until {date} - {n} days left.') | t: { date: (d.status.endsAt | date: 'd MMMM yyyy'), n: d.status.daysLeft } }} }
                @case ('ACTIVE') { {{ (d.status.daysLeft === 1 ? 'Paid until {date} - 1 day left.' : 'Paid until {date} - {n} days left.') | t: { date: (d.status.endsAt | date: 'd MMMM yyyy'), n: d.status.daysLeft } }} }
                @case ('GRACE_PERIOD') { {{ (inApp ? 'Ended on {date}. The app keeps working until {grace}.' : 'Ended on {date}. The app keeps working until {grace} - please pay before then.') | t: { date: (d.status.endsAt | date: 'd MMMM yyyy'), grace: (d.status.graceEndsAt | date: 'd MMMM yyyy') } }} }
                @case ('EXPIRED') { {{ (inApp ? 'Ended on {date}. Everything is paused - your data is safe and nothing is deleted.' : 'Ended on {date}. Everything is paused until the bill is paid - your data is safe and nothing is deleted.') | t: { date: (d.status.endsAt | date: 'd MMMM yyyy') } }} }
              }
            </p>
            <div class="facts">
              <span><span class="k">{{ 'Business size' | t }}</span> {{ d.sizeName ?? ('Not set' | t) }}</span>
              <span><span class="k">{{ 'Business code' | t }}</span> <span class="mono">{{ d.businessCode }}</span></span>
            </div>
          </div>
        </section>

        <!-- packages, prices and paying: website only (see the class comment) -->
        @if (!inApp && d.billingEnabled && d.status.state !== 'NOT_BILLED') {
          <!-- ---------------------------------------------------------- size, when not chosen yet -->
          @if (!d.sizeUuid) {
            <section class="card card-pad size-pick">
              <h2 class="card-title">{{ 'Choose your business size' | t }}</h2>
              <p class="muted small">{{ 'The price of each package depends on the size of your business.' | t }}</p>
              @if (d.canPay) {
                <div class="size-row">
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>{{ 'Business size' | t }}</mat-label>
                    <mat-select [(ngModel)]="sizeChoice">
                      @for (z of d.sizes; track z.uuid) { <mat-option [value]="z.uuid">{{ z.name }}@if (z.description) { <span class="muted"> - {{ z.description }}</span> }</mat-option> }
                    </mat-select>
                  </mat-form-field>
                  <button mat-flat-button (click)="saveSize()" [disabled]="!sizeChoice || busy()">{{ 'Save' | t }}</button>
                </div>
              } @else {
                <p class="muted">{{ 'Please ask your admin to choose it.' | t }}</p>
              }
            </section>
          }

          <!-- ---------------------------------------------------------- packages -->
          @if (d.sizeUuid) {
            <div class="section-head">
              <div>
                <h2 class="section-title">{{ 'Packages for your business' | t }}</h2>
                <div class="muted small">{{ 'Paying adds the package length to your subscription. Pay early and nothing is lost: the time is added after your current end date.' | t }}</div>
              </div>
            </div>
            @if (d.plans.length === 0) {
              <div class="card card-pad muted">{{ 'No packages are available for your business yet. Please contact support.' | t }}</div>
            } @else {
              <div class="plans">
                @for (p of d.plans; track p.uuid) {
                  <section class="card plan" [class.current]="p.name === d.status.planName && d.status.state === 'ACTIVE'">
                    @if (p.name === d.status.planName && d.status.state === 'ACTIVE') { <span class="badge">{{ 'Current' | t }}</span> }
                    <div class="plan-name">{{ p.name }}</div>
                    @if (length(p.durationMonths) !== p.name) { <div class="plan-length">{{ length(p.durationMonths) }}</div> }
                    <div class="price">{{ p.price | money }}</div>
                    @if (p.durationMonths > 1) { <div class="per-month">{{ '{amount} a month' | t: { amount: (p.perMonth | money) } }}</div> }
                    @if (p.description) { <p class="plan-desc">{{ p.description }}</p> }
                    <span class="grow"></span>
                    @if (d.canPay && d.canPayOnline) {
                      <button mat-flat-button class="bkash" (click)="pay(p)" [disabled]="busy()">
                        <span class="bkash-mark">b</span>{{ 'Pay with bKash' | t }}
                      </button>
                    }
                  </section>
                }
              </div>
              @if (!d.canPay) {
                <p class="note"><mat-icon>info</mat-icon>{{ 'Only an admin of your business can pay. Please ask your admin.' | t }}</p>
              } @else if (!d.canPayOnline) {
                <p class="note"><mat-icon>info</mat-icon>{{ 'Online payment is not available yet. Please contact us to pay.' | t }}</p>
              }
            }
          }
        }

        <!-- ---------------------------------------------------------- help -->
        @if (!inApp && (d.supportPhone || d.supportEmail)) {
          <p class="help"><mat-icon>support_agent</mat-icon>
            <span>{{ 'Questions about billing?' | t }}
              @if (d.supportPhone) { <a [href]="'tel:' + d.supportPhone">{{ d.supportPhone }}</a> }
              @if (d.supportPhone && d.supportEmail) { · }
              @if (d.supportEmail) { <a [href]="'mailto:' + d.supportEmail">{{ d.supportEmail }}</a> }
            </span>
          </p>
        }

        <!-- ---------------------------------------------------------- history -->
        @if (d.canPay) {
          <section class="card history">
            <h2 class="card-title pad">{{ 'Payment history' | t }}</h2>
            @for (p of payments(); track p.uuid) {
              <div class="pay-row">
                <div class="pay-main">
                  <div class="pay-title">{{ p.planName }} · {{ length(p.durationMonths) }} <app-status [value]="p.status" /></div>
                  <div class="muted small">
                    {{ p.createdDate | date: 'd MMM yyyy, h:mm a' }} · <span class="mono">{{ p.invoiceNumber }}</span>
                    @if (p.provider === 'BKASH') { · bKash }
                    @if (p.trxId) { · {{ 'TrxID {id}' | t: { id: p.trxId } }} }
                    @if (p.periodEnd) { · {{ 'covers until {date}' | t: { date: (p.periodEnd | date: 'd MMM yyyy') } }} }
                  </div>
                  @if (p.status === 'FAILED' && p.statusMessage) { <div class="negative small">{{ p.statusMessage }}</div> }
                </div>
                <div class="pay-side">
                  <strong class="nowrap">{{ p.amount | money }}</strong>
                  @if (!inApp && p.status === 'INITIATED' && p.provider === 'BKASH') {
                    <button mat-stroked-button (click)="verify(p)" [disabled]="busy()" [matTooltip]="'Ask bKash whether this payment went through' | t">{{ 'Check again' | t }}</button>
                  }
                </div>
              </div>
            } @empty {
              <div class="empty">{{ 'No payments yet.' | t }}</div>
            }
          </section>
        }
      }
    </div>
  `,
  styles: `
    .status { display: flex; gap: 16px; padding: 22px 24px; margin-bottom: 20px; border-left: 4px solid var(--erp-brand); }
    .status.good { border-left-color: var(--erp-positive); }
    .status.warn { border-left-color: var(--erp-warning); }
    .status.danger { border-left-color: var(--erp-negative); }
    .status-icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .good .status-icon { background: var(--erp-tint-teal-bg); color: var(--erp-tint-teal-fg); }
    .warn .status-icon { background: var(--erp-tint-amber-bg); color: var(--erp-tint-amber-fg); }
    .danger .status-icon { background: var(--erp-tint-rose-bg); color: var(--erp-tint-rose-fg); }
    .status-body { flex: 1; min-width: 0; }
    .status-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .status h2 { margin: 0; font-size: 20px; font-weight: 700; }
    .status-line { margin: 6px 0 12px; color: var(--erp-muted); font-size: 14px; line-height: 1.5; }
    .facts { display: flex; gap: 8px 24px; flex-wrap: wrap; font-size: 13.5px; }
    .facts .k { color: var(--erp-muted); margin-right: 4px; }
    .mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
    .size-pick { margin-bottom: 20px; }
    .size-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .size-row mat-form-field { min-width: 260px; }
    .section-head { margin: 4px 0 12px; }
    .section-title { font-size: 17px; font-weight: 700; margin: 0 0 4px; }
    .small { font-size: 12.5px; line-height: 1.5; }
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
    .plan { position: relative; display: flex; flex-direction: column; padding: 20px; gap: 2px; }
    .plan.current { border-color: var(--erp-brand); box-shadow: 0 0 0 1px var(--erp-brand) inset; }
    .badge { position: absolute; top: 14px; right: 14px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--erp-brand); color: var(--erp-brand-fg); }
    .plan-name { font-size: 16px; font-weight: 700; }
    .plan-length { font-size: 13px; color: var(--erp-muted); }
    .price { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin-top: 10px; font-variant-numeric: tabular-nums; }
    .per-month { font-size: 12.5px; color: var(--erp-muted); }
    .plan-desc { margin: 10px 0 0; font-size: 13px; color: var(--erp-muted); line-height: 1.45; }
    .grow { flex: 1; min-height: 14px; }
    .bkash { background: #e2136e !important; color: #fff !important; height: 44px; font-weight: 650; }
    .bkash-mark { display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 8px; border-radius: 6px; background: #fff; color: #e2136e; font-weight: 800; font-size: 14px; }
    .note, .help { display: flex; align-items: center; gap: 8px; color: var(--erp-muted); font-size: 13px; margin: 14px 2px 0; }
    .note mat-icon, .help mat-icon { font-size: 18px; width: 18px; height: 18px; flex: none; }
    .help a { color: var(--erp-brand); font-weight: 550; text-decoration: none; }
    .history { margin-top: 24px; padding-bottom: 6px; }
    .pad { padding: 18px 20px 6px; margin: 0; }
    .pay-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--erp-border); }
    .pay-row:first-of-type { border-top: 0; }
    .pay-title { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pay-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .empty { padding: 18px 20px; color: var(--erp-muted); }
    @media (max-width: 600px) {
      .status { padding: 16px; gap: 12px; }
      .status-icon { width: 40px; height: 40px; }
      .plans { grid-template-columns: 1fr; }
      .pay-row { padding: 12px 14px; }
    }
  `,
})
export class BillingPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly store = inject(BillingStore);
  private readonly notify = inject(NotifyService);
  private readonly platform = inject(PlatformService);
  /** Inside the Android app: no packages, prices or paying (see the class comment). */
  readonly inApp = this.platform.isNative;

  readonly data = signal<BillingOverview | null>(null);
  readonly payments = signal<BillingPayment[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  sizeChoice: string | null = null;
  private resumeListener: PluginListenerHandle | null = null;

  readonly statusTone = computed(() => {
    switch (this.data()?.status.state) {
      case 'ACTIVE': return 'good';
      case 'GRACE_PERIOD': return 'warn';
      case 'EXPIRED': return 'danger';
      default: return '';
    }
  });

  readonly statusIcon = computed(() => (STATE_ICONS[this.data()?.status.state ?? ''] ?? STATE_ICONS['NOT_BILLED']).icon);

  ngOnInit(): void {
    this.load();
    // In the Android app, refresh when the person comes back (a renewal made on the website shows at once).
    if (this.platform.isNative) {
      void CapacitorApp.addListener('resume', () => this.load()).then((h) => (this.resumeListener = h));
    }
  }

  ngOnDestroy(): void {
    void this.resumeListener?.remove();
  }

  length(months: number): string {
    return durationLabel(months);
  }

  load(): void {
    this.loading.set(true);
    this.api.get<BillingOverview>('/billing').subscribe({
      next: (d) => {
        this.data.set(d);
        this.store.set(d.status);
        this.error.set(null);
        this.loading.set(false);
        if (d.canPay) this.loadPayments();
      },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load billing.'); this.loading.set(false); },
    });
  }

  private loadPayments(): void {
    this.api.get<Paged<BillingPayment>>('/billing/payments', { page: 1, pageSize: 20 }).subscribe({
      next: (p) => this.payments.set(p.items),
      error: () => this.payments.set([]),
    });
  }

  saveSize(): void {
    this.busy.set(true);
    this.api.post<BillingOverview>('/billing/size', { sizeUuid: this.sizeChoice }).subscribe({
      next: (d) => { this.data.set(d); this.busy.set(false); this.notify.success('Business size saved.'); },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }

  /** Starts the bKash payment and opens bKash's page; bKash brings the payer back to the result page. */
  pay(plan: PlanOption): void {
    this.busy.set(true);
    this.api.post<{ redirectUrl: string; invoiceNumber: string }>('/billing/checkout', { planUuid: plan.uuid }).subscribe({
      next: (r) => { window.location.href = r.redirectUrl; },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }

  verify(p: BillingPayment): void {
    this.busy.set(true);
    this.api.post<BillingPayment>(`/billing/payments/${p.uuid}/verify`).subscribe({
      next: (updated) => {
        this.busy.set(false);
        if (updated.status === 'COMPLETED') this.notify.success('Payment confirmed. Thank you!');
        else if (updated.status === 'INITIATED') this.notify.success('bKash has not confirmed this payment yet. Try again in a few minutes.');
        else this.notify.error('bKash says this payment did not go through.');
        this.load();
      },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }
}
