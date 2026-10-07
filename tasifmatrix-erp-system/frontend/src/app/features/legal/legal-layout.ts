import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { APP_INFO, copyrightLine } from '../../core/app-info';
import { AuthService } from '../../core/auth.service';
import { LANGUAGES, Lang, currentLang, setLang } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppLogo } from '../../shared/app-logo';

/**
 * Frame for the public reading pages (privacy policy, deleting an account): readable without
 * signing in, because Google Play links to them and checks they open for anyone.
 */
@Component({
  selector: 'app-legal-layout',
  imports: [TranslatePipe, RouterLink, MatIconModule, AppLogo],
  template: `
    <div class="legal-wrap">
      <header class="legal-top">
        <a class="brand" [routerLink]="auth.isLoggedIn() ? '/' : '/login'">
          <app-logo [size]="34" />
          <span class="brand-text"><span class="name">{{ app.name }}</span><span class="by">{{ app.publisher.name }}</span></span>
        </a>
        <span class="spacer"></span>
        <div class="lang" role="group" [attr.aria-label]="'Language' | t">
          @for (l of languages; track l.code) {
            <button type="button" [class.on]="lang() === l.code" (click)="setLang(l.code)" [attr.lang]="l.code" [attr.aria-pressed]="lang() === l.code">{{ l.label }}</button>
          }
        </div>
      </header>

      <main class="legal-main">
        <article class="card doc">
          <ng-content />
        </article>
        <nav class="legal-links">
          <a routerLink="/privacy">{{ 'Privacy policy' | t }}</a>
          <span aria-hidden="true">·</span>
          <a routerLink="/delete-account">{{ 'Delete your account' | t }}</a>
          <span aria-hidden="true">·</span>
          <a [routerLink]="auth.isLoggedIn() ? '/' : '/login'">{{ (auth.isLoggedIn() ? 'Back to the app' : 'Log in') | t }}</a>
        </nav>
        <p class="copy">{{ copyright() }}</p>
      </main>
    </div>
  `,
  styles: `
    .legal-wrap { min-height: 100vh; min-height: 100dvh; background: var(--erp-bg); }
    .legal-top { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px;
      padding: calc(12px + env(safe-area-inset-top, 0px)) 20px 12px; background: var(--erp-hero-bg); color: #fff; }
    .brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; min-width: 0; }
    .brand-text { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
    .brand-text .name { font-weight: 700; font-size: 15.5px; }
    .brand-text .by { font-size: 12px; color: rgba(255, 255, 255, .72); }
    .spacer { flex: 1; }
    .lang { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: rgba(255, 255, 255, .12); border: 1px solid rgba(255, 255, 255, .2); }
    .lang button { border: 0; background: none; color: rgba(255, 255, 255, .85); font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; cursor: pointer; }
    .lang button.on { background: #fff; color: #312e81; }
    .legal-main { max-width: 820px; margin: 0 auto; padding: 28px 20px calc(36px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
    .doc { padding: 32px 36px; }
    .legal-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 10px; margin-top: 22px; font-size: 13px; color: var(--erp-faint); }
    .legal-links a { color: var(--erp-brand); font-weight: 550; text-decoration: none; }
    .copy { text-align: center; font-size: 12px; color: var(--erp-faint); margin: 10px 0 0; }
    @media (max-width: 600px) {
      .legal-top { padding-left: 16px; padding-right: 16px; }
      .brand-text .by { display: none; }
      .legal-main { padding: 16px 12px calc(28px + env(safe-area-inset-bottom, 0px)); }
      .doc { padding: 22px 18px; }
    }
  `,
})
export class LegalLayout {
  readonly auth = inject(AuthService);
  readonly app = APP_INFO;
  readonly languages = LANGUAGES;
  readonly lang = currentLang;
  readonly copyright = () => copyrightLine();

  setLang(lang: Lang): void {
    setLang(lang);
  }
}
