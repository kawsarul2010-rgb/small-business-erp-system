import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, QueryValue } from '../core/api.service';
import { LayoutService } from '../core/layout.service';
import { NotifyService } from '../core/notify.service';
import { PlatformService } from '../core/platform.service';
import { applyServerErrors, controlError } from './form-errors';

export interface SharePdfData {
  /** What is being shared, e.g. "Sales invoice 100042" or "Customer report". */
  title: string;
  fileName: string;
  /** Already fetched, so nothing here waits on the network before opening a window. */
  blob: Blob;
  /** POST endpoint that re-renders and emails the same document, e.g. "/reports/customers/pdf/email". */
  emailPath: string;
  /** Query sent with that POST so the server builds the document from the same filters. */
  emailQuery?: Record<string, QueryValue>;
  /** Prefilled from the order's party, where there is one. */
  mobileNumber?: string | null;
  emailAddress?: string | null;
  /** Prefilled message; the user can edit it. */
  message?: string;
}

/**
 * Sharing a PDF from a browser.
 *
 * On a phone the operating system takes the file and offers WhatsApp, Gmail and the rest. A
 * desktop browser has no equivalent it can rely on, so this offers the three routes that do work,
 * best first:
 *
 *  1. The Web Share API, when the browser supports files (Safari on macOS, Chrome on Windows).
 *     This is the same experience as the phone.
 *  2. WhatsApp: no web page can attach a file to WhatsApp Web, so the PDF is saved and the chat
 *     opens with the message already written. The user attaches the saved file.
 *  3. Email: the server renders the document again and sends it as a real attachment, which is
 *     the only fully automatic route on a desktop. Failing that, the user's own mail client.
 *
 * The wording in the dialog says which is which, because a button that looks like it sent a file
 * and only sent text is worse than no button.
 */
@Component({
  selector: 'app-share-pdf-dialog',
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
  ],
  styles: `
    .intro { margin: 0 0 4px; color: var(--erp-muted); font-size: 13px; }
    .block { padding: 14px 0; border-top: 1px solid var(--erp-border); }
    .block:first-of-type { border-top: 0; padding-top: 4px; }
    .block h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 14px; font-weight: 600; }
    .hint { margin: 6px 0 0; color: var(--erp-muted); font-size: 12px; line-height: 1.45; }
    .row { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
    .row mat-form-field { flex: 1 1 200px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .full { width: 100%; }
    mat-spinner { display: inline-block; margin-right: 8px; }
  `,
  template: `
    <h2 mat-dialog-title>Share {{ data.title }}</h2>
    <mat-dialog-content>
      <p class="intro">{{ data.fileName }}</p>

      @if (canShareFile) {
        <div class="block">
          <h3><mat-icon>ios_share</mat-icon>Share the file</h3>
          <button mat-flat-button class="full" (click)="systemShare()" [disabled]="busy()">
            Open the share sheet
          </button>
          <p class="hint">Sends the PDF itself to WhatsApp, Mail or anything else on this device.</p>
        </div>
      }

      <div class="block">
        <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
          <mat-label>Message</mat-label>
          <textarea matInput rows="2" [formControl]="message"></textarea>
        </mat-form-field>
        <p class="hint">Used for the WhatsApp chat and the email body.</p>
      </div>

      <div class="block">
        <h3><mat-icon>chat</mat-icon>WhatsApp</h3>
        <div class="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Mobile number (optional)</mat-label>
            <input matInput [formControl]="whatsappNumber" inputmode="tel" placeholder="01712345678" />
          </mat-form-field>
          <button mat-stroked-button (click)="whatsapp()" [disabled]="busy()">
            <mat-icon>chat</mat-icon>
            Save PDF &amp; open chat
          </button>
        </div>
        <p class="hint">
          WhatsApp does not let a website attach a file, so the PDF is saved to this device first and
          the chat opens with your message. Attach the saved file with the paperclip.
        </p>
      </div>

      <div class="block" [formGroup]="emailForm">
        <h3><mat-icon>mail</mat-icon>Email</h3>
        <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
          <mat-label>Email address</mat-label>
          <input matInput formControlName="to" type="email" autocomplete="off" placeholder="name@example.com" />
          @if (emailError(); as text) { <mat-error>{{ text }}</mat-error> }
        </mat-form-field>
        <div class="actions" style="margin-top: 10px">
          <button mat-flat-button (click)="sendFromServer()" [disabled]="busy()">
            @if (sending()) { <mat-spinner diameter="16" /> }
            {{ sending() ? 'Sending…' : 'Send with the PDF attached' }}
          </button>
          <button mat-stroked-button (click)="mailClient()" [disabled]="busy()">
            <mat-icon>drafts</mat-icon>
            Use my own email app
          </button>
        </div>
        <p class="hint">
          The first sends from the server with the PDF attached — nothing left for you to do. The
          second saves the PDF and opens your mail app with the message ready; you attach the file,
          because a browser cannot attach one for you.
        </p>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="download()" [disabled]="busy()">
        <mat-icon>download</mat-icon>
        Download
      </button>
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
})
export class SharePdfDialog {
  readonly data = inject<SharePdfData>(MAT_DIALOG_DATA);

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly platform = inject(PlatformService);

  readonly canShareFile = this.platform.canShareFile(this.data.fileName);
  readonly sending = signal(false);
  readonly busy = computed(() => this.sending());

  readonly message = this.fb.control(this.data.message ?? `${this.data.title} is attached.`, { nonNullable: true });
  readonly whatsappNumber = this.fb.control(this.data.mobileNumber ?? '', { nonNullable: true });
  readonly emailForm = this.fb.group({
    to: this.fb.control(this.data.emailAddress ?? '', { validators: [Validators.required, Validators.email], nonNullable: true }),
  });

  emailError(): string {
    const control = this.emailForm.controls.to;
    return control.touched && control.invalid ? controlError(control, 'Email address') : '';
  }

  async systemShare(): Promise<void> {
    try {
      await this.platform.sharePdf(this.data.blob, this.data.fileName, this.data.title, this.message.value.trim());
    } catch (e) {
      this.notify.error(e);
    }
  }

  download(): void {
    this.platform.savePdf(this.data.blob, this.data.fileName);
  }

  whatsapp(): void {
    // Saving first: once the chat has focus the user needs the file already on disk.
    this.platform.savePdf(this.data.blob, this.data.fileName);
    const number = whatsappNumber(this.whatsappNumber.value);
    const text = encodeURIComponent(this.message.value.trim() || this.data.title);
    this.platform.openExternal(`https://wa.me/${number ?? ''}?text=${text}`);
    this.notify.success(`${this.data.fileName} was saved. Attach it in the chat.`);
  }

  mailClient(): void {
    this.platform.savePdf(this.data.blob, this.data.fileName);
    const to = encodeURIComponent(this.emailForm.controls.to.value.trim());
    const subject = encodeURIComponent(this.data.title);
    const body = encodeURIComponent(`${this.message.value.trim()}\n\n(${this.data.fileName} is attached.)`);
    this.platform.openMailClient(`mailto:${to}?subject=${subject}&body=${body}`);
    this.notify.success(`${this.data.fileName} was saved. Attach it to the email.`);
  }

  sendFromServer(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    const body = { to: this.emailForm.controls.to.value.trim(), message: this.message.value.trim() || null };
    this.api.post<void>(this.data.emailPath, body, this.data.emailQuery).subscribe({
      next: () => {
        this.sending.set(false);
        this.notify.success(`Sent to ${body.to} with the PDF attached.`);
      },
      error: (e: unknown) => {
        this.sending.set(false);
        applyServerErrors(this.emailForm, e);
        this.notify.error(e);
      },
    });
  }
}

/**
 * Turns what the user typed into the international form wa.me needs. Bangladesh numbers are
 * usually written 01712345678, which has to travel as 8801712345678.
 */
export function whatsappNumber(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
  return digits; // already written with a country code
}

/**
 * Fetches the PDF, then opens the share dialog. The fetch happens first on purpose: opening a
 * window after an await is what popup blockers stop.
 */
export function openSharePdfDialog(
  deps: { api: ApiService; dialog: MatDialog; layout: LayoutService; notify: NotifyService },
  pdfPath: string,
  query: Record<string, QueryValue>,
  details: Omit<SharePdfData, 'blob' | 'emailPath' | 'emailQuery'>,
  done?: () => void,
): void {
  deps.api.blob(pdfPath, query).subscribe({
    next: (blob) => {
      done?.();
      deps.dialog.open(SharePdfDialog, deps.layout.dialog<SharePdfData>(
        { ...details, blob, emailPath: `${pdfPath}/email`, emailQuery: query },
        '520px',
      ));
    },
    error: (e: unknown) => {
      done?.();
      deps.notify.error(e);
    },
  });
}
