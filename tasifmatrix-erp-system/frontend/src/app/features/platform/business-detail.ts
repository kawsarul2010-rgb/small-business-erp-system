import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ApiService, problemOf } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { BillingPayment, BusinessAdmin, BusinessDetail, BusinessSmsUsage, BusinessSubscription, IssuedCredentials, Paged } from '../../core/models';
import { ManualPaymentDialog, SubscriptionDialog } from './subscription-dialogs';
import { SpecialPricesDialog } from './special-prices-dialog';
import { NotifyService } from '../../core/notify.service';
import { StatusChip } from '../../shared/status-chip';
import { MoneyPipe } from '../../shared/pipes';
import { AddAdminDialog, BusinessDialog, SuspendDialog, showCredentials } from './platform-dialogs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';

/** One business, as the super admin sees it: its account, its usage and its admins. */
@Component({
  selector: 'app-business-detail',
  imports: [TranslatePipe, MoneyPipe, DatePipe, DecimalPipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, MatTooltipModule, StatusChip],
  template: `
    <div class="page">
      @if (!layout.isHandset()) { <a routerLink="/platform/businesses" class="back-link">{{ 'Businesses' | t }}</a> }

      @if (loading() && !business()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @if (business(); as b) {
        <div class="page-header">
          <div>
            <h1>{{ b.name }} <app-status [value]="b.status" /></h1>
            <div class="subtitle">{{ 'Business code' | t }} <span class="code">{{ b.code }}</span> · {{ 'since {date}' | t: { date: (b.createdDate | date: 'd MMM yyyy') } }}</div>
          </div>
          <div class="actions">
            @if (b.status === 'CLOSED') {
            } @else if (layout.isHandset()) {
              <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Actions' | t"><mat-icon>more_vert</mat-icon></button>
            } @else {
              <button mat-stroked-button (click)="edit(b)"><mat-icon>edit</mat-icon>{{ 'Edit' | t }}</button>
              @if (b.status === 'ACTIVE') {
                <button mat-stroked-button class="warn-text" (click)="suspend(b)"><mat-icon>block</mat-icon>{{ 'Suspend' | t }}</button>
              } @else {
                <button mat-flat-button (click)="activate(b)"><mat-icon>check_circle</mat-icon>{{ 'Reactivate' | t }}</button>
              }
            }
            <mat-menu #menu="matMenu" xPosition="before">
              <button mat-menu-item (click)="edit(b)"><mat-icon>edit</mat-icon>{{ 'Edit' | t }}</button>
              <button mat-menu-item (click)="addAdmin(b)"><mat-icon>person_add</mat-icon>{{ 'Add admin' | t }}</button>
              @if (b.status === 'ACTIVE') {
                <button mat-menu-item (click)="suspend(b)"><mat-icon>block</mat-icon>{{ 'Suspend' | t }}</button>
              } @else {
                <button mat-menu-item (click)="activate(b)"><mat-icon>check_circle</mat-icon>{{ 'Reactivate' | t }}</button>
              }
            </mat-menu>
          </div>
        </div>
        @if (busy()) { <mat-progress-bar mode="indeterminate" class="busy" /> }

        @if (b.status === 'CLOSED') {
          <div class="card card-pad suspended">
            <mat-icon>delete_forever</mat-icon>
            <div>
              <strong>{{ (b.closedDate ? 'Closed on {date}.' : 'Closed.') | t: { date: (b.closedDate | date: 'd MMM yyyy') } }}</strong>
              {{ 'Its only admin deleted their account, which closed the business: its records and accounts were deleted. Its subscription payments are kept. It cannot be reopened.' | t }}
            </div>
          </div>
        }
        @if (b.status === 'SUSPENDED') {
          <div class="card card-pad suspended">
            <mat-icon>block</mat-icon>
            <div>
              <strong>{{ (b.suspendedDate ? 'Suspended on {date}.' : 'Suspended.') | t: { date: (b.suspendedDate | date: 'd MMM yyyy') } }}</strong>
              {{ 'Nobody in this business can sign in. Reason: {reason}' | t: { reason: b.suspendReason } }}
            </div>
          </div>
        }

        <div class="stats">
          <div class="card stat"><span class="label">{{ 'Active users' | t }}</span><strong>{{ b.usage.activeUsers }}</strong></div>
          <div class="card stat"><span class="label">{{ 'Companies' | t }}</span><strong>{{ b.usage.companies }}</strong></div>
          <div class="card stat"><span class="label">{{ 'Orders this month' | t }}</span><strong>{{ b.usage.ordersThisMonth }}</strong>
            <span class="hint">{{ '{sales} sales · {purchases} purchase in total' | t: { sales: b.usage.salesOrders, purchases: b.usage.purchaseOrders } }}</span></div>
          <div class="card stat"><span class="label">{{ 'Last activity' | t }}</span>
            <strong class="small">{{ b.usage.lastOrderDate ? (b.usage.lastOrderDate | date: 'd MMM yyyy') : ('No orders yet' | t) }}</strong>
            <span class="hint">{{ (b.usage.lastSignInDate ? 'Last sign-in {date}' : 'Last sign-in never') | t: { date: (b.usage.lastSignInDate | date: 'd MMM, h:mm a') } }}</span></div>
          <div class="card stat"><span class="label">{{ 'SMS this month' | t }}</span><strong>{{ b.usage.smsPartsThisMonth }}</strong>
            <span class="hint">{{ 'Last month {n}' | t: { n: b.usage.smsPartsLastMonth } }}</span></div>
        </div>

        @if (b.subscription; as s) {
          <section class="card card-pad sub-card">
            <div class="section-head">
              <div>
                <h2 class="card-title">{{ 'Subscription' | t }}</h2>
                <div class="muted small">{{ 'What this business pays you for the app.' | t }}</div>
              </div>
              @if (b.status !== 'CLOSED') {
                <div class="sub-actions">
                  <button mat-stroked-button (click)="editSubscription(b, s)"><mat-icon>tune</mat-icon>{{ 'Change' | t }}</button>
                  @if (!s.billingExempt) { <button mat-flat-button (click)="recordPayment(b, s)"><mat-icon>add_card</mat-icon>{{ 'Record payment' | t }}</button> }
                </div>
              }
            </div>
            <div class="sub-grid">
              <div><span class="k">{{ 'Status' | t }}</span>
                @if (s.billingExempt) { <span class="exempt">{{ 'Never billed' | t }}</span> } @else { <app-status [value]="s.status.state" /> }
              </div>
              <div><span class="k">{{ (s.status.onTrial ? 'Trial until' : 'Paid until') | t }}</span>
                <strong>{{ s.status.endsAt ? (s.status.endsAt | date: 'd MMM yyyy') : '—' }}</strong>
                @if (s.status.daysLeft !== null && (s.status.state === 'TRIAL' || s.status.state === 'ACTIVE')) { <span class="muted small">{{ '{n} days left' | t: { n: s.status.daysLeft } }}</span> }
                @if (s.status.state === 'GRACE_PERIOD') { <span class="negative small">{{ 'paused on {date}' | t: { date: (s.status.graceEndsAt | date: 'd MMM yyyy') } }}</span> }
              </div>
              <div><span class="k">{{ 'Business size' | t }}</span><strong>{{ s.sizeName ?? ('Not set' | t) }}</strong>
                @if (s.sizeCheck; as c) {
                  <span class="muted small">{{ '{n} orders a month' | t: { n: (c.ordersPerMonth | number) } }}@if (c.sizeLimit !== null) { · {{ 'limit {n}' | t: { n: (c.sizeLimit | number) } }} }</span>
                }
              </div>
              <div><span class="k">{{ 'Package' | t }}</span><strong>{{ s.planName ?? '—' }}</strong></div>
            </div>
            @if (s.sizeCheck; as c) {
              @if (c.overLimit && b.status !== 'CLOSED') {
                <div class="size-alert" [class.snoozed]="!c.alert">
                  <mat-icon>trending_up</mat-icon>
                  <div class="sa-text">
                    <strong>{{ 'Above the {size} limit' | t: { size: s.sizeName } }}</strong>
                    {{ '{n} orders a month on average over the last 3 months; {size} allows up to {limit}.' | t: { n: (c.ordersPerMonth | number), size: s.sizeName, limit: (c.sizeLimit | number) } }}
                    @if (c.snoozedUntil) { <span class="muted">{{ 'Kept as {size} until {date}.' | t: { size: s.sizeName, date: (c.snoozedUntil | date: 'd MMM yyyy') } }}</span> }
                    @if (s.billingExempt) { <span class="muted">{{ 'Never billed, so the size does not change what it pays.' | t }}</span> }
                  </div>
                  <div class="sa-actions">
                    @if (!c.snoozedUntil) { <button mat-stroked-button (click)="keepSize(b, s)" [disabled]="busy()">{{ 'Keep {size}' | t: { size: s.sizeName } }}</button> }
                    @if (c.suggestedSizeUuid) { <button mat-flat-button (click)="changeSize(b, c.suggestedSizeUuid, c.suggestedSizeName)" [disabled]="busy()">{{ 'Change to {size}' | t: { size: c.suggestedSizeName } }}</button> }
                  </div>
                </div>
              }
            }
            @if (s.prices?.length && !s.billingExempt) {
              <div class="special">
                <div class="special-head">
                  <span class="k">{{ 'Prices for this business' | t }}</span>
                  @if (b.status !== 'CLOSED') { <button mat-button (click)="editPrices(b, s)"><mat-icon>sell</mat-icon>{{ 'Special prices' | t }}</button> }
                </div>
                <div class="price-chips">
                  @for (p of s.prices!; track p.planUuid) {
                    @if (p.specialPrice !== null || (p.sizePrice !== null && p.isActive)) {
                      <span class="price-chip" [class.special-chip]="p.specialPrice !== null">
                        {{ p.planName }}:
                        @if (p.specialPrice !== null) {
                          <strong>{{ p.specialPrice | money }}</strong>
                          @if (p.sizePrice !== null) { <s class="muted">{{ p.sizePrice | money }}</s> }
                        } @else { {{ p.sizePrice | money }} }
                      </span>
                    }
                  }
                </div>
              </div>
            }
            @if (payments().length > 0) {
              <div class="sub-payments">
                @for (p of payments(); track p.uuid) {
                  <div class="sub-pay">
                    <span>{{ p.createdDate | date: 'd MMM yyyy' }} · {{ p.planName }} · {{ p.provider === 'BKASH' ? 'bKash' : ('By hand' | t) }}@if (p.trxId) { · {{ p.trxId }} }</span>
                    <span class="nowrap"><app-status [value]="p.status" /> <strong>{{ p.amount | money }}</strong></span>
                  </div>
                }
              </div>
            }
          </section>
        }

        <div class="grid-2">
          <div class="card card-pad">
            <h2 class="card-title">{{ 'Account' | t }}</h2>
            <dl class="facts">
              <dt>{{ 'Contact' | t }}</dt><dd>{{ b.contactName || '—' }}</dd>
              <dt>{{ 'Mobile' | t }}</dt><dd>{{ b.contactPhone || '—' }}</dd>
              <dt>{{ 'Email' | t }}</dt><dd>{{ b.contactEmail || '—' }}</dd>
              <dt>{{ 'Notes' | t }}</dt><dd class="notes">{{ b.notes || '—' }}</dd>
              <dt>{{ 'Last changed' | t }}</dt><dd>{{ '{date} by {name}' | t: { date: (b.updatedDate | date: 'd MMM yyyy, h:mm a'), name: b.updatedByUserName } }}</dd>
            </dl>
            <p class="muted privacy"><mat-icon>lock</mat-icon>{{ "You see this business's account and usage only. Its customers, prices, sales and payments are private to it." | t }}</p>
          </div>

          <div class="card card-pad">
            <div class="section-head">
              <h2 class="card-title">{{ 'Admins' | t }}</h2>
              @if (!layout.isHandset() && b.status !== 'CLOSED') { <button mat-stroked-button (click)="addAdmin(b)"><mat-icon>person_add</mat-icon>{{ 'Add admin' | t }}</button> }
            </div>
            @for (a of b.admins; track a.uuid) {
              <div class="admin-row">
                <div class="who">
                  <div class="name">{{ a.userName }}</div>
                  <div class="muted small">{{ a.email }} · {{ a.phoneNumber }}</div>
                  <div class="muted small">
                    @if (a.isLocked) { <span class="negative">{{ 'Locked after failed sign-ins' | t }} · </span> }
                    @if (a.mustChangePassword) { {{ 'Has not set their own password yet' | t }} }
                    @else { {{ (a.lastLoginDate ? 'Last sign-in {date}' : 'Last sign-in never') | t: { date: (a.lastLoginDate | date: 'd MMM yyyy') } }} }
                  </div>
                </div>
                <button mat-stroked-button (click)="resetPassword(b, a)" [disabled]="busy()" [matTooltip]="'Give a new temporary password, unlock and sign out everywhere' | t">
                  <mat-icon>lock_reset</mat-icon>{{ 'Reset password' | t }}
                </button>
              </div>
            } @empty {
              <p class="muted">{{ 'No active admin. Add one so the business can manage its account again.' | t }}</p>
            }
          </div>
        </div>

        <section class="card card-pad sms-card">
          <div class="section-head">
            <div>
              <h2 class="card-title">{{ 'SMS usage' | t }}</h2>
              <div class="muted small">
                @if (b.smsPrice !== null) { {{ 'Billed at {price} per SMS. Change the price with Edit.' | t: { price: (b.smsPrice | money) } }} }
                @else { {{ 'No SMS price set. Add one with Edit to see the amount to bill.' | t }} }
              </div>
              @if (!b.smsEnabledByBusiness) {
                <div class="sms-off-note"><mat-icon>speaker_notes_off</mat-icon>{{ 'This business has turned SMS off in its settings.' | t }}</div>
              }
            </div>
          </div>
          @if (sms(); as u) {
            <div class="table-wrap">
              <table class="sms-table">
                <thead>
                  <tr>
                    <th>{{ 'Month' | t }}</th>
                    <th class="num">{{ 'Messages' | t }}</th>
                    <th class="num">{{ 'SMS' | t }}</th>
                    @if (u.smsPrice !== null) { <th class="num">{{ 'Amount' | t }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (m of u.months; track m.month; let first = $first) {
                    <tr [class.current]="first">
                      <td>{{ m.month + '-01' | date: 'MMMM y' }}@if (first) { <span class="muted small"> · {{ 'so far' | t }}</span> }</td>
                      <td class="num">{{ m.messages }}</td>
                      <td class="num">{{ m.parts }}</td>
                      @if (u.smsPrice !== null) { <td class="num">{{ m.amount | money }}</td> }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="muted small sms-note">{{ 'Only messages the SMS gateway accepted are counted. A long message is charged as 2 or more SMS, as operators do.' | t }}</p>
          } @else {
            <mat-progress-bar mode="indeterminate" />
          }
        </section>
      }
    </div>
  `,
  styles: `
    .back-link { display: inline-block; margin-bottom: 8px; font-size: 13px; color: var(--erp-brand); text-decoration: none; font-weight: 550; }
    .back-link::before { content: '← '; }
    h1 app-status { vertical-align: middle; margin-left: 8px; }
    .size-alert { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-top: 14px; padding: 12px 14px; border-radius: 12px;
      background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); font-size: 13.5px; line-height: 1.5; }
    .size-alert.snoozed { background: var(--erp-card-2); color: var(--erp-text); border: 1px solid var(--erp-border); }
    .size-alert > mat-icon { flex: none; }
    .sa-text { flex: 1; min-width: 220px; }
    .sa-text strong { display: block; }
    .sa-text .muted { display: block; }
    .sa-actions { display: flex; gap: 8px; flex-wrap: wrap; align-self: center; }
    .special { margin-top: 14px; }
    .special-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .special-head .k { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--erp-faint); }
    .price-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .price-chip { padding: 3px 10px; border-radius: 999px; font-size: 12.5px; background: var(--erp-card-2); border: 1px solid var(--erp-border); }
    .price-chip s { margin-left: 4px; font-size: 11.5px; }
    .special-chip { background: var(--erp-chip-info-bg); color: var(--erp-chip-info-fg); border-color: transparent; }
    .code { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
    .busy { margin-bottom: 8px; }
    .suspended { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 16px; background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); border-color: transparent; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; }
    .stat .label { color: var(--erp-muted); font-size: 13px; }
    .stat strong { font-size: 22px; font-variant-numeric: tabular-nums; }
    .stat strong.small { font-size: 16px; }
    .stat .hint { font-size: 12px; color: var(--erp-muted); }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .section-head .card-title { margin: 0; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
    .facts dt { color: var(--erp-muted); }
    .facts dd { margin: 0; }
    .notes { white-space: pre-wrap; }
    .privacy { display: flex; gap: 8px; align-items: flex-start; margin: 16px 0 0; font-size: 12.5px; line-height: 1.45; }
    .privacy mat-icon { font-size: 18px; width: 18px; height: 18px; flex: none; }
    .admin-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--erp-border); }
    .admin-row:last-child { border-bottom: 0; }
    .admin-row .name { font-weight: 600; }
    .small { font-size: 12.5px; }
    .warn-text { color: var(--erp-negative); }
    .sms-card { margin-top: 16px; }
    .sub-card { margin-bottom: 16px; }
    .sub-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .sub-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 20px; margin-top: 8px; }
    .sub-grid > div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
    .sub-grid .k { font-size: 12px; color: var(--erp-muted); }
    .exempt { font-size: 12px; font-weight: 600; padding: 1px 10px; border-radius: 999px; background: var(--erp-chip-neutral-bg); color: var(--erp-chip-neutral-fg); }
    .sub-payments { margin-top: 14px; border-top: 1px solid var(--erp-border); }
    .sub-pay { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 13px; border-bottom: 1px dashed var(--erp-border); }
    .sub-pay:last-child { border-bottom: 0; }
    @media (max-width: 840px) { .sub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sub-pay { flex-direction: column; gap: 2px; } }
    .sms-off-note { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12.5px; font-weight: 600; color: var(--erp-chip-warn-fg); }
    .sms-off-note mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .sms-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .sms-table th { text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 12.5px; padding: 8px 10px; border-bottom: 1px solid var(--erp-border); }
    .sms-table td { padding: 9px 10px; border-bottom: 1px solid var(--erp-border); font-variant-numeric: tabular-nums; }
    .sms-table tr:last-child td { border-bottom: 0; }
    .sms-table .num { text-align: right; white-space: nowrap; }
    .sms-table tr.current td { font-weight: 600; }
    .sms-note { margin: 12px 0 0; }
    @media (max-width: 960px) { .grid-2 { grid-template-columns: 1fr; } }
    @media (max-width: 840px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .stat { padding: 12px; }
      .stat strong { font-size: 18px; }
      .admin-row { flex-direction: column; align-items: stretch; }
      .sms-table th, .sms-table td { padding-left: 6px; padding-right: 6px; }
    }
  `,
})
export class BusinessDetailPage implements OnInit {
  readonly id = input.required<string>();

  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly business = signal<BusinessDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly sms = signal<BusinessSmsUsage | null>(null);
  readonly payments = signal<BillingPayment[]>([]);

  ngOnInit(): void {
    this.load();
    this.loadSms();
    this.loadPayments();
  }

  private loadPayments(): void {
    this.api.get<Paged<BillingPayment>>('/platform/billing/payments', { businessUuid: this.id(), page: 1, pageSize: 5 }).subscribe({
      next: (p) => this.payments.set(p.items),
      error: () => this.payments.set([]),
    });
  }

  editPrices(b: BusinessDetail, s: BusinessSubscription): void {
    this.dialog.open(SpecialPricesDialog, this.layout.dialog({ business: b, subscription: s }, '560px')).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }

  changeSize(b: BusinessDetail, sizeUuid: string, sizeName: string | null): void {
    this.busy.set(true);
    this.api.put(`/platform/billing/businesses/${b.uuid}`, { sizeUuid }).subscribe({
      next: () => { this.busy.set(false); this.notify.success('{name} is now {size}.', { name: b.name, size: sizeName }); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }

  keepSize(b: BusinessDetail, s: BusinessSubscription): void {
    this.busy.set(true);
    this.api.post(`/platform/billing/businesses/${b.uuid}/keep-size`, { days: 30 }).subscribe({
      next: () => { this.busy.set(false); this.notify.success('{name} stays {size}. You will be reminded again in 30 days if it is still above the limit.', { name: b.name, size: s.sizeName }); this.load(); },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }

  editSubscription(b: BusinessDetail, s: BusinessSubscription): void {
    this.dialog.open(SubscriptionDialog, this.layout.dialog({ business: b, subscription: s }, '520px')).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }

  recordPayment(b: BusinessDetail, s: BusinessSubscription): void {
    this.dialog.open(ManualPaymentDialog, this.layout.dialog({ business: b, subscription: s }, '520px')).afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.load();
      this.loadPayments();
    });
  }

  loadSms(): void {
    this.api.get<BusinessSmsUsage>(`/platform/businesses/${this.id()}/sms-usage`, { months: 12 }).subscribe({
      next: (u) => this.sms.set(u),
      error: () => this.sms.set({ smsPrice: null, months: [] }),
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<BusinessDetail>(`/platform/businesses/${this.id()}`).subscribe({
      next: (b) => { this.business.set(b); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load the business.'); this.loading.set(false); },
    });
  }

  edit(b: BusinessDetail): void {
    this.dialog.open(BusinessDialog, this.layout.dialog(b, '600px')).afterClosed().subscribe((updated?: BusinessDetail) => {
      if (!updated) return;
      this.business.set(updated);
      this.loadSms();
    });
  }

  suspend(b: BusinessDetail): void {
    this.dialog.open(SuspendDialog, this.layout.dialog(b, '480px')).afterClosed().subscribe((updated?: BusinessDetail) => {
      if (updated) this.business.set(updated);
    });
  }

  activate(b: BusinessDetail): void {
    this.notify.confirm({
      title: t('Reactivate {name}', { name: b.name }),
      message: 'Its users can sign in again straight away, and everything is as they left it.',
      confirmText: 'Reactivate',
    }).subscribe((ok) => {
      if (!ok) return;
      this.busy.set(true);
      this.api.post<BusinessDetail>(`/platform/businesses/${b.uuid}/activate`, { revision: b.revision }).subscribe({
        next: (updated) => { this.business.set(updated); this.busy.set(false); this.notify.success('{name} is active again.', { name: b.name }); },
        error: (e) => { this.busy.set(false); this.notify.error(e); this.reloadOnConflict(e); },
      });
    });
  }

  addAdmin(b: BusinessDetail): void {
    this.dialog.open(AddAdminDialog, this.layout.dialog(b, '520px')).afterClosed().subscribe((credentials?: IssuedCredentials) => {
      if (!credentials) return;
      this.load();
      showCredentials(this.dialog, this.layout, { credentials, businessName: b.name, businessCode: b.code });
    });
  }

  resetPassword(b: BusinessDetail, a: BusinessAdmin): void {
    this.notify.confirm({
      title: t("Reset {name}'s password", { name: a.userName }),
      message: t('{name} gets a new temporary password, is unlocked, and is signed out on every device. You will see the password once.', { name: a.userName }),
      confirmText: 'Reset password',
    }).subscribe((ok) => {
      if (!ok) return;
      this.busy.set(true);
      this.api.post<IssuedCredentials>(`/platform/businesses/${b.uuid}/admins/${a.uuid}/reset-password`).subscribe({
        next: (credentials) => {
          this.busy.set(false);
          this.load();
          showCredentials(this.dialog, this.layout, { credentials, businessName: b.name, businessCode: b.code });
        },
        error: (e) => { this.busy.set(false); this.notify.error(e); },
      });
    });
  }

  private reloadOnConflict(e: unknown): void {
    if (problemOf(e).code === 'REVISION_CONFLICT') this.load();
  }
}
