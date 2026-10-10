import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { durationLabel } from '../../core/billing';
import { LayoutService } from '../../core/layout.service';
import { BillingPayment, BillingPaymentStatus, BillingSettings, Paged, PlanAdmin, SizeAdmin } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { PasswordToggle } from '../../shared/password-toggle';
import { MoneyPipe } from '../../shared/pipes';
import { StatusChip } from '../../shared/status-chip';

/**
 * The super admin's subscription centre: the billing switches (trial, grace, reminders), the bKash
 * merchant account, the packages with a price per business size, the sizes, and every payment.
 */
@Component({
  selector: 'app-platform-billing',
  imports: [TranslatePipe, DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule, MatTabsModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule, MatTooltipModule, MoneyPipe, StatusChip, PasswordToggle],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Subscriptions' | t }}</h1>
          <div class="subtitle">{{ 'How businesses pay you: packages and prices by business size, free trial, grace days, the bKash account, and every payment.' | t }}</div>
        </div>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      <mat-tab-group mat-stretch-tabs="false" animationDuration="150ms" [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)">
        <!-- ======================================================== settings -->
        <mat-tab [label]="'Billing' | t">
          <div class="tab-body">
            <form class="card card-pad" [formGroup]="settingsForm" (ngSubmit)="saveSettings()">
              <div class="switch-row" [class.off]="!settingsForm.controls.billingEnabled.value">
                <mat-icon>{{ settingsForm.controls.billingEnabled.value ? 'credit_card' : 'credit_card_off' }}</mat-icon>
                <div class="switch-text">
                  <span class="switch-title">{{ 'Charge businesses for the app' | t }}</span>
                  <span class="switch-hint">{{ (settingsForm.controls.billingEnabled.value ? 'On: businesses get a free trial, then pay for a package. Unpaid businesses are paused after the extra days.' : 'Off: every business uses the app for free and nobody is reminded or paused.') | t }}</span>
                </div>
                <mat-slide-toggle formControlName="billingEnabled" [attr.aria-label]="'Charge businesses for the app' | t" />
              </div>
              @if (settingsForm.controls.billingEnabled.value && !settings()?.billingEnabled) {
                <p class="heads-up"><mat-icon>info</mat-icon>{{ 'When you save, every business that has not had a trial yet starts its free trial today. Mark your own or partner businesses as "Never billed" on their page.' | t }}</p>
              }

              <div class="form-grid three">
                <mat-form-field>
                  <mat-label>{{ 'Free trial' | t }}</mat-label>
                  <input matInput type="number" min="0" max="365" formControlName="trialDays" />
                  <span matTextSuffix>{{ 'days' | t }}</span>
                  <mat-hint>{{ 'For new businesses. 0 = no trial.' | t }}</mat-hint>
                  <mat-error>{{ err(settingsForm, 'trialDays', 'Free trial') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Extra days after expiry' | t }}</mat-label>
                  <input matInput type="number" min="0" max="60" formControlName="graceDays" />
                  <span matTextSuffix>{{ 'days' | t }}</span>
                  <mat-hint>{{ 'Still working, with a warning to pay.' | t }}</mat-hint>
                  <mat-error>{{ err(settingsForm, 'graceDays', 'Extra days') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Remind before the end' | t }}</mat-label>
                  <input matInput type="number" min="0" max="60" formControlName="reminderDays" />
                  <span matTextSuffix>{{ 'days' | t }}</span>
                  <mat-hint>{{ 'When the reminder banner appears.' | t }}</mat-hint>
                  <mat-error>{{ err(settingsForm, 'reminderDays', 'Reminder') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Support phone' | t }}</mat-label>
                  <input matInput formControlName="supportPhone" inputmode="tel" />
                  <mat-hint>{{ 'Shown on the Billing page.' | t }}</mat-hint>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Support email' | t }}</mat-label>
                  <input matInput formControlName="supportEmail" type="email" />
                  <mat-error>{{ err(settingsForm, 'supportEmail', 'Support email') }}</mat-error>
                </mat-form-field>
              </div>
              <div class="timeline">
                <span class="step"><b>{{ 'Trial' | t }}</b> {{ '{n} days' | t: { n: settingsForm.controls.trialDays.value } }}</span>
                <mat-icon>arrow_forward</mat-icon>
                <span class="step"><b>{{ 'Paid package' | t }}</b> {{ 'reminder {n} days before the end' | t: { n: settingsForm.controls.reminderDays.value } }}</span>
                <mat-icon>arrow_forward</mat-icon>
                <span class="step warn"><b>{{ 'Grace period' | t }}</b> {{ '{n} more days with a warning' | t: { n: settingsForm.controls.graceDays.value } }}</span>
                <mat-icon>arrow_forward</mat-icon>
                <span class="step danger"><b>{{ 'Paused' | t }}</b> {{ 'only Billing works' | t }}</span>
              </div>
              @if (settingsError()) { <p class="negative">{{ settingsError() | t }}</p> }
              <div class="form-actions">
                @if (settings(); as s) { <span class="muted small">{{ 'Last changed {date} by {name}' | t: { date: (s.updatedDate | date: 'd MMM yyyy, h:mm a'), name: s.updatedByUserName } }}</span> }
                <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
              </div>
            </form>
          </div>
        </mat-tab>

        <!-- ======================================================== bKash -->
        <mat-tab [label]="'bKash' | t">
          <div class="tab-body">
            <form class="card card-pad" [formGroup]="bkashForm" (ngSubmit)="saveBkash()">
              <div class="bkash-head">
                <span class="bkash-logo">b</span>
                <div>
                  <h2 class="card-title">{{ 'bKash payment gateway' | t }}</h2>
                  <p class="muted small">{{ 'Your bKash merchant account for Tokenized Checkout. bKash gives you these four values when the account is approved for online payments.' | t }}</p>
                </div>
                @if (settings()?.bkashReady) { <span class="ready"><mat-icon>check_circle</mat-icon>{{ 'Ready' | t }}</span> }
              </div>

              <div class="switch-row" [class.off]="!bkashForm.controls.bkashEnabled.value">
                <mat-icon>{{ bkashForm.controls.bkashEnabled.value ? 'payments' : 'money_off' }}</mat-icon>
                <div class="switch-text">
                  <span class="switch-title">{{ 'Take payments with bKash' | t }}</span>
                  <span class="switch-hint">{{ 'Businesses see "Pay with bKash" on their Billing page.' | t }}</span>
                </div>
                <mat-slide-toggle formControlName="bkashEnabled" [attr.aria-label]="'Take payments with bKash' | t" />
              </div>

              <div class="mode">
                <span class="mode-label">{{ 'Mode' | t }}</span>
                <mat-button-toggle-group formControlName="bkashSandbox" hideSingleSelectionIndicator>
                  <mat-button-toggle [value]="true">{{ 'Sandbox (test)' | t }}</mat-button-toggle>
                  <mat-button-toggle [value]="false">{{ 'Live' | t }}</mat-button-toggle>
                </mat-button-toggle-group>
                <span class="muted small">{{ (bkashForm.controls.bkashSandbox.value ? 'Test payments with bKash test wallets; no real money moves.' : 'Real payments into your merchant account.') | t }}</span>
              </div>

              <div class="form-grid">
                <mat-form-field>
                  <mat-label>{{ 'App key' | t }}</mat-label>
                  <input matInput formControlName="bkashAppKey" autocomplete="off" spellcheck="false" />
                  <mat-error>{{ err(bkashForm, 'bkashAppKey', 'App key') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'App secret' | t }}</mat-label>
                  <input matInput #secret type="password" formControlName="bkashAppSecret" autocomplete="new-password"
                         [placeholder]="(settings()?.hasBkashAppSecret ? 'Saved - leave empty to keep' : '') | t" />
                  <app-password-toggle matSuffix [for]="secret" />
                  <mat-error>{{ err(bkashForm, 'bkashAppSecret', 'App secret') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Username' | t }}</mat-label>
                  <input matInput formControlName="bkashUsername" autocomplete="off" spellcheck="false" />
                  <mat-error>{{ err(bkashForm, 'bkashUsername', 'Username') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>{{ 'Password' | t }}</mat-label>
                  <input matInput #pw type="password" formControlName="bkashPassword" autocomplete="new-password"
                         [placeholder]="(settings()?.hasBkashPassword ? 'Saved - leave empty to keep' : '') | t" />
                  <app-password-toggle matSuffix [for]="pw" />
                  <mat-error>{{ err(bkashForm, 'bkashPassword', 'Password') }}</mat-error>
                </mat-form-field>
              </div>
              <p class="muted small secure"><mat-icon>lock</mat-icon>{{ 'The app secret and password are stored encrypted and are never shown again.' | t }}</p>
              <div class="callback">
                <span class="k">{{ 'Callback URL (give this to bKash if they ask)' | t }}</span>
                <code>{{ callbackUrl }}</code>
              </div>
              @if (bkashError()) { <p class="negative">{{ bkashError() | t }}</p> }
              <div class="form-actions">
                <button mat-stroked-button type="button" (click)="testBkash()" [disabled]="busy()"><mat-icon>wifi_tethering</mat-icon>{{ 'Test connection' | t }}</button>
                <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
              </div>
            </form>
          </div>
        </mat-tab>

        <!-- ======================================================== packages -->
        <mat-tab [label]="'Packages' | t">
          <div class="tab-body">
            <div class="tab-head">
              <p class="muted small">{{ 'A package is how long one payment lasts. Set its price for each business size; leave a price empty to not offer that package to that size. A free trial is not a package - set it on the Billing tab.' | t }}</p>
              <button mat-flat-button (click)="editPlan()"><mat-icon>add</mat-icon>{{ 'New package' | t }}</button>
            </div>
            <div class="card table-wrap">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>{{ 'Package' | t }}</th>
                    <th>{{ 'Length' | t }}</th>
                    @for (z of activeSizes(); track z.uuid) { <th class="num">{{ z.name }}</th> }
                    <th>{{ 'Status' | t }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of plans(); track p.uuid) {
                    <tr [class.inactive]="!p.isActive">
                      <td><strong>{{ p.name }}</strong>@if (p.description) { <div class="muted small">{{ p.description }}</div> }</td>
                      <td class="nowrap">{{ length(p.durationMonths) }}</td>
                      @for (z of activeSizes(); track z.uuid) {
                        <td class="num nowrap">@if (priceOf(p, z.uuid); as price) { {{ price | money }} } @else if (priceOf(p, z.uuid) === 0) { {{ 'Free' | t }} } @else { <span class="muted">-</span> }</td>
                      }
                      <td><app-status [value]="p.isActive ? 'ACTIVE' : 'INACTIVE'" /></td>
                      <td class="num"><button mat-icon-button (click)="editPlan(p)" [matTooltip]="'Edit' | t"><mat-icon>edit</mat-icon></button></td>
                    </tr>
                  } @empty {
                    <tr><td [attr.colspan]="4 + activeSizes().length" class="empty">{{ 'No packages yet.' | t }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <!-- ======================================================== sizes -->
        <mat-tab [label]="'Business sizes' | t">
          <div class="tab-body">
            <div class="tab-head">
              <p class="muted small">{{ 'Businesses choose their size when they sign up; prices depend on it. You can change a business\\'s size on its page.' | t }}
                {{ 'Set the most orders a month for each size: a business above its limit (average of the last 3 months) is flagged on the Businesses page.' | t }}</p>
              <button mat-flat-button (click)="editSize()"><mat-icon>add</mat-icon>{{ 'New size' | t }}</button>
            </div>
            <div class="card table-wrap">
              <table class="grid-table">
                <thead><tr><th>{{ 'Size' | t }}</th><th>{{ 'Description' | t }}</th><th class="num">{{ 'Orders a month, up to' | t }}</th><th class="num">{{ 'Businesses' | t }}</th><th>{{ 'Status' | t }}</th><th></th></tr></thead>
                <tbody>
                  @for (z of sizes(); track z.uuid) {
                    <tr [class.inactive]="!z.isActive">
                      <td><strong>{{ z.name }}</strong></td>
                      <td class="muted">{{ z.description }}</td>
                      <td class="num nowrap">@if (z.maxOrdersPerMonth !== null) { {{ z.maxOrdersPerMonth | number }} } @else { <span class="muted">{{ 'No limit' | t }}</span> }</td>
                      <td class="num">{{ z.businesses }}</td>
                      <td><app-status [value]="z.isActive ? 'ACTIVE' : 'INACTIVE'" /></td>
                      <td class="num"><button mat-icon-button (click)="editSize(z)" [matTooltip]="'Edit' | t"><mat-icon>edit</mat-icon></button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="empty">{{ 'No sizes yet.' | t }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <!-- ======================================================== payments -->
        <mat-tab [label]="'Payments' | t">
          <div class="tab-body">
            <div class="tab-head">
              <mat-button-toggle-group [value]="paymentFilter()" (change)="filterPayments($event.value)" hideSingleSelectionIndicator>
                <mat-button-toggle [value]="null">{{ 'All' | t }}</mat-button-toggle>
                <mat-button-toggle value="COMPLETED">{{ 'Completed' | t }}</mat-button-toggle>
                <mat-button-toggle value="INITIATED">{{ 'Waiting' | t }}</mat-button-toggle>
                <mat-button-toggle value="FAILED">{{ 'Failed' | t }}</mat-button-toggle>
              </mat-button-toggle-group>
              <span class="muted small">{{ '{n} payments' | t: { n: paymentTotal() } }}</span>
            </div>
            <div class="card">
              @for (p of payments(); track p.uuid) {
                <div class="pay-row">
                  <div class="pay-main">
                    <div class="pay-title">
                      <a [routerLink]="['/platform/businesses', p.businessUuid]">{{ p.businessName }}</a>
                      <span class="muted">· {{ p.planName }}@if (p.sizeName) { ({{ p.sizeName }}) }</span>
                      <app-status [value]="p.status" />
                    </div>
                    <div class="muted small">
                      {{ p.createdDate | date: 'd MMM yyyy, h:mm a' }} · <span class="mono">{{ p.invoiceNumber }}</span> ·
                      {{ p.provider === 'BKASH' ? 'bKash' : ('Recorded by hand' | t) }}
                      @if (p.trxId) { · TrxID {{ p.trxId }} }
                      @if (p.payerAccount) { · {{ p.payerAccount }} }
                      @if (p.note) { · {{ p.note }} }
                    </div>
                    @if (p.status !== 'COMPLETED' && p.statusMessage) { <div class="small negative">{{ p.statusMessage }}</div> }
                  </div>
                  <div class="pay-side">
                    <strong class="nowrap">{{ p.amount | money }}</strong>
                    @if (p.status === 'INITIATED' && p.provider === 'BKASH') {
                      <button mat-stroked-button (click)="verify(p)" [disabled]="busy()">{{ 'Check again' | t }}</button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="empty">{{ 'No payments yet.' | t }}</div>
              }
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .tab-body { padding: 18px 0 8px; }
    .tab-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .tab-head p { margin: 0; max-width: 80ch; }
    .small { font-size: 12.5px; line-height: 1.5; }
    .form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; }
    .heads-up { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0 0; padding: 10px 12px; border-radius: var(--erp-radius-sm);
      background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); font-size: 13px; line-height: 1.45; }
    .heads-up mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; }
    .timeline { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; margin: 8px 0 4px; font-size: 12.5px; }
    .timeline mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--erp-faint); }
    .step { padding: 4px 10px; border-radius: 999px; background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .step.warn { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .step.danger { background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); }
    .form-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
    .form-actions .muted { margin-right: auto; }
    .bkash-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
    .bkash-head > div { flex: 1; }
    .bkash-head .card-title { margin: 0 0 2px; }
    .bkash-head p { margin: 0; }
    .bkash-logo { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: #e2136e; color: #fff; font-weight: 800; font-size: 22px; }
    .ready { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--erp-positive); }
    .ready mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .mode { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin: 16px 0 18px; }
    .mode-label { font-weight: 600; font-size: 13.5px; }
    .secure { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; }
    .secure mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .callback { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; padding: 10px 12px; border-radius: var(--erp-radius-sm); background: var(--erp-card-2); border: 1px solid var(--erp-border); }
    .callback .k { color: var(--erp-muted); }
    .callback code { word-break: break-all; font-size: 12.5px; }
    .grid-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .grid-table th { text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--erp-muted); padding: 12px 14px; border-bottom: 1px solid var(--erp-border); }
    .grid-table td { padding: 12px 14px; border-bottom: 1px solid var(--erp-border); vertical-align: top; }
    .grid-table tr:last-child td { border-bottom: 0; }
    .grid-table .num { text-align: right; }
    .grid-table tr.inactive td { opacity: .6; }
    .empty { padding: 18px 20px; color: var(--erp-muted); }
    .pay-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--erp-border); }
    .pay-row:first-child { border-top: 0; }
    .pay-title { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-weight: 600; }
    .pay-title a { color: inherit; text-decoration: none; }
    .pay-title a:hover { text-decoration: underline; }
    .pay-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
    @media (max-width: 840px) {
      .form-grid.three { grid-template-columns: 1fr; }
      .pay-row { padding: 12px 14px; }
    }
  `,
})
export class PlatformBillingPage implements OnInit {
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder);

  readonly tab = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly settings = signal<BillingSettings | null>(null);
  readonly sizes = signal<SizeAdmin[]>([]);
  readonly activeSizes = computed(() => this.sizes().filter((z) => z.isActive));
  readonly plans = signal<PlanAdmin[]>([]);
  readonly payments = signal<BillingPayment[]>([]);
  readonly paymentTotal = signal(0);
  readonly paymentFilter = signal<BillingPaymentStatus | null>(null);
  readonly settingsError = signal<string | null>(null);
  readonly bkashError = signal<string | null>(null);
  readonly callbackUrl = `${location.origin}/api/v1/billing/bkash/callback`;

  readonly settingsForm = this.fb.nonNullable.group({
    billingEnabled: [false],
    trialDays: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    graceDays: [7, [Validators.required, Validators.min(0), Validators.max(60)]],
    reminderDays: [7, [Validators.required, Validators.min(0), Validators.max(60)]],
    supportPhone: [''],
    supportEmail: ['', Validators.email],
  });

  readonly bkashForm = this.fb.nonNullable.group({
    bkashEnabled: [false],
    bkashSandbox: [true],
    bkashAppKey: [''],
    bkashAppSecret: [''],
    bkashUsername: [''],
    bkashPassword: [''],
  });

  ngOnInit(): void {
    this.loadAll();
  }

  length(months: number): string {
    return durationLabel(months);
  }

  err(form: { get(path: string): unknown }, path: string, label: string): string {
    return controlError(form.get(path) as never, label);
  }

  priceOf(p: PlanAdmin, sizeUuid: string): number | null {
    return p.prices.find((x) => x.sizeUuid === sizeUuid)?.price ?? null;
  }

  private loadAll(): void {
    this.loading.set(true);
    this.api.get<BillingSettings>('/platform/billing/settings').subscribe({
      next: (s) => { this.applySettings(s); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.notify.error(e); },
    });
    this.loadSizes();
    this.loadPlans();
    this.loadPayments();
  }

  private applySettings(s: BillingSettings): void {
    this.settings.set(s);
    this.settingsForm.reset({
      billingEnabled: s.billingEnabled, trialDays: s.trialDays, graceDays: s.graceDays, reminderDays: s.reminderDays,
      supportPhone: s.supportPhone ?? '', supportEmail: s.supportEmail ?? '',
    });
    this.bkashForm.reset({
      bkashEnabled: s.bkashEnabled, bkashSandbox: s.bkashSandbox, bkashAppKey: s.bkashAppKey ?? '', bkashAppSecret: '',
      bkashUsername: s.bkashUsername ?? '', bkashPassword: '',
    });
  }

  private loadSizes(): void {
    this.api.get<SizeAdmin[]>('/platform/billing/sizes').subscribe({ next: (x) => this.sizes.set(x) });
  }

  private loadPlans(): void {
    this.api.get<PlanAdmin[]>('/platform/billing/plans').subscribe({ next: (x) => this.plans.set(x) });
  }

  private loadPayments(): void {
    this.api.get<Paged<BillingPayment>>('/platform/billing/payments', { page: 1, pageSize: 50, status: this.paymentFilter() }).subscribe({
      next: (p) => { this.payments.set(p.items); this.paymentTotal.set(p.totalCount); },
    });
  }

  filterPayments(status: BillingPaymentStatus | null): void {
    this.paymentFilter.set(status);
    this.loadPayments();
  }

  /** Both forms go up together: the server keeps secrets that are left empty. */
  private body(): Record<string, unknown> {
    return { ...this.settingsForm.getRawValue(), ...this.bkashForm.getRawValue() };
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) { this.settingsForm.markAllAsTouched(); return; }
    this.save(this.settingsForm, this.settingsError);
  }

  saveBkash(): void {
    this.save(this.bkashForm, this.bkashError);
  }

  private save(form: typeof this.settingsForm | typeof this.bkashForm, error: ReturnType<typeof signal<string | null>>): void {
    this.busy.set(true);
    error.set(null);
    this.api.put<{ settings: BillingSettings; businessesStarted: number }>('/platform/billing/settings', this.body()).subscribe({
      next: (r) => {
        this.applySettings(r.settings);
        this.busy.set(false);
        if (r.businessesStarted > 0) this.notify.success('Saved. {n} businesses started their free trial today.', { n: r.businessesStarted });
        else this.notify.success('Saved.');
      },
      error: (e) => { this.busy.set(false); error.set(applyServerErrors(form as never, e)); },
    });
  }

  testBkash(): void {
    this.busy.set(true);
    this.bkashError.set(null);
    this.api.post<{ message: string }>('/platform/billing/settings/test-bkash', this.body()).subscribe({
      next: () => { this.busy.set(false); this.notify.success('bKash accepted the account.'); },
      error: (e) => { this.busy.set(false); this.bkashError.set(applyServerErrors(this.bkashForm as never, e)); },
    });
  }

  editSize(size?: SizeAdmin): void {
    this.dialog.open(SizeDialog, this.layout.dialog(size ?? null, '480px')).afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.loadSizes();
      this.loadPlans();
    });
  }

  editPlan(plan?: PlanAdmin): void {
    this.dialog.open(PlanDialog, this.layout.dialog({ plan: plan ?? null, sizes: this.sizes() }, '560px')).afterClosed().subscribe((saved) => {
      if (saved) this.loadPlans();
    });
  }

  verify(p: BillingPayment): void {
    this.busy.set(true);
    this.api.post<BillingPayment>(`/platform/billing/payments/${p.uuid}/verify`).subscribe({
      next: (u) => {
        this.busy.set(false);
        this.notify.success(u.status === 'COMPLETED' ? 'Payment confirmed.' : u.status === 'INITIATED' ? 'bKash has not confirmed this payment yet.' : 'bKash says this payment did not go through.');
        this.loadPayments();
      },
      error: (e) => { this.busy.set(false); this.notify.error(e); },
    });
  }
}

// ====================================================================== size dialog

@Component({
  selector: 'app-size-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSlideToggleModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'Edit size' : 'New size') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field class="full"><mat-label>{{ 'Size name' | t }}</mat-label><input matInput formControlName="name" [placeholder]="'e.g. Small' | t" /><mat-error>{{ err('name', 'Size name') }}</mat-error></mat-form-field>
        <mat-form-field class="full"><mat-label>{{ 'Description' | t }}</mat-label><input matInput formControlName="description" [placeholder]="'e.g. A shop with up to 3 staff' | t" /></mat-form-field>
        <mat-form-field class="full">
          <mat-label>{{ 'Most orders a month' | t }}</mat-label>
          <input matInput type="number" min="0" inputmode="numeric" formControlName="maxOrdersPerMonth" [placeholder]="'e.g. 2000' | t" />
          <mat-hint>{{ 'Sales and purchase orders, averaged over the last 3 months. Leave empty for no limit (your largest size).' | t }}</mat-hint>
          <mat-error>{{ err('maxOrdersPerMonth', 'Most orders a month') }}</mat-error>
        </mat-form-field>
        <mat-form-field class="full gap"><mat-label>{{ 'Order in lists' | t }}</mat-label><input matInput type="number" formControlName="sortOrder" />
          <mat-hint>{{ 'Smaller sizes first: a business that outgrows a size is offered the next one.' | t }}</mat-hint></mat-form-field>
        <div class="switch-row gap" [class.off]="!form.controls.isActive.value">
          <mat-icon>{{ form.controls.isActive.value ? 'visibility' : 'visibility_off' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Offered at sign-up' | t }}</span>
            <span class="switch-hint">{{ 'Turn off to stop new businesses choosing it. Businesses that have it keep it.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="isActive" [attr.aria-label]="'Offered at sign-up' | t" />
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.full { width: 100%; } .gap { margin-top: 14px; }`,
})
export class SizeDialog {
  readonly data = inject<SizeAdmin | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SizeDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    description: [this.data?.description ?? '', Validators.maxLength(300)],
    sortOrder: [this.data?.sortOrder ?? 0],
    isActive: [this.data?.isActive ?? true],
    maxOrdersPerMonth: [this.data?.maxOrdersPerMonth ?? (null as number | null), [Validators.min(0), Validators.max(10_000_000)]],
  });

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const limit = v.maxOrdersPerMonth === null || (v.maxOrdersPerMonth as unknown) === '' ? null : Math.round(Number(v.maxOrdersPerMonth));
    const body = { ...v, maxOrdersPerMonth: limit, revision: this.data?.revision ?? null };
    const req = this.data ? this.api.put<SizeAdmin>(`/platform/billing/sizes/${this.data.uuid}`, body) : this.api.post<SizeAdmin>('/platform/billing/sizes', body);
    req.subscribe({
      next: (s) => { this.notify.success('Saved.'); this.ref.close(s); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ====================================================================== package dialog

@Component({
  selector: 'app-plan-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSlideToggleModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ (data.plan ? 'Edit package' : 'New package') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field><mat-label>{{ 'Package name' | t }}</mat-label><input matInput formControlName="name" [placeholder]="'e.g. Monthly' | t" /><mat-error>{{ err('name', 'Package name') }}</mat-error></mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Length' | t }}</mat-label>
            <input matInput type="number" min="1" max="60" formControlName="durationMonths" />
            <span matTextSuffix>{{ 'months' | t }}</span>
            <mat-hint>{{ '1 = monthly, 3 = quarterly, 12 = yearly' | t }}</mat-hint>
            <mat-error>{{ err('durationMonths', 'Length') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2"><mat-label>{{ 'Description (shown to businesses)' | t }}</mat-label><input matInput formControlName="description" [placeholder]="'e.g. Best value - 2 months free' | t" /></mat-form-field>
        </div>

        <h3 class="section">{{ 'Price for each business size' | t }}</h3>
        <p class="muted small">{{ 'Leave a price empty to not offer this package to that size. 0 makes it free.' | t }}</p>
        <div class="prices" formArrayName="prices">
          @for (row of prices.controls; track $index; let i = $index) {
            <mat-form-field floatLabel="always" [formGroupName]="i">
              <mat-label>{{ data.sizes[i].name }}@if (!data.sizes[i].isActive) { ({{ 'not offered' | t }}) }</mat-label>
              <span matTextPrefix>Tk&nbsp;</span>
              <input matInput type="number" min="0" step="1" inputmode="decimal" formControlName="price" [placeholder]="'Not offered' | t" />
            </mat-form-field>
          }
        </div>

        <div class="switch-row" [class.off]="!form.controls.isActive.value">
          <mat-icon>{{ form.controls.isActive.value ? 'visibility' : 'visibility_off' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Offered to businesses' | t }}</span>
            <span class="switch-hint">{{ 'Turn off to stop selling it. Payments already made are kept.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="isActive" [attr.aria-label]="'Offered to businesses' | t" />
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .section { margin: 12px 0 2px; font-size: 14px; font-weight: 650; }
    .small { font-size: 12.5px; margin: 0 0 12px; }
    .prices { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); column-gap: 12px; }
  `,
})
export class PlanDialog {
  readonly data = inject<{ plan: PlanAdmin | null; sizes: SizeAdmin[] }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PlanDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    name: [this.data.plan?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    durationMonths: [this.data.plan?.durationMonths ?? 1, [Validators.required, Validators.min(1), Validators.max(60)]],
    description: [this.data.plan?.description ?? '', Validators.maxLength(300)],
    isActive: [this.data.plan?.isActive ?? true],
    prices: this.fb.array(this.data.sizes.map((z) => this.fb.group({
      sizeUuid: [z.uuid],
      price: [this.data.plan?.prices.find((p) => p.sizeUuid === z.uuid)?.price ?? (null as number | null), Validators.min(0)],
    }))),
  });

  get prices(): FormArray {
    return this.form.controls.prices;
  }

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = {
      name: v.name, durationMonths: Number(v.durationMonths), description: v.description, isActive: v.isActive,
      sortOrder: this.data.plan?.sortOrder ?? null,
      prices: v.prices.filter((p) => p.price !== null && (p.price as unknown) !== '').map((p) => ({ sizeUuid: p.sizeUuid, price: Number(p.price) })),
      revision: this.data.plan?.revision ?? null,
    };
    const req = this.data.plan ? this.api.put<PlanAdmin>(`/platform/billing/plans/${this.data.plan.uuid}`, body) : this.api.post<PlanAdmin>('/platform/billing/plans', body);
    req.subscribe({
      next: (p) => { this.notify.success('Saved.'); this.ref.close(p); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
