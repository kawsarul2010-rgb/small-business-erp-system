import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { APP_INFO } from '../core/app-info';
import { AppBrand } from './app-brand';
import { AppCredit } from './app-credit';

/**
 * Frame for the screens used before signing in (log in, create account, password reset):
 * a brand panel beside the form on desktop, a brand header above the form on phones.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [MatIconModule, AppBrand, AppCredit],
  template: `
    <div class="auth-wrap">
      <aside class="auth-aside">
        <div class="glow" aria-hidden="true"></div>
        <app-brand [inverse]="true" [size]="44" />
        <div class="pitch">
          <h2>Run your whole business from one place.</h2>
          <p>Purchases, sales, stock and payments - always in step, on your computer and on your phone.</p>
          <ul>
            <li><span class="dot"><mat-icon>point_of_sale</mat-icon></span>Sales and purchase orders with printable invoices</li>
            <li><span class="dot"><mat-icon>inventory</mat-icon></span>Live stock with low-stock alerts</li>
            <li><span class="dot"><mat-icon>account_balance_wallet</mat-icon></span>Dues, payments and reports at a glance</li>
          </ul>
        </div>
        <div class="foot">{{ app.publisher.name }} · {{ app.publisher.location }}</div>
      </aside>

      <main class="auth-main">
        <div class="auth-mobile-brand">
          <app-brand [inverse]="true" [size]="44" />
          <span class="tagline">Purchases, sales, stock and payments</span>
        </div>
        <ng-content />
        <app-credit />
      </main>
    </div>
  `,
  styles: `
    .glow {
      position: absolute; inset: auto -120px -160px auto; width: 420px; height: 420px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, .14), rgba(255, 255, 255, 0) 65%);
      pointer-events: none;
    }
    /* the matrix motif, faint in the background */
    .auth-aside::before {
      content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
      background-image: radial-gradient(rgba(255, 255, 255, .16) 1.2px, transparent 1.3px);
      background-size: 22px 22px;
      mask-image: linear-gradient(160deg, rgba(0, 0, 0, .9), transparent 60%);
      -webkit-mask-image: linear-gradient(160deg, rgba(0, 0, 0, .9), transparent 60%);
    }
    .auth-aside > :not(.glow) { position: relative; }
    .pitch { max-width: 460px; }
    .pitch h2 { font-size: 34px; line-height: 1.15; letter-spacing: -0.03em; font-weight: 700; margin: 0 0 14px; }
    .pitch p { font-size: 15.5px; line-height: 1.55; margin: 0 0 28px; color: rgba(255, 255, 255, .8); }
    .pitch ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .pitch li { display: flex; align-items: center; gap: 12px; font-size: 14.5px; color: rgba(255, 255, 255, .92); }
    .dot {
      display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; flex: none;
      background: rgba(255, 255, 255, .12); border: 1px solid rgba(255, 255, 255, .16);
    }
    .dot mat-icon { font-size: 18px; width: 18px; height: 18px; color: #5eead4; }
    .foot { font-size: 12.5px; color: rgba(255, 255, 255, .6); }
  `,
})
export class AuthLayout {
  readonly app = APP_INFO;
}
