import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { APP_INFO, PUBLISHER_LINE } from '../../core/app-info';
import { LANGUAGES, Lang, currentLang, setLang, t } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthService } from '../../core/auth.service';
import { ThemeMode, ThemeService } from '../../core/theme.service';
import { NAV_GROUPS, visibleGroups } from '../../layout/navigation';
import { openAboutDialog } from '../../shared/about-dialog';
import { AppLogo } from '../../shared/app-logo';
import { LabelPipe } from '../../shared/pipes';

/** Colour of the icon badge for each menu group, so the long list is easy to scan. */
const GROUP_TONES: Record<string, string> = {
  Platform: 'indigo',
  Overview: 'indigo',
  Transactions: 'violet',
  Inventory: 'teal',
  'Master data': 'amber',
  Reports: 'rose',
  Administration: 'slate',
};

/** Phone-only menu screen reached from the last tab: every destination, grouped. */
@Component({
  selector: 'app-more',
  imports: [TranslatePipe, RouterLink, MatIconModule, MatButtonModule, MatButtonToggleModule, LabelPipe, AppLogo],
  template: `
    <div class="page">
      @if (auth.user(); as user) {
        <section class="profile">
          <span class="avatar">{{ initials() }}</span>
          <div class="who">
            <div class="name">{{ user.userName }}</div>
            <div class="email">{{ user.email }}</div>
            <div class="tags">
              <span class="role">{{ user.role | label }}</span>
              @if (user.businessName) { <span class="biz"><mat-icon>storefront</mat-icon>{{ user.businessName }}</span> }
              @if (user.role === 'ADMIN' && user.businessCode) { <span class="biz code"><mat-icon>key</mat-icon>{{ user.businessCode }}</span> }
            </div>
          </div>
        </section>
      }

      @for (group of groups(); track group.title) {
        <h2 class="group">{{ group.title | t }}</h2>
        <section class="card rows">
          @for (item of group.items; track item.link + item.label) {
            <a class="row" [routerLink]="item.link">
              <span class="icon-badge" [class]="'icon-badge ' + tone(group.title)"><mat-icon>{{ item.icon }}</mat-icon></span>
              <span class="row-label">{{ item.label | t }}</span>
              <mat-icon class="chev">chevron_right</mat-icon>
            </a>
          }
        </section>
      }

      <h2 class="group">{{ 'Language' | t }}</h2>
      <section class="card appearance">
        <mat-button-toggle-group [value]="lang()" (change)="setLang($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'Language' | t">
          @for (l of languages; track l.code) {
            <mat-button-toggle [value]="l.code" [attr.lang]="l.code"><mat-icon>translate</mat-icon>{{ l.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </section>

      <h2 class="group">{{ 'Appearance' | t }}</h2>
      <section class="card appearance">
        <mat-button-toggle-group [value]="theme.mode()" (change)="setTheme($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'Appearance' | t">
          <mat-button-toggle value="system"><mat-icon>brightness_auto</mat-icon>{{ 'Auto' | t }}</mat-button-toggle>
          <mat-button-toggle value="light"><mat-icon>light_mode</mat-icon>{{ 'Light' | t }}</mat-button-toggle>
          <mat-button-toggle value="dark"><mat-icon>dark_mode</mat-icon>{{ 'Dark' | t }}</mat-button-toggle>
        </mat-button-toggle-group>
      </section>

      <h2 class="group">{{ 'Account' | t }}</h2>
      <section class="card rows">
        <a class="row" routerLink="/profile"><span class="icon-badge slate"><mat-icon>person</mat-icon></span><span class="row-label">{{ 'My profile' | t }}</span><mat-icon class="chev">chevron_right</mat-icon></a>
        <a class="row" routerLink="/change-password"><span class="icon-badge slate"><mat-icon>key</mat-icon></span><span class="row-label">{{ 'Change password' | t }}</span><mat-icon class="chev">chevron_right</mat-icon></a>
        <button class="row" type="button" (click)="about()"><span class="icon-badge slate"><mat-icon>info</mat-icon></span><span class="row-label">{{ 'About' | t }}</span><mat-icon class="chev">chevron_right</mat-icon></button>
        <button class="row logout" type="button" (click)="auth.logout()"><span class="icon-badge rose"><mat-icon>logout</mat-icon></span><span class="row-label">{{ 'Log out' | t }}</span></button>
      </section>

      <!-- Publisher credit, closing the menu screen. -->
      <footer class="credit">
        <app-logo [size]="28" />
        <div class="app">{{ app.name }} <span class="ver">v{{ app.version }}</span></div>
        <div class="by">{{ developedBy() }}</div>
        <div class="org">{{ role | t }}</div>
      </footer>
    </div>
  `,
  styles: `
    .profile {
      display: flex; align-items: center; gap: 14px;
      padding: 18px 16px; border-radius: 18px; color: #fff;
      background: var(--erp-hero-bg);
      box-shadow: 0 8px 24px rgba(49, 46, 129, .22);
    }
    .avatar {
      display: grid; place-items: center; flex: none; width: 52px; height: 52px; border-radius: 50%;
      font-size: 17px; font-weight: 700; color: #3730a3; background: #fff;
    }
    .who { min-width: 0; }
    .who .name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    .who .email { font-size: 13px; color: rgba(255, 255, 255, .78); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .role, .biz {
      display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600;
      padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, .16); border: 1px solid rgba(255, 255, 255, .2);
    }
    .biz mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .group { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--erp-faint); margin: 22px 6px 8px; }
    .rows { overflow: hidden; padding: 4px 0; }
    .row {
      display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box;
      padding: 10px 14px; font: inherit; font-size: 14.5px; font-weight: 500; text-align: left;
      text-decoration: none; color: inherit; background: none; border: 0; cursor: pointer;
    }
    .row + .row { border-top: 1px solid var(--erp-border); }
    .row:active { background: var(--erp-pressed); }
    .row .icon-badge { width: 34px; height: 34px; border-radius: 10px; }
    .row .icon-badge mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chev { color: var(--erp-faint); font-size: 20px; width: 20px; height: 20px; }
    .logout .row-label { color: var(--erp-negative); }

    .appearance { padding: 10px; }
    .appearance mat-button-toggle-group { display: flex; width: 100%; }
    .appearance mat-button-toggle { flex: 1; }
    .appearance mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; }

    .credit { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 28px 4px 4px; text-align: center; line-height: 1.5; }
    .credit app-logo { margin-bottom: 6px; opacity: .9; }
    .credit .app { font-size: 12.5px; font-weight: 600; color: var(--erp-muted); }
    .credit .ver { font-weight: 400; color: var(--erp-faint); }
    .credit .by { font-size: 12.5px; color: var(--erp-muted); }
    .credit .org { font-size: 11.5px; color: var(--erp-faint); }
  `,
})
export class MorePage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly dialog = inject(MatDialog);

  readonly app = APP_INFO;
  readonly developedBy = () => t('by {name}', { name: APP_INFO.publisher.name });
  readonly languages = LANGUAGES;
  readonly lang = currentLang;
  readonly role = PUBLISHER_LINE;
  readonly groups = computed(() => visibleGroups(NAV_GROUPS, this.auth.user()));
  readonly initials = computed(() => {
    const parts = (this.auth.user()?.userName ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  });

  tone(group: string): string {
    return GROUP_TONES[group] ?? 'indigo';
  }

  setLang(lang: Lang): void {
    setLang(lang);
  }

  setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  about(): void {
    openAboutDialog(this.dialog);
  }
}
