import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BillingStore } from '../../core/billing';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthLayout } from '../../shared/auth-layout';

/** Written as icon: '...' so the icon font build includes them. */
const RESULT_ICONS: Record<string, { icon: string }> = {
  success: { icon: 'check_circle' },
  cancelled: { icon: 'block' },
  failed: { icon: 'error' },
};

/**
 * Where bKash brings the payer back. The server has already confirmed the payment with bKash
 * before sending them here; this page only tells them the outcome. It works without signing in,
 * because in the Android app bKash opens in the phone's browser.
 */
@Component({
  selector: 'app-payment-result',
  imports: [TranslatePipe, RouterLink, MatButtonModule, MatIconModule, AuthLayout],
  template: `
    <app-auth-layout>
      <div class="card auth-card result" [class]="'card auth-card result ' + status()">
        <span class="big-icon"><mat-icon>{{ icon() }}</mat-icon></span>
        @switch (status()) {
          @case ('success') {
            <h1>{{ 'Payment successful' | t }}</h1>
            <p class="lead">{{ 'Thank you! Your subscription has been extended.' | t }}</p>
          }
          @case ('cancelled') {
            <h1>{{ 'Payment cancelled' | t }}</h1>
            <p class="lead">{{ 'You cancelled the payment. Nothing was charged.' | t }}</p>
          }
          @default {
            <h1>{{ 'Payment not completed' | t }}</h1>
            <p class="lead">{{ 'The payment did not go through. If money was taken from your bKash account, open Billing and press Check again, or contact us.' | t }}</p>
          }
        }
        @if (invoice()) { <p class="invoice">{{ 'Invoice {no}' | t: { no: invoice() } }}</p> }

        @if (auth.isLoggedIn()) {
          <a mat-flat-button class="full-width submit cta" routerLink="/billing">{{ 'Go to Billing' | t }}</a>
        } @else {
          <p class="muted hint">{{ 'Paid from the Tasif Matrix ERP app? You can go back to the app now.' | t }}</p>
          <a mat-stroked-button class="full-width" routerLink="/login">{{ 'Log in' | t }}</a>
        }
      </div>
    </app-auth-layout>
  `,
  styles: `
    .result { text-align: center; }
    .big-icon { display: inline-grid; place-items: center; width: 64px; height: 64px; border-radius: 20px; margin-bottom: 14px;
      background: var(--erp-tint-rose-bg); color: var(--erp-tint-rose-fg); }
    .big-icon mat-icon { font-size: 34px; width: 34px; height: 34px; }
    .success .big-icon { background: var(--erp-tint-teal-bg); color: var(--erp-tint-teal-fg); }
    .cancelled .big-icon { background: var(--erp-tint-slate-bg); color: var(--erp-tint-slate-fg); }
    .invoice { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; color: var(--erp-muted); margin: -8px 0 18px; }
    .hint { font-size: 13.5px; line-height: 1.5; }
  `,
})
export class PaymentResultPage {
  readonly auth = inject(AuthService);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  readonly status = computed(() => {
    const s = this.params.get('status');
    return s === 'success' || s === 'cancelled' ? s : 'failed';
  });
  readonly invoice = computed(() => this.params.get('invoice'));
  readonly icon = computed(() => RESULT_ICONS[this.status()].icon);

  constructor() {
    // A successful payment unfreezes the business: refresh the banner and menu.
    if (this.auth.isLoggedIn()) inject(BillingStore).load();
  }
}
