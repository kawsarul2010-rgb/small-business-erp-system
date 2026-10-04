import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { APP_INFO } from '../core/app-info';
import { LANGUAGES, Lang, currentLang, setLang, t } from '../core/i18n/i18n';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { openAboutDialog } from '../shared/about-dialog';
import { AuthService } from '../core/auth.service';
import { AppTitleStrategy } from '../core/title.service';
import { LayoutService } from '../core/layout.service';
import { ThemeMode, ThemeService } from '../core/theme.service';
import { AppLogo } from '../shared/app-logo';
import { LabelPipe } from '../shared/pipes';
import { FROZEN_GROUPS, NAV_GROUPS, NavItem, bottomTabs, visibleGroups } from './navigation';
import { BillingStore } from '../core/billing';
import { SubscriptionBanner } from './subscription-banner';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, MatTooltipModule,
    MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, LabelPipe, AppLogo, TranslatePipe, SubscriptionBanner,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);

  readonly app = APP_INFO;
  readonly developedBy = computed(() => t('by {name}', { name: APP_INFO.publisher.name }));

  readonly languages = LANGUAGES;
  readonly lang = currentLang;
  readonly langLabel = computed(() => LANGUAGES.find((l) => l.code === currentLang())?.label ?? '');
  /** The language the quick switch in the top bar changes to. */
  readonly otherLang = computed(() => LANGUAGES.find((l) => l.code !== currentLang())!);

  /** Current URL, updated on every navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'system', label: 'Same as device', icon: 'brightness_auto' },
    { mode: 'light', label: 'Light', icon: 'light_mode' },
    { mode: 'dark', label: 'Dark', icon: 'dark_mode' },
  ];

  /** Desktop only: the navigation rail folded down to icons. Remembered on this device. */
  readonly collapsed = signal(readFlag(RAIL_KEY));

  /** "Kawsar Admin" -> "KA", for the avatar. */
  readonly initials = computed(() => {
    const parts = (this.auth.user()?.userName ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });

  readonly billing = inject(BillingStore);

  readonly groups = computed(() => visibleGroups(this.billing.frozen() ? FROZEN_GROUPS : NAV_GROUPS, this.auth.user()));

  /** The business the person is working in, or the platform for the super admin. */
  readonly workspace = computed(() => {
    const user = this.auth.user();
    if (!user) return this.app.name;
    return user.businessName ?? (user.role === 'SUPER_ADMIN' ? t('Platform administration') : this.app.name);
  });
  readonly tabs = computed(() => {
    const tabs = bottomTabs(this.auth.user());
    if (!this.billing.frozen()) return tabs;
    return [FROZEN_GROUPS[0].items[0], tabs[tabs.length - 1]]; // Billing and More
  });

  constructor() {
    this.billing.load();
  }

  /** Page title for the mobile top bar (set by the route's `title`). */
  readonly pageTitle = inject(AppTitleStrategy).pageTitle;

  /** A tab root shows the brand; deeper screens show a back arrow. */
  readonly canGoBack = computed(() => !this.tabs().some((t) => t.link === this.url().split('?')[0]));

  isTabActive(tab: NavItem): boolean {
    const current = this.url().split('?')[0];
    return tab.link === '/' ? current === '/' : current.startsWith(tab.link);
  }

  setLang(lang: Lang): void {
    setLang(lang);
  }

  toggleLang(): void {
    setLang(this.otherLang().code);
  }

  toggleRail(): void {
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(RAIL_KEY, this.collapsed() ? '1' : '0');
    } catch {
      /* not remembered in private mode */
    }
  }

  back(): void {
    this.location.back();
  }

  about(): void {
    openAboutDialog(this.dialog);
  }
}

const RAIL_KEY = 'tasifmatrix.rail-collapsed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
