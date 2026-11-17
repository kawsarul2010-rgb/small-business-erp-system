import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { ApiService, dateToIso, errorMessage } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { ProfitLoss } from '../../core/models';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MoneyPipe } from '../../shared/pipes';
import { ReportExport } from '../../shared/report-export';

type Preset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

/**
 * Profit and loss: sales, less what the goods sold cost, less the running expenses.
 * Purchases are shown for information only - stock bought is a cost when it is sold.
 */
@Component({
  selector: 'app-profit-loss',
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule,
    MatIconModule, MatProgressBarModule, MoneyPipe, ReportExport],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Profit and loss' | t }}</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">{{ 'What the business earned: sales, less the cost of the goods sold, less expenses.' | t }}</div>
          }
        </div>
        <div class="actions">
          <app-report-export path="/reports/profit-loss/pdf" [filters]="pdfFilters()" [label]="'Profit and loss' | t" />
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <mat-button-toggle-group [value]="preset()" (change)="choose($event.value)" class="presets">
            <mat-button-toggle value="thisMonth">{{ 'This month' | t }}</mat-button-toggle>
            <mat-button-toggle value="lastMonth">{{ 'Last month' | t }}</mat-button-toggle>
            <mat-button-toggle value="thisYear">{{ 'This year' | t }}</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'Period' | t }}</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate [formControl]="from" [placeholder]="'From' | t" />
              <input matEndDate [formControl]="to" [placeholder]="'To' | t" (dateChange)="preset.set('custom'); load()" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
        </div>
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <div class="empty negative">{{ error() | t }}</div> }

        @if (data(); as d) {
          <div class="statement">
            <div class="line">
              <span>{{ 'Sales' | t }} <span class="muted">({{ '{n} orders' | t: { n: d.salesOrderCount } }})</span></span>
              <span class="amt">{{ d.sales | money }}</span>
            </div>
            <div class="line minus">
              <span>{{ 'Less: cost of goods sold' | t }}</span>
              <span class="amt">{{ d.costOfGoodsSold | money }}</span>
            </div>
            <div class="line subtotal">
              <span>{{ 'Gross profit' | t }} @if (d.grossMarginPercent !== null) { <span class="pct">{{ d.grossMarginPercent }}%</span> }</span>
              <span class="amt" [class.negative]="d.grossProfit < 0">{{ d.grossProfit | money }}</span>
            </div>

            <div class="line minus">
              <span>{{ 'Less: operating expenses' | t }}</span>
              <span class="amt">{{ d.totalExpenses | money }}</span>
            </div>
            @for (e of d.expenses; track e.categoryUuid) {
              <div class="line detail"><span>{{ e.categoryName | t }}</span><span class="amt">{{ e.amount | money }}</span></div>
            } @empty {
              <div class="line detail muted"><span>{{ 'No expenses recorded in this period.' | t }} <a routerLink="/expenses">{{ 'Add expenses' | t }}</a></span><span></span></div>
            }
            @if (d.stockLoss !== 0) {
              <div class="line minus">
                <span>{{ 'Less: stock lost or damaged' | t }}</span>
                <span class="amt">{{ d.stockLoss | money }}</span>
              </div>
            }

            <div class="line total" [class.loss]="d.netProfit < 0">
              <span>{{ (d.netProfit < 0 ? 'Net loss' : 'Net profit') | t }} @if (d.netMarginPercent !== null) { <span class="pct">{{ d.netMarginPercent }}%</span> }</span>
              <span class="amt">{{ d.netProfit | money }}</span>
            </div>
          </div>

          <div class="info">
            <mat-icon>info</mat-icon>
            <div>
              <p><strong>{{ 'Purchases in this period: {amount}' | t: { amount: (d.purchases | money) } }}</strong></p>
              <p>{{ 'Purchases are not subtracted. Stock you buy is still on the shelf; it becomes a cost (cost of goods sold) when it is sold. Each sale is costed at the average purchase cost of the stock at the time it was finalized.' | t }}</p>
              <p>{{ 'Sales count when the order is finalized, paid or not. Expenses count on their date. Voided orders and expenses are left out.' | t }}</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .presets { margin-right: 8px; }
    .statement { padding: 8px 20px 16px; max-width: 720px; }
    .line { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--erp-border); }
    .line .amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .line.minus .amt::before { content: '- '; color: var(--erp-muted); }
    .line.detail { padding: 6px 0 6px 20px; font-size: 13px; color: var(--erp-muted); border-bottom-style: dashed; }
    .line.subtotal { font-weight: 600; }
    .line.total { font-weight: 700; font-size: 18px; border-bottom: 3px double currentColor; color: var(--erp-chip-success-fg); }
    .line.total.loss { color: var(--erp-chip-danger-fg); }
    .pct { font-size: 12px; font-weight: 500; color: var(--erp-muted); margin-left: 6px; }
    .info { display: flex; gap: 12px; margin: 4px 20px 20px; padding: 12px 14px; border-radius: 10px; background: var(--erp-card-2); font-size: 13px; max-width: 680px; }
    .info p { margin: 0 0 6px; }
    .info mat-icon { color: var(--erp-muted); flex: none; }
  `,
})
export class ProfitLossPage implements OnInit {
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  readonly from = new FormControl<Date | null>(null);
  readonly to = new FormControl<Date | null>(null);
  readonly preset = signal<Preset>('thisMonth');
  readonly data = signal<ProfitLoss | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Bumped on every load, so the printed version always follows the dates on screen. */
  private readonly version = signal(0);
  readonly pdfFilters = computed(() => {
    this.version();
    return { fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value) };
  });

  ngOnInit(): void {
    this.choose('thisMonth');
  }

  choose(p: Preset): void {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const range: Record<Exclude<Preset, 'custom'>, [Date, Date]> = {
      thisMonth: [new Date(y, m, 1), new Date(y, m + 1, 0)],
      lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)],
      thisYear: [new Date(y, 0, 1), new Date(y, 11, 31)],
    };
    if (p !== 'custom') {
      this.from.setValue(range[p][0]);
      this.to.setValue(range[p][1]);
    }
    this.preset.set(p);
    this.load();
  }

  load(): void {
    this.version.update((v) => v + 1);
    this.loading.set(true);
    this.api.get<ProfitLoss>('/reports/profit-loss', { fromDate: dateToIso(this.from.value), toDate: dateToIso(this.to.value) }).subscribe({
      next: (d) => { this.data.set(d); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
}
