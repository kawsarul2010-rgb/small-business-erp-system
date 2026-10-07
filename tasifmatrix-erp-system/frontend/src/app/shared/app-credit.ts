import { Component } from '@angular/core';
import { APP_INFO, PUBLISHER_LINE, copyrightLine } from '../core/app-info';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** One-line publisher credit for pages outside the shell, such as the login screen. */
@Component({
  selector: 'app-credit',
  imports: [TranslatePipe, RouterLink],
  template: `
    <footer class="credit">
      <div>{{ app.name }} <span class="ver">v{{ app.version }}</span></div>
      <div>{{ 'A product of {name}' | t: { name: app.publisher.name } }}</div>
      <div class="role">{{ copyright() }}</div>
      <div class="links"><a routerLink="/privacy">{{ 'Privacy policy' | t }}</a> · <a routerLink="/delete-account">{{ 'Delete your account' | t }}</a></div>
    </footer>
  `,
  styles: `
    .credit {
      margin: 20px auto 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      text-align: center;
      font-size: 12px;
      line-height: 1.6;
      color: var(--erp-muted);
    }
    .ver, .role { color: var(--erp-faint); }
    .role { font-size: 11.5px; }
    .links { margin-top: 4px; font-size: 12px; color: var(--erp-faint); }
    .links a { color: var(--erp-muted); text-decoration: underline; text-underline-offset: 2px; }
  `,
})
export class AppCredit {
  readonly app = APP_INFO;
  readonly copyright = () => copyrightLine();
}
