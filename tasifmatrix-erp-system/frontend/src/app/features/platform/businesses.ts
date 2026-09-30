import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { BusinessListItem, BusinessStatus, CreatedBusiness, Paged, PlatformSummary } from '../../core/models';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { StatusChip } from '../../shared/status-chip';
import { BusinessDialog, showCredentials } from './platform-dialogs';

/**
 * The super admin's home: every business using the system, with how much each one uses it.
 * Counts only - customers, prices, sales and payments stay private to each business.
 */
@Component({
  selector: 'app-businesses',
  imports: [DatePipe, RouterLink, MatTableModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, ListFooter, StatusChip],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Businesses</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">Every business using the system. You manage their accounts; their customers, sales and payments stay private to them.</div>
          }
        </div>
        @if (!layout.isHandset()) {
          <div class="actions"><button mat-flat-button (click)="create()"><mat-icon>add_business</mat-icon>New business</button></div>
        }
      </div>

      @if (summary(); as s) {
        <div class="stats">
          <div class="card stat"><span class="icon-badge"><mat-icon>storefront</mat-icon></span><span class="body"><span class="label">Businesses</span><strong>{{ s.businesses }}</strong></span></div>
          <div class="card stat"><span class="icon-badge teal"><mat-icon>check_circle</mat-icon></span><span class="body"><span class="label">Active</span><strong class="positive">{{ s.activeBusinesses }}</strong></span></div>
          <div class="card stat"><span class="icon-badge rose"><mat-icon>block</mat-icon></span><span class="body"><span class="label">Suspended</span><strong [class.negative]="s.suspendedBusinesses > 0">{{ s.suspendedBusinesses }}</strong></span></div>
          <div class="card stat"><span class="icon-badge violet"><mat-icon>receipt_long</mat-icon></span><span class="body"><span class="label">Orders this month</span><strong>{{ s.ordersThisMonth }}</strong><span class="hint">{{ s.activeUsers }} active users</span></span></div>
        </div>
      }

      <div class="card">
        <div class="toolbar">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>Search name, code or contact</mat-label>
            <input matInput (input)="list.search($any($event.target).value)" />
          </mat-form-field>
          <mat-button-toggle-group [value]="status()" (change)="filter($event.value)" hideSingleSelectionIndicator aria-label="Status">
            <mat-button-toggle [value]="null">All</mat-button-toggle>
            <mat-button-toggle value="ACTIVE">Active</mat-button-toggle>
            <mat-button-toggle value="SUSPENDED">Suspended</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (b of list.items(); track b.uuid) {
              <a class="m-card" [routerLink]="[b.uuid]">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ b.name }}</div>
                    <div class="m-sub code">{{ b.code }}</div>
                  </div>
                  <app-status [value]="b.status" />
                </div>
                <div class="m-sub usage">
                  {{ b.usage.activeUsers }} {{ b.usage.activeUsers === 1 ? 'user' : 'users' }} · {{ b.usage.ordersThisMonth }} {{ b.usage.ordersThisMonth === 1 ? 'order' : 'orders' }} this month
                  @if (b.contactName) { · {{ b.contactName }} }
                </div>
              </a>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="list.items()">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Business</th>
                <td mat-cell *matCellDef="let b"><a [routerLink]="[b.uuid]" class="name-link">{{ b.name }}</a><div class="muted code">{{ b.code }}</div></td>
              </ng-container>
              <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th><td mat-cell *matCellDef="let b"><app-status [value]="b.status" /></td></ng-container>
              <ng-container matColumnDef="contact">
                <th mat-header-cell *matHeaderCellDef>Contact</th>
                <td mat-cell *matCellDef="let b">{{ b.contactName }}<div class="muted">{{ b.contactPhone }}</div></td>
              </ng-container>
              <ng-container matColumnDef="users"><th mat-header-cell *matHeaderCellDef class="num">Users</th><td mat-cell *matCellDef="let b" class="num">{{ b.usage.activeUsers }}</td></ng-container>
              <ng-container matColumnDef="orders"><th mat-header-cell *matHeaderCellDef class="num">Orders this month</th><td mat-cell *matCellDef="let b" class="num">{{ b.usage.ordersThisMonth }}</td></ng-container>
              <ng-container matColumnDef="lastSignIn">
                <th mat-header-cell *matHeaderCellDef>Last sign-in</th>
                <td mat-cell *matCellDef="let b">{{ b.usage.lastSignInDate ? (b.usage.lastSignInDate | date: 'd MMM yyyy') : 'Never' }}</td>
              </ng-container>
              <ng-container matColumnDef="created"><th mat-header-cell *matHeaderCellDef>Since</th><td mat-cell *matCellDef="let b">{{ b.createdDate | date: 'd MMM yyyy' }}</td></ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns" class="clickable" (click)="open(row)"></tr>
            </table>
          </div>
        }

        @if (!list.loading() && list.items().length === 0) {
          <div class="empty">{{ list.error() ?? (hasFilter() ? 'No business matches.' : 'No businesses yet. Create the first one to hand it its admin account.') }}</div>
        }
        <app-list-footer [list]="list" [pageSizes]="[10, 20, 50]" />
      </div>

      @if (layout.isHandset()) {
        <button mat-fab class="fab" aria-label="New business" (click)="create()"><mat-icon>add_business</mat-icon></button>
      }
    </div>
  `,
  styles: `
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .stat { display: flex; align-items: flex-start; gap: 12px; padding: 16px; }
    .stat .body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .stat .label { color: var(--erp-muted); font-size: 13px; }
    .stat strong { font-size: 22px; font-variant-numeric: tabular-nums; }
    .stat .hint { font-size: 12px; color: var(--erp-muted); }
    .positive { color: var(--erp-positive, inherit); }
    .code { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5px; }
    .name-link { font-weight: 600; color: inherit; text-decoration: none; }
    .name-link:hover { text-decoration: underline; }
    .clickable { cursor: pointer; }
    .clickable:hover { background: var(--erp-hover); }
    .usage { margin-top: 8px; }
    a.m-card { display: block; color: inherit; text-decoration: none; }
    @media (max-width: 840px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .stat { padding: 12px; gap: 10px; }
      .stat .icon-badge { width: 30px; height: 30px; border-radius: 9px; }
      .stat .icon-badge mat-icon { font-size: 17px; width: 17px; height: 17px; }
      .stat strong { font-size: 18px; }
    }
  `,
})
export class BusinessesPage implements OnInit {
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly columns = ['name', 'status', 'contact', 'users', 'orders', 'lastSignIn', 'created'];
  readonly status = signal<BusinessStatus | null>(null);
  readonly summary = signal<PlatformSummary | null>(null);
  readonly list = new ListState<BusinessListItem>((q) =>
    this.api.get<Paged<BusinessListItem>>('/platform/businesses', { ...q, status: this.status() }),
  );

  ngOnInit(): void {
    this.list.reload();
    this.loadSummary();
  }

  hasFilter(): boolean {
    return this.status() !== null || this.list.query().search !== '';
  }

  filter(status: BusinessStatus | null): void {
    this.status.set(status);
    this.list.resetToFirstPage();
  }

  open(b: BusinessListItem): void {
    void this.router.navigate(['/platform/businesses', b.uuid]);
  }

  create(): void {
    this.dialog.open(BusinessDialog, this.layout.dialog(null, '600px')).afterClosed().subscribe((created?: CreatedBusiness) => {
      if (!created) return;
      this.list.resetToFirstPage();
      this.loadSummary();
      showCredentials(this.dialog, this.layout, {
        credentials: created.admin,
        businessName: created.business.name,
        businessCode: created.business.code,
      });
    });
  }

  private loadSummary(): void {
    this.api.get<PlatformSummary>('/platform/summary').subscribe({ next: (s) => this.summary.set(s), error: () => this.summary.set(null) });
  }
}
