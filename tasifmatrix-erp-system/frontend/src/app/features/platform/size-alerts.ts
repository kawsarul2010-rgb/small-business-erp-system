import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { SizeAlert } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * Businesses whose orders a month (3-month average) are above their size's limit. The super admin
 * moves each one to the suggested size, or keeps its size (no alert for 30 days). Hidden when none.
 */
@Component({
  selector: 'app-size-alerts',
  imports: [TranslatePipe, DecimalPipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (alerts().length > 0) {
      <section class="card alerts" role="region" [attr.aria-label]="'Businesses that outgrew their size' | t">
        <div class="head">
          <span class="icon"><mat-icon>trending_up</mat-icon></span>
          <div>
            <h2>{{ (alerts().length === 1 ? '1 business has outgrown its size' : '{n} businesses have outgrown their size') | t: { n: alerts().length } }}</h2>
            <p>{{ 'Their orders a month (average of the last 3 months) are above their size\\'s limit. Move them to a bigger size so they pay its price from their next payment, or keep their size.' | t }}</p>
          </div>
        </div>
        @for (a of alerts(); track a.businessUuid) {
          <div class="row">
            <div class="who">
              <a [routerLink]="['/platform/businesses', a.businessUuid]" class="name">{{ a.businessName }}</a>
              <span class="facts">
                {{ '{size}: up to {limit} orders a month' | t: { size: a.sizeName, limit: (a.sizeLimit | number) } }} ·
                <strong>{{ 'now {n} a month' | t: { n: (a.ordersPerMonth | number) } }}</strong>
              </span>
            </div>
            <div class="actions">
              <button mat-stroked-button (click)="keep(a)" [disabled]="busy() === a.businessUuid">{{ 'Keep {size}' | t: { size: a.sizeName } }}</button>
              @if (a.suggestedSizeUuid) {
                <button mat-flat-button (click)="change(a)" [disabled]="busy() === a.businessUuid">{{ 'Change to {size}' | t: { size: a.suggestedSizeName } }}</button>
              }
            </div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .alerts { margin-bottom: 16px; border-color: color-mix(in srgb, var(--erp-warning) 45%, var(--erp-border)); overflow: hidden; }
    .head { display: flex; gap: 12px; padding: 16px 18px 10px; background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 255, 255, .55); }
    .head h2 { margin: 0; font-size: 15px; font-weight: 700; }
    .head p { margin: 3px 0 4px; font-size: 13px; line-height: 1.5; opacity: .9; }
    .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 18px; border-top: 1px solid var(--erp-border); }
    .who { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
    .name { font-weight: 650; color: var(--erp-brand); text-decoration: none; }
    .facts { font-size: 13px; color: var(--erp-muted); }
    .facts strong { color: var(--erp-negative); font-weight: 650; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 600px) { .actions { width: 100%; } .actions button { flex: 1; } }
  `,
})
export class SizeAlerts implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  /** A business's size changed (or was kept): the page refreshes its list. */
  readonly changed = output<void>();

  readonly alerts = signal<SizeAlert[]>([]);
  readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get<SizeAlert[]>('/platform/billing/size-alerts').subscribe({ next: (a) => this.alerts.set(a), error: () => this.alerts.set([]) });
  }

  change(a: SizeAlert): void {
    this.busy.set(a.businessUuid);
    this.api.put(`/platform/billing/businesses/${a.businessUuid}`, { sizeUuid: a.suggestedSizeUuid }).subscribe({
      next: () => { this.done(); this.notify.success('{name} is now {size}.', { name: a.businessName, size: a.suggestedSizeName }); },
      error: (e) => { this.busy.set(null); this.notify.error(e); },
    });
  }

  keep(a: SizeAlert): void {
    this.busy.set(a.businessUuid);
    this.api.post(`/platform/billing/businesses/${a.businessUuid}/keep-size`, { days: 30 }).subscribe({
      next: () => { this.done(); this.notify.success('{name} stays {size}. You will be reminded again in 30 days if it is still above the limit.', { name: a.businessName, size: a.sizeName }); },
      error: (e) => { this.busy.set(null); this.notify.error(e); },
    });
  }

  private done(): void {
    this.busy.set(null);
    this.load();
    this.changed.emit();
  }
}
