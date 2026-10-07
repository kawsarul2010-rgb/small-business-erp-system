import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { APP_INFO } from '../core/app-info';
import { AppUpdateService } from '../core/app-update';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AppLogo } from './app-logo';
import { PostBody } from './post-body';

/**
 * The Android app's update messages, over every screen (signed in or not):
 * a required update covers the whole app until it is installed; an optional one is a card at the
 * bottom that can be put off.
 */
@Component({
  selector: 'app-update-gate',
  imports: [TranslatePipe, MatButtonModule, MatIconModule, AppLogo, PostBody],
  template: `
    @if (required(); as c) {
      <div class="blocker" role="alertdialog" aria-modal="true" [attr.aria-label]="'Update required' | t">
        <div class="sheet">
          <app-logo [size]="56" class="logo" />
          <h1>{{ 'Update required' | t }}</h1>
          <p class="lead">{{ 'A new version of {name} is available ({v}). Please update the app to keep using it.' | t: { name: app.name, v: c.latestVersion } }}</p>
          @if (notesOf(c).length) {
            <div class="notes">
              <div class="notes-title">{{ "What's new" | t }}</div>
              @for (n of notesOf(c); track n.version) {
                <div class="note"><strong>{{ n.version }}</strong><app-post-body [text]="n.releaseNotes!" /></div>
              }
            </div>
          }
          <button mat-flat-button class="go" (click)="updates.openStore()"><mat-icon>shop</mat-icon>{{ 'Update on Google Play' | t }}</button>
          <p class="small">{{ 'Your data is safe - it is kept on the server. You are on version {v}.' | t: { v: updates.installed() } }}</p>
        </div>
      </div>
    } @else if (updates.offerVisible() && updates.check(); as c) {
      <div class="offer" role="status">
        <span class="offer-icon"><mat-icon>system_update_alt</mat-icon></span>
        <div class="offer-text">
          <strong>{{ 'Update available' | t }}</strong>
          <span>{{ 'Version {v} is on Google Play.' | t: { v: c.latestVersion } }}</span>
          @if (notesOf(c)[0]; as n) { <app-post-body class="offer-notes" [text]="n.releaseNotes!" /> }
        </div>
        <div class="offer-actions">
          <button mat-button (click)="updates.later()">{{ 'Later' | t }}</button>
          <button mat-flat-button (click)="updates.openStore()">{{ 'Update' | t }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .blocker { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; overflow-y: auto;
      padding: calc(24px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px));
      background: var(--erp-bg); }
    .sheet { width: 100%; max-width: 420px; text-align: center; }
    .logo { margin: 0 auto 18px; filter: drop-shadow(0 8px 18px rgba(79, 70, 229, .3)); }
    h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -0.02em; }
    .lead { margin: 0 0 18px; color: var(--erp-muted); font-size: 15px; line-height: 1.55; }
    .notes { text-align: left; padding: 14px 16px; margin-bottom: 20px; border-radius: 14px; background: var(--erp-card); border: 1px solid var(--erp-border);
      max-height: 36vh; overflow-y: auto; font-size: 14px; }
    .notes-title { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--erp-faint); margin-bottom: 6px; }
    .note + .note { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--erp-border); }
    .note strong { display: block; font-size: 13px; margin-bottom: 2px; }
    .go { width: 100%; height: 50px; font-size: 16px; font-weight: 650; }
    .small { margin: 14px 0 0; font-size: 12.5px; color: var(--erp-faint); line-height: 1.5; }

    .offer { position: fixed; z-index: 1500; left: 12px; right: 12px;
      bottom: calc(var(--erp-bottom-nav, 64px) + var(--erp-safe-bottom, 0px) + 12px);
      display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; padding: 14px 14px 10px; border-radius: 16px;
      background: var(--erp-card); border: 1px solid var(--erp-border); box-shadow: 0 12px 32px rgba(15, 23, 42, .18);
      animation: erp-rise .25s ease-out; }
    .offer-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .offer-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; }
    .offer-text strong { font-size: 15px; }
    .offer-notes { color: var(--erp-muted); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .offer-actions { display: flex; justify-content: flex-end; gap: 4px; width: 100%; }
    @keyframes erp-rise { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (min-width: 841px) { .offer { left: auto; right: 24px; bottom: 24px; max-width: 420px; } }
  `,
})
export class AppUpdateGate {
  readonly updates = inject(AppUpdateService);
  readonly app = APP_INFO;
  readonly required = computed(() => {
    const c = this.updates.check();
    return c?.advice === 'REQUIRED' ? c : null;
  });

  notesOf(c: { notes: { version: string; releaseNotes: string | null }[] }) {
    return c.notes.filter((n) => !!n.releaseNotes);
  }
}
