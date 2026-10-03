import { DatePipe } from '@angular/common';
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
import { BusinessAdmin, BusinessDetail, IssuedCredentials } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { StatusChip } from '../../shared/status-chip';
import { AddAdminDialog, BusinessDialog, SuspendDialog, showCredentials } from './platform-dialogs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';

/** One business, as the super admin sees it: its account, its usage and its admins. */
@Component({
  selector: 'app-business-detail',
  imports: [TranslatePipe, DatePipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, MatTooltipModule, StatusChip],
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
            @if (layout.isHandset()) {
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
        </div>

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
              @if (!layout.isHandset()) { <button mat-stroked-button (click)="addAdmin(b)"><mat-icon>person_add</mat-icon>{{ 'Add admin' | t }}</button> }
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
      }
    </div>
  `,
  styles: `
    .back-link { display: inline-block; margin-bottom: 8px; font-size: 13px; color: var(--erp-brand); text-decoration: none; font-weight: 550; }
    .back-link::before { content: '← '; }
    h1 app-status { vertical-align: middle; margin-left: 8px; }
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
    @media (max-width: 960px) { .grid-2 { grid-template-columns: 1fr; } }
    @media (max-width: 840px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .stat { padding: 12px; }
      .stat strong { font-size: 18px; }
      .admin-row { flex-direction: column; align-items: stretch; }
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

  ngOnInit(): void {
    this.load();
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
      if (updated) this.business.set(updated);
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
