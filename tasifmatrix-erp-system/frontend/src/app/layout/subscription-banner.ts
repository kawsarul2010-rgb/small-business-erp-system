import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { BillingStore } from '../core/billing';
import { PlatformService } from '../core/platform.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** Written as icon: '...' so the icon font build includes them. */
const BANNER_ICONS: Record<string, { icon: string }> = {
  TRIAL: { icon: 'hourglass_top' },
  ACTIVE: { icon: 'event' },
  GRACE_PERIOD: { icon: 'warning' },
  EXPIRED: { icon: 'lock' },
};

/**
 * The reminder above every screen while a business's trial or package is ending, during the
 * grace days, and after it has run out. Trial and "ending soon" reminders can be hidden for the
 * rest of the visit; the grace-period warning cannot.
 *
 * Inside the Android app it only states the dates: Google Play does not allow asking people to pay
 * for the app outside Google Play billing, so "pay" and "renew" wording stays on the website.
 */
@Component({
  selector: 'app-subscription-banner',
  imports: [TranslatePipe, DatePipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (visible(); as s) {
      <div class="wrap">
        <div class="banner" [class]="'banner ' + tone()" role="status">
          <mat-icon>{{ icon() }}</mat-icon>
          <div class="text">
            @switch (s.state) {
              @case ('TRIAL') {
                <strong>{{ (s.daysLeft === 1 ? 'Free trial: 1 day left.' : 'Free trial: {n} days left.') | t: { n: s.daysLeft } }}</strong>
                {{ (inApp ? 'Your free trial ends on {date}.' : 'Choose a package before {date} to keep using the app.') | t: { date: (s.endsAt | date: 'd MMM yyyy') } }}
              }
              @case ('ACTIVE') {
                <strong>{{ (s.daysLeft === 1 ? 'Your package ends tomorrow.' : 'Your package ends in {n} days.') | t: { n: s.daysLeft } }}</strong>
                {{ (inApp ? 'It ends on {date}.' : 'Renew before {date} to avoid any interruption.') | t: { date: (s.endsAt | date: 'd MMM yyyy') } }}
              }
              @case ('GRACE_PERIOD') {
                <strong>{{ 'Your subscription ended on {date}.' | t: { date: (s.endsAt | date: 'd MMM yyyy') } }}</strong>
                @if (inApp) {
                  {{ 'The app will stop working on {date}.' | t: { date: (s.graceEndsAt | date: 'd MMM yyyy') } }}
                } @else {
                  {{ (s.daysLeft === 1 ? 'Please pay your bill within 1 day, otherwise the app will stop working on {date}.' : 'Please pay your bill within {n} days, otherwise the app will stop working on {date}.') | t: { n: s.daysLeft, date: (s.graceEndsAt | date: 'd MMM yyyy') } }}
                }
              }
              @case ('EXPIRED') {
                <strong>{{ 'Your subscription has ended.' | t }}</strong>
                {{ (inApp ? 'The app is paused. Your data is safe.' : 'The app is paused until the bill is paid. Your data is safe.') | t }}
              }
            }
            @if (!isAdmin()) { <span class="ask">{{ (inApp ? 'Please contact your admin.' : 'Please ask your admin to renew.') | t }}</span> }
          </div>
          @if (!onBilling()) {
            <a mat-flat-button class="go" routerLink="/billing">{{ (isAdmin() && !inApp ? (s.state === 'TRIAL' ? 'See packages' : 'Pay now') : 'Details') | t }}</a>
          }
          @if (s.state === 'TRIAL' || s.state === 'ACTIVE') {
            <button mat-icon-button class="close" (click)="hidden.set(true)" [attr.aria-label]="'Hide' | t"><mat-icon>close</mat-icon></button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .wrap { max-width: 1440px; margin: 0 auto; padding: 18px 28px 0; box-sizing: border-box; }
    .banner { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 16px; border-radius: var(--erp-radius-sm); font-size: 13.5px; line-height: 1.45; }
    .banner > mat-icon { flex: none; }
    .text { flex: 1; min-width: 0; }
    .text strong { font-weight: 650; margin-right: 4px; }
    .ask { display: block; font-size: 12.5px; opacity: .85; margin-top: 2px; }
    .go { flex: none; }
    .close { flex: none; margin: -6px -4px -6px 0; }
    .info { background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .warn { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .danger { background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); }
    @media (max-width: 840px) {
      .wrap { padding: 12px 12px 0; }
      .banner { flex-wrap: wrap; padding: 12px; }
      .text { flex-basis: calc(100% - 80px); }
      .go { margin-left: 36px; }
    }
  `,
})
export class SubscriptionBanner {
  private readonly store = inject(BillingStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly inApp = inject(PlatformService).isNative;

  /** Hidden for this visit (trial / ending soon only). */
  readonly hidden = signal(false);
  readonly isAdmin = computed(() => this.auth.role() === 'ADMIN');

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects), startWith(this.router.url)),
    { initialValue: this.router.url },
  );
  readonly onBilling = computed(() => this.url().split('?')[0] === '/billing');

  readonly visible = computed(() => {
    const s = this.store.status();
    if (!s || !s.showReminder) return null;
    if (this.hidden() && (s.state === 'TRIAL' || s.state === 'ACTIVE')) return null;
    // The Billing page shows the full story itself once frozen.
    if (s.state === 'EXPIRED' && this.onBilling()) return null;
    return s;
  });

  readonly tone = computed(() => {
    switch (this.visible()?.state) {
      case 'GRACE_PERIOD': return 'warn';
      case 'EXPIRED': return 'danger';
      default: return 'info';
    }
  });

  readonly icon = computed(() => (BANNER_ICONS[this.visible()?.state ?? ''] ?? { icon: 'event' }).icon);
}
