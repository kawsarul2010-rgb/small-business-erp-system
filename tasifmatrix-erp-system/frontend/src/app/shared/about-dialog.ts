import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { APP_INFO, PUBLISHER_LINE, copyrightLine, websiteLabel, websiteUrl } from '../core/app-info';
import { AppLogo } from './app-logo';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * The standard "About this app" screen: product identity, version and who makes it.
 * Opened from the account menu on desktop and from the More tab on phones.
 */
@Component({
  selector: 'app-about-dialog',
  imports: [TranslatePipe, RouterLink, MatDialogModule, MatButtonModule, MatIconModule, AppLogo],
  template: `
    <mat-dialog-content class="about">
      <div class="identity">
        <app-logo [size]="64" class="mark" />
        <h2>{{ app.name }}</h2>
        <p class="version">{{ 'Version {v}' | t: { v: app.version } }}</p>
      </div>

      <div class="credit">
        <div class="label">{{ 'A product of' | t }}</div>
        <div class="who">{{ app.publisher.name }}</div>
        <div class="role">{{ role | t }}</div>
      </div>

      <a class="website" [href]="website" target="_blank" rel="noopener noreferrer">
        <mat-icon>language</mat-icon>
        <span>
          <span class="web-label">{{ 'Website' | t }}</span>
          <span class="web-url">{{ websiteText }}</span>
        </span>
        <mat-icon class="open">open_in_new</mat-icon>
      </a>

      <p class="legal"><a routerLink="/privacy" mat-dialog-close>{{ 'Privacy policy' | t }}</a></p>
      <p class="copyright">{{ copyright() }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close cdkFocusInitial>{{ 'Close' | t }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .about { padding-top: 12px; text-align: center; }
    .identity .mark { margin: 4px auto 12px; filter: drop-shadow(0 6px 14px rgba(79, 70, 229, .3)); }
    .identity h2 { margin: 0; font-size: 20px; font-weight: 650; }
    .version { margin: 2px 0 0; font-size: 13px; color: var(--erp-muted); }

    .credit { margin: 20px 0 0; padding: 16px 12px; border-radius: 14px; background: var(--erp-card-2); border: 1px solid var(--erp-border); }
    .credit .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--erp-faint); }
    .credit .who { margin-top: 6px; font-size: 16px; font-weight: 650; }
    .credit .role { margin-top: 2px; font-size: 13px; color: var(--erp-muted); }

    .website { display: flex; align-items: center; gap: 12px; margin: 10px 0 0; padding: 12px 14px; border-radius: 14px; text-align: left;
      border: 1px solid var(--erp-border); color: inherit; text-decoration: none; transition: background-color .15s ease, border-color .15s ease; }
    .website:hover { background: var(--erp-card-2); border-color: var(--erp-brand); }
    .website > mat-icon { flex: none; color: var(--erp-brand); }
    .website > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .web-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--erp-faint); }
    .web-url { font-size: 14.5px; font-weight: 600; color: var(--erp-brand); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .website .open { font-size: 18px; width: 18px; height: 18px; color: var(--erp-faint); }

    .legal { margin: 14px 0 0; font-size: 13px; }
    .legal a { color: var(--erp-brand); font-weight: 550; }
    .copyright { margin: 6px 0 0; font-size: 11.5px; color: var(--erp-faint); }
  `,
})
export class AboutDialog {
  readonly app = APP_INFO;
  readonly role = PUBLISHER_LINE;
  readonly copyright = () => copyrightLine();
  readonly website = websiteUrl();
  readonly websiteText = websiteLabel(this.website);
}

/**
 * Opens the About dialog. Short informational dialogs stay a centred box on every screen
 * size - the full-screen sheet is reserved for forms, where the height is actually used.
 */
export function openAboutDialog(dialog: MatDialog): void {
  dialog.open(AboutDialog, { width: '360px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' });
}
