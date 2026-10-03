import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { map, tap } from 'rxjs';
import { ApiService, dateToIso } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { DropdownItem, PartyReport, PartyReportRow } from '../../core/models';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { MoneyPipe, QtyPipe } from '../../shared/pipes';
import { ReportExport } from '../../shared/report-export';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

type PartyKind = 'customer' | 'supplier';

/** Customer and supplier reports: order totals, payments made and current due (FINAL orders only). */
@Component({
  selector: 'app-party-report',
  imports: [TranslatePipe, RouterLink, ReactiveFormsModule, MatTableModule, MatSortModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatCheckboxModule, MatProgressBarModule, MatTooltipModule, ListFooter, MoneyPipe, QtyPipe, ReportExport],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ (kind() === 'customer' ? 'Customer report' : 'Supplier report') | t }}</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">{{ 'Totals include finalized orders only. Due = order total − payments.' | t }}</div>
          }
        </div>
        <div class="actions">
          <app-report-export [path]="pdfPath()" [filters]="pdfFilters()"
            [label]="(kind() === 'customer' ? 'Customer report' : 'Supplier report') | t" />
        </div>
      </div>

      <div class="totals-row">
        <div class="card card-pad stat"><span class="muted">{{ 'Orders' | t }}</span><strong>{{ totals().orderCount | qty }}</strong></div>
        <div class="card card-pad stat"><span class="muted">{{ 'Order total' | t }}</span><strong>{{ totals().totalAmount | money }}</strong></div>
        <div class="card card-pad stat"><span class="muted">{{ 'Paid' | t }}</span><strong class="positive">{{ totals().totalPaid | money }}</strong></div>
        <div class="card card-pad stat"><span class="muted">{{ 'Due' | t }}</span><strong class="negative">{{ totals().due | money }}</strong></div>
      </div>

      <div class="card">
        <div class="toolbar">
          @if (!auth.isUser()) {
            <mat-form-field class="search" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <mat-label>{{ 'Search name or code' | t }}</mat-label>
              <input matInput (input)="list.search($any($event.target).value)" />
            </mat-form-field>
            @if (!layout.isHandset()) {
              <mat-form-field subscriptSizing="dynamic" style="width: 180px">
                <mat-label>{{ 'Company' | t }}</mat-label>
                <mat-select [formControl]="company" (selectionChange)="list.resetToFirstPage()">
                  <mat-option [value]="null">{{ 'All companies' | t }}</mat-option>
                  @for (c of companies(); track c.uuid) { <mat-option [value]="c.uuid">{{ c.name }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          }
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'Order date' | t }}</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate [formControl]="from" [placeholder]="'From' | t" />
              <input matEndDate [formControl]="to" [placeholder]="'To' | t" (dateChange)="list.resetToFirstPage()" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
          @if (!auth.isUser()) { <mat-checkbox [formControl]="dueOnly" (change)="list.resetToFirstPage()">{{ 'With due only' | t }}</mat-checkbox> }
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (r of list.items(); track r.partyUuid) {
              <a class="m-card" [routerLink]="ordersRoute()"
                 [queryParams]="auth.isUser() ? { status: 'FINAL' } : { partyUuid: r.partyUuid, partyLabel: r.partyName + ' (' + r.partyCode + ')', status: 'FINAL' }">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ r.partyName }}</div>
                    <div class="m-sub">{{ r.partyCode }} · {{ r.mobileNumber }}</div>
                  </div>
                  <div class="m-right">
                    <span class="m-amount" [class.negative]="r.due > 0">{{ r.due | money }}</span>
                    <span class="m-sub">{{ 'due' | t }}</span>
                  </div>
                </div>
                <div class="m-meta">
                  <div><span class="k">{{ 'Orders' | t }}</span><span class="v">{{ r.orderCount }}</span></div>
                  <div><span class="k">{{ 'Total' | t }}</span><span class="v">{{ r.totalAmount | money: false }}</span></div>
                  <div><span class="k">{{ 'Paid' | t }}</span><span class="v">{{ r.totalPaid | money: false }}</span></div>
                </div>
              </a>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="list.items()" matSort matSortActive="due" matSortDirection="desc" (matSortChange)="list.onSort($event)">
              <ng-container matColumnDef="partyName"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ (kind() === 'customer' ? 'Customer' : 'Supplier') | t }}</th>
                <td mat-cell *matCellDef="let r">{{ r.partyName }} <span class="code">{{ r.partyCode }}</span></td></ng-container>
              <ng-container matColumnDef="mobile"><th mat-header-cell *matHeaderCellDef>{{ 'Mobile' | t }}</th><td mat-cell *matCellDef="let r" class="nowrap">{{ r.mobileNumber }}</td></ng-container>
              <ng-container matColumnDef="orders"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Orders' | t }}</th><td mat-cell *matCellDef="let r" class="num">{{ r.orderCount }}</td></ng-container>
              <ng-container matColumnDef="totalAmount"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Order total' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.totalAmount | money }}</td></ng-container>
              <ng-container matColumnDef="totalPaid"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Paid' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.totalPaid | money }}</td></ng-container>
              <ng-container matColumnDef="due"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Due' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap" [class.negative]="r.due > 0"><strong>{{ r.due | money }}</strong></td></ng-container>
              <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let r" class="num"><a mat-icon-button [matTooltip]="'View orders' | t" [routerLink]="ordersRoute()" [queryParams]="auth.isUser() ? { status: 'FINAL' } : { partyUuid: r.partyUuid, partyLabel: r.partyName + ' (' + r.partyCode + ')', status: 'FINAL' }"><mat-icon>receipt_long</mat-icon></a></td></ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        }

        @if (!list.loading() && list.items().length === 0) {
          <div class="empty">{{ (list.error() ?? (auth.isUser() ? 'Your account is not linked yet, or there are no finalized orders.' : 'No data for the selected filters.')) | t }}</div>
        }
        <app-list-footer [list]="list" />
      </div>
    </div>
  `,
  styles: `
    .totals-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat { display: flex; flex-direction: column; gap: 4px; strong { font-size: 20px; font-variant-numeric: tabular-nums; } }
    @media (max-width: 840px) {
      .totals-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .stat { padding: 12px; gap: 2px; }
      .stat .muted { font-size: 12px; }
      .stat strong { font-size: 16px; }
    }
  `,
})
export class PartyReportPage implements OnInit {
  readonly kind = input<PartyKind>('customer');
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);

  readonly columns = ['partyName', 'mobile', 'orders', 'totalAmount', 'totalPaid', 'due', 'actions'];
  readonly ordersRoute = computed(() => (this.kind() === 'customer' ? '/sales-orders' : '/purchase-orders'));
  readonly company = new FormControl<string | null>(null);
  readonly from = new FormControl<Date | null>(null);
  readonly to = new FormControl<Date | null>(null);
  readonly dueOnly = new FormControl(false, { nonNullable: true });
  readonly companies = signal<DropdownItem[]>([]);
  readonly totals = signal({ orderCount: 0, totalAmount: 0, totalPaid: 0, due: 0 });

  /** The endpoint that prints whichever report is on screen. */
  pdfPath(): string {
    return this.kind() === 'customer' ? '/reports/customers/pdf' : '/reports/suppliers/pdf';
  }

  /**
   * The filters the screen is showing, handed to the printable version unchanged.
   * A method rather than a computed: form control values are not signals.
   */
  pdfFilters(): Record<string, string | boolean | null> {
    return {
      companyUuid: this.company.value,
      fromDate: dateToIso(this.from.value),
      toDate: dateToIso(this.to.value),
      dueOnly: this.dueOnly.value,
    };
  }

  readonly list = new ListState<PartyReportRow>((q) =>
    this.api
      .get<PartyReport>(this.kind() === 'customer' ? '/reports/customers' : '/reports/suppliers', {
        ...q, companyUuid: this.company.value, fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value), dueOnly: this.dueOnly.value,
      })
      .pipe(tap((r) => this.totals.set(r.totals)), map((r) => r.rows)),
  );

  ngOnInit(): void {
    this.list.reload();
    if (!this.auth.isUser()) this.api.get<DropdownItem[]>('/companies/dropdown').subscribe({ next: (c) => this.companies.set(c), error: () => {} });
  }
}
