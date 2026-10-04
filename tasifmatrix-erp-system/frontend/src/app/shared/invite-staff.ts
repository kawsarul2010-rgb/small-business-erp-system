import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { NotifyService } from '../core/notify.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { t } from '../core/i18n/i18n';

/**
 * Tells an admin how staff join the business: share the business code (or a sign-up link that
 * fills it in). Shown on the dashboard after sign-up, and on the Users and Settings pages.
 */
@Component({
  selector: 'app-invite-staff',
  imports: [TranslatePipe, MatButtonModule, MatIconModule],
  template: `
    @if (code(); as c) {
      <section class="card invite" [class.compact]="compact()">
        <span class="icon-badge teal"><mat-icon>group_add</mat-icon></span>
        <div class="body">
          <div class="head">
            <h2>{{ 'Invite your staff' | t }}</h2>
            @if (dismissible()) {
              <button mat-icon-button class="close" (click)="dismissed.emit()" [attr.aria-label]="'Hide' | t"><mat-icon>close</mat-icon></button>
            }
          </div>
          <p>{{ 'To add a worker, share your business code. They tap Create account → Join a business and enter it; then you give them a role on the Users page.' | t }}</p>
          <div class="code-row">
            <span class="code-label">{{ 'Business code' | t }}</span>
            <span class="code" data-test="business-code">{{ c }}</span>
          </div>
          <div class="actions">
            <button mat-stroked-button type="button" (click)="copy(c, 'Business code copied.')"><mat-icon>content_copy</mat-icon>{{ 'Copy code' | t }}</button>
            <button mat-stroked-button type="button" (click)="copy(link(), 'Sign-up link copied.')"><mat-icon>link</mat-icon>{{ 'Copy sign-up link' | t }}</button>
            @if (canShare) {
              <button mat-stroked-button type="button" (click)="share(c)"><mat-icon>share</mat-icon>{{ 'Share' | t }}</button>
            }
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .invite { display: flex; gap: 14px; align-items: flex-start; padding: 18px 20px; margin-bottom: 16px; }
    .invite .icon-badge { flex: none; }
    .body { flex: 1; min-width: 0; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    h2 { margin: 2px 0 4px; font-size: 16px; font-weight: 650; }
    .close { margin: -8px -8px 0 0; }
    p { margin: 0 0 12px; color: var(--erp-muted); font-size: 13.5px; line-height: 1.5; }
    .code-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .code-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--erp-muted); }
    .code {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 17px; font-weight: 700; letter-spacing: .02em;
      padding: 5px 12px; border-radius: 8px; background: var(--erp-tint-teal-bg); color: var(--erp-tint-teal-fg);
      user-select: all; word-break: break-all;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    @media (max-width: 600px) {
      .invite { padding: 14px; gap: 10px; }
      .actions button { flex: 1 1 auto; }
    }
  `,
})
export class InviteStaff {
  /** Shows a close button; the parent decides what hiding means. */
  readonly dismissible = input(false);
  readonly compact = input(false);
  readonly dismissed = output<void>();

  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  readonly code = computed(() => (this.auth.isAdmin() ? this.auth.user()?.businessCode ?? null : null));
  readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  /** The web address of the sign-up page. In the Android app the page itself is not on the web, so the API's address is used. */
  readonly link = computed(() => {
    const base = /^https?:\/\//.test(environment.apiBaseUrl) ? environment.apiBaseUrl.replace(/\/+$/, '') : location.origin;
    return `${base}/register?business=${encodeURIComponent(this.code() ?? '')}`;
  });

  async copy(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success(done);
    } catch {
      this.notify.error('Could not copy. Select the code and copy it yourself.');
    }
  }

  async share(code: string): Promise<void> {
    try {
      await navigator.share({
        title: t('Join {business}', { business: this.auth.user()?.businessName ?? '' }),
        text: t('Join our business on {product}. Choose Create account → Join a business and enter the business code: {code}', { product: 'Tasif Matrix ERP', code }),
        url: this.link(),
      });
    } catch {
      // closed the share sheet: nothing to do
    }
  }
}
