import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { APP_INFO, PUBLISHER_LINE, copyrightLine } from '../core/app-info';
import { AppLogo } from './app-logo';

/**
 * The standard "About this app" screen: product identity, version and who makes it.
 * Opened from the account menu on desktop and from the More tab on phones.
 */
@Component({
  selector: 'app-about-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, AppLogo],
  template: `
    <mat-dialog-content class="about">
      <div class="identity">
        <app-logo [size]="64" class="mark" />
        <h2>{{ app.name }}</h2>
        <p class="version">Version {{ app.version }}</p>
      </div>

      <div class="credit">
        <div class="label">A product of</div>
        <div class="who">{{ app.publisher.name }}</div>
        <div class="role">{{ role }}</div>
      </div>

      <p class="copyright">{{ copyright }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close cdkFocusInitial>Close</button>
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

    .copyright { margin: 14px 0 0; font-size: 11.5px; color: var(--erp-faint); }
  `,
})
export class AboutDialog {
  readonly app = APP_INFO;
  readonly role = PUBLISHER_LINE;
  readonly copyright = copyrightLine();
}

/**
 * Opens the About dialog. Short informational dialogs stay a centred box on every screen
 * size - the full-screen sheet is reserved for forms, where the height is actually used.
 */
export function openAboutDialog(dialog: MatDialog): void {
  dialog.open(AboutDialog, { width: '360px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' });
}
