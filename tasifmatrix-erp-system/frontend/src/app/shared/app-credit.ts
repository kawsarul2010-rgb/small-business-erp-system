import { Component } from '@angular/core';
import { APP_INFO, PUBLISHER_LINE, copyrightLine } from '../core/app-info';

/** One-line publisher credit for pages outside the shell, such as the login screen. */
@Component({
  selector: 'app-credit',
  template: `
    <footer class="credit">
      <div>{{ app.name }} <span class="ver">v{{ app.version }}</span></div>
      <div>A product of <strong>{{ app.publisher.name }}</strong></div>
      <div class="role">{{ copyright }}</div>
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
  `,
})
export class AppCredit {
  readonly app = APP_INFO;
  readonly copyright = copyrightLine();
}
