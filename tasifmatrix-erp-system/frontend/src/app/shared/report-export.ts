import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, QueryValue } from '../core/api.service';
import { LayoutService } from '../core/layout.service';
import { NotifyService } from '../core/notify.service';
import { PlatformService } from '../core/platform.service';
import { openSharePdfDialog } from './share-pdf-dialog';

/**
 * Print / download / share for a report.
 *
 * The PDF is built by the server from the same filters the screen is showing, and covers
 * every matching row rather than the page on display. On a phone `openPdf` hands it to the
 * native share sheet; in a browser it opens in a tab, saves, or goes through the share dialog.
 */
@Component({
  selector: 'app-report-export',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    @if (layout.isHandset()) {
      <button mat-icon-button [matMenuTriggerFor]="menu" [disabled]="busy()" aria-label="Export report">
        <mat-icon>print</mat-icon>
      </button>
    } @else {
      <button mat-stroked-button [matMenuTriggerFor]="menu" [disabled]="busy()">
        <mat-icon>print</mat-icon>
        {{ busy() ? 'Preparing…' : 'Print / share' }}
      </button>
    }
    <mat-menu #menu="matMenu" xPosition="before">
      <button mat-menu-item (click)="run(false)">
        <mat-icon>open_in_new</mat-icon>
        {{ platform.isNative ? 'Open or share' : 'Open in a new tab' }}
      </button>
      <button mat-menu-item (click)="run(true)">
        <mat-icon>download</mat-icon>
        Download PDF
      </button>
      <!-- The Android app already has the system share sheet behind "Open or share". -->
      @if (!platform.isNative) {
        <button mat-menu-item (click)="share()">
          <mat-icon>ios_share</mat-icon>
          Share (WhatsApp, email)
        </button>
      }
    </mat-menu>
  `,
})
export class ReportExport {
  /** The PDF endpoint, e.g. "/reports/customers/pdf". */
  readonly path = input.required<string>();
  /** The filters currently applied on screen; sent unchanged to the server. */
  readonly filters = input<Record<string, QueryValue>>({});
  /** What to call the document when sharing it, e.g. "Customer report". */
  readonly label = input('');

  readonly layout = inject(LayoutService);
  readonly platform = inject(PlatformService);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  readonly busy = signal(false);

  run(download: boolean): void {
    this.busy.set(true);
    this.api.blob(this.path(), { ...this.filters(), download }).subscribe({
      next: async (blob) => {
        try {
          await this.platform.openPdf(blob, this.fileName(), download);
        } catch (e) {
          this.notify.error(e);
        }
        this.busy.set(false);
      },
      error: (e) => {
        this.notify.error(e);
        this.busy.set(false);
      },
    });
  }

  share(): void {
    this.busy.set(true);
    const title = this.label() || 'This report';
    openSharePdfDialog(
      { api: this.api, dialog: this.dialog, layout: this.layout, notify: this.notify },
      this.path(),
      this.filters(),
      { title, fileName: this.fileName(), message: `${title} is attached.` },
      () => this.busy.set(false),
    );
  }

  /** A fallback name; the server sends the authoritative one in Content-Disposition. */
  private fileName(): string {
    const slug = this.path().replace(/^\//, '').replace(/\/pdf$/, '').replace(/\//g, '-');
    return `${slug}.pdf`;
  }
}
