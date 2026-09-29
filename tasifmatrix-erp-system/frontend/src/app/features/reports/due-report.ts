import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { ApiService, dateToIso } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { OrderKind, OrderListItem, Paged } from '../../core/models';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { MoneyPipe } from '../../shared/pipes';
import { ReportExport } from '../../shared/report-export';
import { orderMeta } from '../orders/order-kind';

/** Finalized orders that still have a due amount, oldest first (SRS 11.1). */
@Component({
  selector: 'app-due-report',
  imports: [RouterLink, DatePipe, MatTableModule, MatProgressBarModule, MatButtonToggleModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule, ListFooter, MoneyPipe, ReportExport],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Due report</h1>
          <div class="subtitle">Finalized orders with an outstanding balance, oldest first</div>
        </div>
        <div class="actions">
          @if (kinds().length > 1) {
            <mat-button-toggle-group [value]="kind()" (change)="switchKind($event.value)" hideSingleSelectionIndicator>
              @for (k of kinds(); track k) { <mat-button-toggle [value]="k">{{ k === 'sales' ? 'Customer dues' : 'Supplier dues' }}</mat-button-toggle> }
            </mat-button-toggle-group>
          }
          <app-report-export [path]="pdfPath()" [filters]="pdfFilters()"
            [label]="kind() === 'sales' ? 'Customer due report' : 'Supplier due report'" />
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Order date</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate [formControl]="from" placeholder="From" />
              <input matEndDate [formControl]="to" placeholder="To" (dateChange)="list.resetToFirstPage()" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
          @if (from.value || to.value) {
            <button mat-button (click)="clearDates()">Clear</button>
          }
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (o of list.items(); track o.uuid) {
              <a class="m-card" [routerLink]="[meta().route, o.uuid]">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ o.partyName }}</div>
                    <div class="m-sub">#{{ o.orderNumber }} · {{ o.orderDate | date: 'dd MMM yyyy' }} · {{ age(o.orderDate) }} days</div>
                  </div>
                  <div class="m-right">
                    <span class="m-amount negative">{{ o.dueAmount | money }}</span>
                    <span class="m-sub">due</span>
                  </div>
                </div>
                <div class="m-meta two">
                  <div><span class="k">Order total</span><span class="v">{{ o.totalAmount | money: false }}</span></div>
                  <div><span class="k">Paid</span><span class="v">{{ o.totalPaidAmount | money: false }}</span></div>
                </div>
              </a>
            }
          </div>
        } @else {
        <div class="table-wrap">

          <table mat-table [dataSource]="list.items()">
            <ng-container matColumnDef="orderNumber"><th mat-header-cell *matHeaderCellDef>Order</th><td mat-cell *matCellDef="let o"><a [routerLink]="[meta().route, o.uuid]">#{{ o.orderNumber }}</a></td></ng-container>
            <ng-container matColumnDef="orderDate"><th mat-header-cell *matHeaderCellDef>Date</th><td mat-cell *matCellDef="let o" class="nowrap">{{ o.orderDate | date: 'dd MMM yyyy' }}</td></ng-container>
            <ng-container matColumnDef="age"><th mat-header-cell *matHeaderCellDef class="num">Days</th><td mat-cell *matCellDef="let o" class="num">{{ age(o.orderDate) }}</td></ng-container>
            <ng-container matColumnDef="party"><th mat-header-cell *matHeaderCellDef>{{ meta().partyLabel }}</th><td mat-cell *matCellDef="let o">{{ o.partyName }} <span class="code">{{ o.partyCode }}</span></td></ng-container>
            <ng-container matColumnDef="company"><th mat-header-cell *matHeaderCellDef>Company</th><td mat-cell *matCellDef="let o">{{ o.companyName }}</td></ng-container>
            <ng-container matColumnDef="total"><th mat-header-cell *matHeaderCellDef class="num">Total</th><td mat-cell *matCellDef="let o" class="num nowrap">{{ o.totalAmount | money }}</td></ng-container>
            <ng-container matColumnDef="paid"><th mat-header-cell *matHeaderCellDef class="num">Paid</th><td mat-cell *matCellDef="let o" class="num nowrap">{{ o.totalPaidAmount | money }}</td></ng-container>
            <ng-container matColumnDef="due"><th mat-header-cell *matHeaderCellDef class="num">Due</th><td mat-cell *matCellDef="let o" class="num nowrap negative"><strong>{{ o.dueAmount | money }}</strong></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row class="clickable" *matRowDef="let row; columns: columns" (click)="open(row)"></tr>
          </table>
        </div>
        }

        @if (!list.loading() && list.items().length === 0) { <div class="empty">{{ list.error() ?? 'Nothing is due.' }}</div> }
        <app-list-footer [list]="list" />
      </div>
    </div>
  `,
})
export class DueReportPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly kinds = computed<OrderKind[]>(() => {
    const u = this.auth.user();
    if (!u) return [];
    if (u.role === 'ADMIN') return ['sales', 'purchase'];
    if (u.role === 'MANAGER') return ['sales'];
    return [...(u.customerUuid ? (['sales'] as OrderKind[]) : []), ...(u.supplierUuid ? (['purchase'] as OrderKind[]) : [])];
  });
  readonly kind = signal<OrderKind>(this.kinds()[0] ?? 'sales');
  readonly meta = computed(() => orderMeta(this.kind()));
  readonly columns = ['orderNumber', 'orderDate', 'age', 'party', 'company', 'total', 'paid', 'due'];
  readonly from = new FormControl<Date | null>(null);
  readonly to = new FormControl<Date | null>(null);

  readonly list = new ListState<OrderListItem>((q) =>
    this.api.get<Paged<OrderListItem>>(this.meta().api, {
      page: q.page, pageSize: q.pageSize, dueOnly: true, postingStatus: 'FINAL', sort: 'orderDate',
      fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value),
    }), 50);

  clearDates(): void {
    this.from.setValue(null);
    this.to.setValue(null);
    this.list.resetToFirstPage();
  }

  /** The endpoint that prints whichever side of the report is on screen. */
  pdfPath(): string {
    return this.kind() === 'sales' ? '/reports/due/sales/pdf' : '/reports/due/purchase/pdf';
  }

  /** The date range the screen is showing; a method because form values are not signals. */
  pdfFilters(): Record<string, string | null> {
    return { fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value) };
  }

  ngOnInit(): void {
    if (this.kinds().length > 0) this.list.reload();
  }

  switchKind(k: OrderKind): void {
    this.kind.set(k);
    this.list.resetToFirstPage();
  }

  age(orderDate: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(orderDate + 'T00:00:00+06:00').getTime()) / 86_400_000));
  }

  open(o: OrderListItem): void {
    void this.router.navigate([this.meta().route, o.uuid]);
  }
}
