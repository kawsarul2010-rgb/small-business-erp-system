import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SubscriptionStatus } from './models';
import { t } from './i18n/i18n';

/** Screens a business can still open when its subscription has run out. */
const OPEN_WHEN_FROZEN = ['/billing', '/profile', '/change-password', '/more', '/payment-result'];

/**
 * The signed-in business's subscription, shared by the shell (banner, menu), the Billing page and
 * the guard. Loaded when the shell starts and refreshed after payments.
 */
@Injectable({ providedIn: 'root' })
export class BillingStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly status = signal<SubscriptionStatus | null>(null);
  readonly frozen = computed(() => this.status()?.frozen ?? false);

  load(): void {
    const user = this.auth.user();
    if (!user || user.role === 'SUPER_ADMIN') {
      this.status.set(null);
      return;
    }
    this.api.get<SubscriptionStatus>('/billing/status').subscribe({
      next: (s) => {
        this.status.set(s);
        if (s.frozen) this.leaveFrozenScreen();
      },
      error: () => { /* the banner simply does not show */ },
    });
  }

  set(status: SubscriptionStatus): void {
    this.status.set(status);
  }

  /** The API answered 402: the subscription ran out while the app was open. */
  markFrozen(): void {
    const s = this.status();
    this.status.set({
      state: 'EXPIRED', endsAt: s?.endsAt ?? null, graceEndsAt: s?.graceEndsAt ?? null, daysLeft: 0, onTrial: false,
      planName: s?.planName ?? null, sizeName: s?.sizeName ?? null, showReminder: true, frozen: true,
    });
    this.leaveFrozenScreen();
  }

  isOpenWhenFrozen(url: string): boolean {
    const path = url.split('?')[0];
    return OPEN_WHEN_FROZEN.some((p) => path === p || path.startsWith(p + '/'));
  }

  private leaveFrozenScreen(): void {
    if (!this.isOpenWhenFrozen(this.router.url)) void this.router.navigate(['/billing']);
  }
}

/** Keeps a frozen business on the Billing page (the API refuses everything else anyway). */
export const subscriptionGuard: CanActivateChildFn = (_route, state) => {
  const store = inject(BillingStore);
  if (!store.frozen() || store.isOpenWhenFrozen(state.url)) return true;
  return inject(Router).createUrlTree(['/billing']);
};

/** 1 -> "1 month", 3 -> "3 months", 12 -> "1 year", 24 -> "2 years". */
export function durationLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? t('1 year') : t('{n} years', { n: months / 12 });
  return months === 1 ? t('1 month') : t('{n} months', { n: months });
}
