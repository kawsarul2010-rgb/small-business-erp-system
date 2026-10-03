import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { ApiService, problemOf } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BusinessSettings } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * The business's own settings (ADMIN). Each switch saves as soon as it is changed.
 * A customer or supplier gets an SMS only when the business, the customer or supplier, and the
 * order all have SMS on.
 */
@Component({
  selector: 'app-settings',
  imports: [TranslatePipe, RouterLink, MatIconModule, MatProgressBarModule, MatSlideToggleModule],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <div>
          <h1>{{ 'Settings' | t }}</h1>
          <div class="subtitle">
            @if (auth.user()?.businessName; as business) { {{ 'Settings for {business}. Changes save straight away.' | t: { business: business } }} }
            @else { {{ 'Changes save straight away.' | t }} }
          </div>
        </div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @if (settings(); as s) {
        <section class="card card-pad">
          <div class="section-head">
            <span class="icon-badge"><mat-icon>sms</mat-icon></span>
            <div>
              <h2 class="card-title">{{ 'SMS' | t }}</h2>
              <div class="muted small">{{ 'Messages to customers and suppliers when an order is finalized and when a payment is added.' | t }}</div>
            </div>
          </div>

          <div class="switch-row" [class.off]="!s.smsEnabled">
            <mat-icon>{{ s.smsEnabled ? 'sms' : 'speaker_notes_off' }}</mat-icon>
            <div class="switch-text">
              <span class="switch-title">{{ 'Send SMS to customers and suppliers' | t }}</span>
              <span class="switch-hint">{{ (s.smsEnabled ? 'On: orders with SMS turned on send their messages.' : 'Off: this business sends no SMS at all. Orders, customers and suppliers keep their own SMS choice for when you turn it back on.') | t }}</span>
            </div>
            <mat-slide-toggle [checked]="s.smsEnabled" [disabled]="saving()" (change)="save('smsEnabled', $event)" [attr.aria-label]="'Send SMS to customers and suppliers' | t" />
          </div>

          <div class="switch-row" [class.off]="!s.smsOnNewOrders || !s.smsEnabled">
            <mat-icon>{{ s.smsOnNewOrders ? 'mark_chat_read' : 'chat_bubble' }}</mat-icon>
            <div class="switch-text">
              <span class="switch-title">{{ 'Turn SMS on for new orders' | t }}</span>
              <span class="switch-hint">{{ (s.smsOnNewOrders ? 'New sales and purchase orders start with SMS on. You can still turn it off on each order.' : 'New sales and purchase orders start with SMS off. Turn it on for the orders that need it.') | t }}</span>
            </div>
            <mat-slide-toggle [checked]="s.smsOnNewOrders" [disabled]="saving() || !s.smsEnabled" (change)="save('smsOnNewOrders', $event)" [attr.aria-label]="'Turn SMS on for new orders' | t" />
          </div>

          <div class="rules">
            <mat-icon>info</mat-icon>
            <div>
              {{ 'A customer or supplier gets an SMS only when all three are on:' | t }}
              <ol>
                <li>{{ 'SMS for the business (above).' | t }}</li>
                <li>{{ 'SMS for the customer or supplier - on by default; change it when you edit them.' | t }}</li>
                <li>{{ 'SMS on the order - set it when you create the order, or later on the order page.' | t }}</li>
              </ol>
            </div>
          </div>

          <div class="usage">
            <div><span class="k">{{ 'SMS sent this month' | t }}</span><strong>{{ s.smsPartsThisMonth }}</strong></div>
            <div><span class="k">{{ 'Messages' | t }}</span><strong>{{ s.smsSentThisMonth }}</strong></div>
            <a routerLink="/sms" class="log-link">{{ 'Open SMS log' | t }}</a>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 820px; }
    .section-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
    .section-head .card-title { margin: 0 0 2px; }
    .small { font-size: 12.5px; line-height: 1.45; }
    .rules { display: flex; gap: 10px; margin-top: 16px; padding: 12px 14px; border-radius: var(--erp-radius-sm); background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); font-size: 13px; line-height: 1.5; }
    .rules mat-icon { flex: none; font-size: 20px; width: 20px; height: 20px; }
    .rules ol { margin: 4px 0 0; padding-left: 20px; }
    .usage { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--erp-border); }
    .usage div { display: flex; flex-direction: column; gap: 2px; }
    .usage .k { font-size: 12.5px; color: var(--erp-muted); }
    .usage strong { font-size: 20px; font-variant-numeric: tabular-nums; }
    .log-link { margin-left: auto; font-size: 13px; font-weight: 550; color: var(--erp-brand); text-decoration: none; }
    .log-link:hover { text-decoration: underline; }
  `,
})
export class SettingsPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly settings = signal<BusinessSettings | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<BusinessSettings>('/settings').subscribe({
      next: (s) => { this.settings.set(s); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load the settings.'); this.loading.set(false); },
    });
  }

  save(field: 'smsEnabled' | 'smsOnNewOrders', change: MatSlideToggleChange): void {
    const current = this.settings()!;
    const body = { smsEnabled: current.smsEnabled, smsOnNewOrders: current.smsOnNewOrders, revision: current.revision, [field]: change.checked };
    this.saving.set(true);
    this.api.put<BusinessSettings>('/settings', body).subscribe({
      next: (s) => { this.settings.set(s); this.saving.set(false); this.notify.success('Settings saved.'); },
      error: (e) => {
        this.notify.error(e);
        this.saving.set(false);
        change.source.checked = !change.checked; // back to what is saved
        if (problemOf(e).code === 'REVISION_CONFLICT') this.load();
      },
    });
  }
}
