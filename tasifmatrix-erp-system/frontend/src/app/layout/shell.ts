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
import { APP_INFO, PUBLISHED_BY } from '../core/app-info';
import { openAboutDialog } from '../shared/about-dialog';
import { AuthService } from '../core/auth.service';
import { AppTitleStrategy } from '../core/title.service';
import { LayoutService } from '../core/layout.service';
import { ThemeMode, ThemeService } from '../core/theme.service';
import { AppLogo } from '../shared/app-logo';
import { LabelPipe } from '../shared/pipes';
import { NAV_GROUPS, NavItem, bottomTabs, visibleGroups } from './navigation';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, MatTooltipModule,
    MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, LabelPipe, AppLogo,
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
  readonly developedBy = PUBLISHED_BY;

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

  readonly groups = computed(() => visibleGroups(NAV_GROUPS, this.auth.user()));

  /** The business the person is working in, or the platform for the super admin. */
  readonly workspace = computed(() => {
    const user = this.auth.user();
    if (!user) return this.app.name;
    return user.businessName ?? (user.role === 'SUPER_ADMIN' ? 'Platform administration' : this.app.name);
  });
  readonly tabs = computed(() => bottomTabs(this.auth.user()));

  /** Page title for the mobile top bar (set by the route's `title`). */
  readonly pageTitle = inject(AppTitleStrategy).pageTitle;

  /** A tab root shows the brand; deeper screens show a back arrow. */
  readonly canGoBack = computed(() => !this.tabs().some((t) => t.link === this.url().split('?')[0]));

  isTabActive(tab: NavItem): boolean {
    const current = this.url().split('?')[0];
    return tab.link === '/' ? current === '/' : current.startsWith(tab.link);
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
