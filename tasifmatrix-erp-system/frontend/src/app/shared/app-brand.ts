import { Component, input } from '@angular/core';
import { APP_INFO } from '../core/app-info';
import { AppLogo } from './app-logo';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** The product lock-up (mark + name + publisher) used on the sign-in screens. */
@Component({
  selector: 'app-brand',
  imports: [TranslatePipe, AppLogo],
  template: `
    <div class="brand" [class.inverse]="inverse()">
      <app-logo [size]="size()" />
      <div class="text">
        <span class="name">{{ app.name }}</span>
        <span class="by">{{ 'by {name}' | t: { name: app.publisher.name } }}</span>
      </div>
    </div>
  `,
  styles: `
    .brand { display: flex; align-items: center; gap: 12px; line-height: 1.2; }
    .text { display: flex; flex-direction: column; min-width: 0; text-align: left; }
    .name { font-size: 17px; font-weight: 700; letter-spacing: -0.015em; color: var(--erp-text); }
    .by { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
    .inverse .name { color: #fff; }
    .inverse .by { color: rgba(255, 255, 255, .72); }
  `,
})
export class AppBrand {
  readonly app = APP_INFO;
  readonly size = input(40);
  /** White text, for use on the brand gradient. */
  readonly inverse = input(false);
}
