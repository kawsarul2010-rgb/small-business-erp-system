import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService, dateToIso, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { CompanyReportRow } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes';
import { ReportExport } from '../../shared/report-export';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-company-report',
  imports: [TranslatePipe, ReactiveFormsModule, MatTableModule, MatFormFieldModule, MatDatepickerModule, MatButtonModule, MatProgressBarModule, MoneyPipe, ReportExport],
  styles: `
    .block { margin-top: 10px; }
    .block-title { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--erp-faint); }
    .block .m-meta { margin-top: 4px; }
  `,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Company report' | t }}</h1>
          <div class="subtitle">{{ (auth.isAdmin() ? 'Sales and purchases per company: totals, payments and due (finalized orders).' : 'Sales per company: totals, payments and due (finalized orders).') | t }}</div>
        </div>
        <div class="actions">
          <app-report-export path="/reports/companies/pdf" [filters]="pdfFilters()" [label]="'Company report' | t" />
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'Order date' | t }}</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate [formControl]="from" [placeholder]="'From' | t" />
              <input matEndDate [formControl]="to" [placeholder]="'To' | t" (dateChange)="load()" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
          <button mat-button (click)="from.setValue(null); to.setValue(null); load()">{{ 'Clear' | t }}</button>
        </div>
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (r of rows(); track r.companyUuid) {
              <div class="m-card">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ r.companyName }}</div>
                    <div class="m-sub">{{ r.companyCode }}</div>
                  </div>
                </div>
                <div class="block">
                  <div class="block-title">{{ 'Sales' | t }}</div>
                  <div class="m-meta">
                    <div><span class="k">{{ 'Orders' | t }}</span><span class="v">{{ r.salesCount }}</span></div>
                    <div><span class="k">{{ 'Total' | t }}</span><span class="v">{{ r.salesTotal | money: false }}</span></div>
                    <div><span class="k">{{ 'Due' | t }}</span><span class="v negative">{{ r.salesDue | money: false }}</span></div>
                  </div>
                </div>
                @if (r.purchaseCount !== null) {
                  <div class="block">
                    <div class="block-title">{{ 'Purchases' | t }}</div>
                    <div class="m-meta">
                      <div><span class="k">{{ 'Orders' | t }}</span><span class="v">{{ r.purchaseCount }}</span></div>
                      <div><span class="k">{{ 'Total' | t }}</span><span class="v">{{ r.purchaseTotal | money: false }}</span></div>
                      <div><span class="k">{{ 'Due' | t }}</span><span class="v negative">{{ r.purchaseDue | money: false }}</span></div>
                    </div>
                  </div>
                }
              </div>
            }
            @if (!loading() && rows().length === 0) { <div class="empty">{{ 'No data for the selected dates.' | t }}</div> }
          </div>
        } @else {
        <div class="table-wrap">

          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="company"><th mat-header-cell *matHeaderCellDef>{{ 'Company' | t }}</th><td mat-cell *matCellDef="let r">{{ r.companyName }} <span class="code">{{ r.companyCode }}</span></td><td mat-footer-cell *matFooterCellDef><strong>{{ 'Total' | t }}</strong></td></ng-container>
            <ng-container matColumnDef="salesCount"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Sales orders' | t }}</th><td mat-cell *matCellDef="let r" class="num">{{ r.salesCount }}</td><td mat-footer-cell *matFooterCellDef class="num">{{ sum('salesCount') }}</td></ng-container>
            <ng-container matColumnDef="salesTotal"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Sales total' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.salesTotal | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap">{{ sum('salesTotal') | money }}</td></ng-container>
            <ng-container matColumnDef="salesPaid"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Received' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.salesPaid | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap">{{ sum('salesPaid') | money }}</td></ng-container>
            <ng-container matColumnDef="salesDue"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Customer due' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap negative">{{ r.salesDue | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap negative"><strong>{{ sum('salesDue') | money }}</strong></td></ng-container>
            <ng-container matColumnDef="purchaseCount"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Purchase orders' | t }}</th><td mat-cell *matCellDef="let r" class="num">{{ r.purchaseCount }}</td><td mat-footer-cell *matFooterCellDef class="num">{{ sum('purchaseCount') }}</td></ng-container>
            <ng-container matColumnDef="purchaseTotal"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Purchase total' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.purchaseTotal | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap">{{ sum('purchaseTotal') | money }}</td></ng-container>
            <ng-container matColumnDef="purchasePaid"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Paid' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap">{{ r.purchasePaid | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap">{{ sum('purchasePaid') | money }}</td></ng-container>
            <ng-container matColumnDef="purchaseDue"><th mat-header-cell *matHeaderCellDef class="num">{{ 'Supplier due' | t }}</th><td mat-cell *matCellDef="let r" class="num nowrap negative">{{ r.purchaseDue | money }}</td><td mat-footer-cell *matFooterCellDef class="num nowrap negative"><strong>{{ sum('purchaseDue') | money }}</strong></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns()"></tr>
            <tr mat-row *matRowDef="let row; columns: columns()"></tr>
            <tr mat-footer-row *matFooterRowDef="columns()"></tr>
          </table>
        </div>
        }

        @if (error()) { <div class="empty negative">{{ error() | t }}</div> }
      </div>
    </div>
  `,
})
export class CompanyReportPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  readonly from = new FormControl<Date | null>(null);
  readonly to = new FormControl<Date | null>(null);
  readonly rows = signal<CompanyReportRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly columns = computed(() =>
    this.auth.isAdmin()
      ? ['company', 'salesCount', 'salesTotal', 'salesPaid', 'salesDue', 'purchaseCount', 'purchaseTotal', 'purchasePaid', 'purchaseDue']
      : ['company', 'salesCount', 'salesTotal', 'salesPaid', 'salesDue'],
  );

  ngOnInit(): void {
    this.load();
  }

  /**
   * The filters the screen is showing, handed to the printable version unchanged.
   * A method rather than a computed: form control values are not signals, so a computed
   * would cache the first value and print a stale date range.
   */
  pdfFilters(): Record<string, string | null> {
    return { fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value) };
  }

  load(): void {
    this.loading.set(true);
    this.api.get<CompanyReportRow[]>('/reports/companies', { fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value) }).subscribe({
      next: (r) => { this.rows.set(r); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  sum(key: keyof CompanyReportRow): number {
    return this.rows().reduce((s, r) => s + (Number(r[key]) || 0), 0);
  }
}
