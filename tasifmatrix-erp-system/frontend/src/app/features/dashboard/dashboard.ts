import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import type { Chart } from 'chart.js';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { ThemeService } from '../../core/theme.service';
import { Dashboard, DropdownItem, OrderListItem } from '../../core/models';
import { MoneyPipe, QtyPipe, formatMoney } from '../../shared/pipes';
import { StatusChip } from '../../shared/status-chip';
import { InviteStaff } from '../../shared/invite-staff';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe, RouterLink, DatePipe, NgTemplateOutlet, ReactiveFormsModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatFormFieldModule, MatSelectModule, MoneyPipe, QtyPipe, StatusChip, InviteStaff],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage implements OnInit, AfterViewInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly theme = inject(ThemeService);

  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly companies = signal<DropdownItem[]>([]);
  readonly company = new FormControl<string | null>(null);
  readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chart');
  private chart: Chart | null = null;
  private viewReady = false;

  readonly today = new Date();
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    // English keys with a {name} param, translated at render.
    return h < 12 ? 'Good morning, {name}' : h < 17 ? 'Good afternoon, {name}' : 'Good evening, {name}';
  });
  /** The staff invitation stays on the admin's dashboard until they hide it (per device and business). */
  private readonly inviteKey = computed(() => `tasifmatrix.inviteHidden.${this.auth.user()?.businessCode ?? ''}`);
  private readonly inviteHidden = signal(readFlag(this.inviteKey()));
  readonly showInvite = computed(() => this.auth.isAdmin() && !!this.auth.user()?.businessCode && !this.inviteHidden());

  hideInvite(): void {
    this.inviteHidden.set(true);
    try { localStorage.setItem(this.inviteKey(), '1'); } catch { /* private mode: hidden for this visit only */ }
  }

  readonly firstName = computed(() => (this.auth.user()?.userName ?? '').trim().split(/\s+/)[0] ?? '');
  readonly last30Total = computed(() => (this.data()?.salesLast30Days ?? []).reduce((sum, x) => sum + x.total, 0));
  readonly unlinkedUser = computed(() => {
    const u = this.auth.user();
    return u?.role === 'USER' && !u.customerUuid && !u.supplierUuid;
  });

  constructor() {
    // Redraw the chart in the new colours when light/dark mode changes.
    effect(() => {
      this.theme.isDark();
      untracked(() => void this.renderChart());
    });
  }

  ngOnInit(): void {
    this.load();
    if (!this.auth.isUser()) this.api.get<DropdownItem[]>('/companies/dropdown').subscribe({ next: (c) => this.companies.set(c), error: () => {} });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Dashboard>('/dashboard', { companyUuid: this.company.value }).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.error.set(null);
        setTimeout(() => this.renderChart());
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  orderLink(o: OrderListItem): string[] {
    return [o.transactionType === 'SALES' ? '/sales-orders' : '/purchase-orders', o.uuid];
  }

  /** Tiles per row on desktop: all in one row when there are four or fewer, otherwise rows of three. */
  tileCount(d: Dashboard): number {
    const n = 4 + (d.monthPurchases !== null ? 1 : 0) + (d.supplierDue !== null ? 1 : 0);
    return n <= 4 ? n : 3;
  }

  /** How full the bar under a low-stock product is (current stock against its alert level). */
  stockPercent(current: number, threshold: number): number {
    if (threshold <= 0) return 0;
    return Math.max(4, Math.min(100, (current / threshold) * 100));
  }

  initialsOf(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** A stable colour per customer/supplier name, so the same party always looks the same. */
  tone(name: string): number {
    let h = 0;
    for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 5;
  }

  /** Sales for the last 30 days as a bar chart (chart.js is loaded on demand). */
  private async renderChart(): Promise<void> {
    const d = this.data();
    const canvas = this.chartCanvas()?.nativeElement;
    if (!this.viewReady || !d || !canvas || d.salesLast30Days.length === 0) return;

    const { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } = await import('chart.js');
    Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

    const labels = d.salesLast30Days.map((x) => new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const values = d.salesLast30Days.map((x) => x.total);
    // Resolve theme tokens to plain colours (chart.js draws on a canvas and cannot read CSS variables).
    const brand = cssColor('--erp-brand', '#4f46e5');
    const accent = cssColor('--erp-accent', '#0d9488');
    const grid = cssColor('--erp-chart-grid', 'rgba(0,0,0,0.06)');
    const tick = cssColor('--erp-chart-tick', '#8a91a6');
    const dark = this.theme.isDark();

    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Sales',
          data: values,
          // brand colour, fading towards the accent at the baseline
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return brand;
            const g = ctx.chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
            g.addColorStop(0, withAlpha(accent, 0.8));
            g.addColorStop(1, brand);
            return g;
          },
          hoverBackgroundColor: accent,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 20,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            backgroundColor: dark ? '#262a44' : '#141a2e',
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            titleFont: { family: 'Inter', weight: 600 },
            bodyFont: { family: 'Inter' },
            callbacks: { label: (ctx) => formatMoney(ctx.parsed.y) },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: tick, font: { family: 'Inter', size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: grid },
            ticks: { color: tick, font: { family: 'Inter', size: 11 }, maxTicksLimit: 5, callback: (v) => compact(Number(v)) },
          },
        },
      },
    });
  }
}

/** Reads a colour token from the page as the rgb() text chart.js understands. */
function cssColor(token: string, fallback: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

/** rgb(1, 2, 3) + 0.5 -> rgba(1, 2, 3, 0.5); other formats are returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : color;
}

/** 12000 -> "12k", 1500000 -> "1.5M" for the chart's axis. */
function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${+(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
