import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { APP_INFO } from '../../core/app-info';
import { LayoutService } from '../../core/layout.service';
import { BusinessDetail, CreatedBusiness, IssuedCredentials } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PlatformService } from '../../core/platform.service';
import { applyServerErrors, bdMobileValidator, controlError } from '../../shared/form-errors';

/** Same rule as the server (TenantCodes) and the database constraint ck_tenant_code. */
export const BUSINESS_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** "Rahim Store & Co." -> "rahim-store-co", as the server suggests it. */
export function suggestBusinessCode(name: string): string {
  let code = '';
  for (const c of name.trim().toLowerCase()) {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) code += c;
    else if (code.length > 0 && !code.endsWith('-')) code += '-';
  }
  code = code.replace(/^-+|-+$/g, '');
  if (code.length > 30) code = code.slice(0, 30).replace(/-+$/, '');
  return code;
}

// ====================================================================== create / edit a business

@Component({
  selector: 'app-business-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit business' : 'New business' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field class="span-2">
            <mat-label>Business name</mat-label>
            <input matInput formControlName="name" (input)="nameChanged()" />
            <mat-error>{{ err('name', 'Business name') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Business code</mat-label>
            <input matInput formControlName="code" autocapitalize="off" spellcheck="false" (input)="codeTouchedByUser = true" />
            <mat-hint>People enter this when they register, e.g. {{ form.controls.code.value || 'rahim-store' }}</mat-hint>
            <mat-error>{{ codeError() }}</mat-error>
          </mat-form-field>
          <mat-form-field><mat-label>Contact person</mat-label><input matInput formControlName="contactName" /></mat-form-field>
          <mat-form-field>
            <mat-label>Contact mobile</mat-label>
            <input matInput formControlName="contactPhone" inputmode="tel" placeholder="01712345678" />
            <mat-error>{{ err('contactPhone', 'Contact mobile') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Contact email</mat-label>
            <input matInput formControlName="contactEmail" type="email" />
            <mat-error>{{ err('contactEmail', 'Contact email') }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Notes (only you see these)</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </div>

        @if (!data) {
          <h3 class="section">First admin</h3>
          <p class="muted hint">This person runs the business's account: companies, products, users. They get a temporary password to change at first sign-in.</p>
          <div class="form-grid" formGroupName="admin">
            <mat-form-field class="span-2">
              <mat-label>Admin name</mat-label>
              <input matInput formControlName="userName" />
              <mat-error>{{ err('admin.userName', 'Admin name') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Admin email (to sign in)</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="off" />
              <mat-error>{{ err('admin.email', 'Admin email') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Admin mobile</mat-label>
              <input matInput formControlName="phoneNumber" inputmode="tel" placeholder="01712345678" />
              <mat-error>{{ err('admin.phoneNumber', 'Admin mobile') }}</mat-error>
            </mat-form-field>
          </div>
        }
        @if (error()) { <p class="negative">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ data ? 'Save' : 'Create business' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .section { margin: 18px 0 2px; font-size: 14px; font-weight: 600; }
    .hint { margin: 0 0 12px; font-size: 12.5px; line-height: 1.45; }
  `,
})
export class BusinessDialog {
  readonly data = inject<BusinessDetail | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<BusinessDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** The code follows the name until the person edits the code themselves. */
  codeTouchedByUser = !!this.data;

  readonly form = this.fb.group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    code: [this.data?.code ?? '', [Validators.required, Validators.pattern(BUSINESS_CODE_PATTERN)]],
    contactName: [this.data?.contactName ?? '', Validators.maxLength(100)],
    contactPhone: [this.data?.contactPhone ?? '', bdMobileValidator],
    contactEmail: [this.data?.contactEmail ?? '', [Validators.email, Validators.maxLength(200)]],
    notes: [this.data?.notes ?? '', Validators.maxLength(1000)],
    admin: this.fb.group({
      userName: ['', this.data ? [] : [Validators.required, Validators.maxLength(100)]],
      email: ['', this.data ? [] : [Validators.required, Validators.email, Validators.maxLength(200)]],
      phoneNumber: ['', this.data ? [] : [Validators.required, bdMobileValidator]],
    }),
  });

  private readonly codeValue = toSignal(this.form.controls.code.valueChanges, { initialValue: this.form.controls.code.value });
  readonly codeError = computed(() => {
    this.codeValue();
    const c = this.form.controls.code;
    if (c.errors?.['pattern']) return '3-30 lowercase letters, numbers or hyphens; no hyphen at either end.';
    return controlError(c, 'Business code');
  });

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  nameChanged(): void {
    if (!this.codeTouchedByUser) this.form.controls.code.setValue(suggestBusinessCode(this.form.controls.name.value ?? ''));
  }

  save(): void {
    // Codes are lowercase; accept "Rahim-Store" and store "rahim-store".
    this.form.controls.code.setValue((this.form.controls.code.value ?? '').trim().toLowerCase());
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const business = { code: v.code, name: v.name, contactName: v.contactName, contactPhone: v.contactPhone, contactEmail: v.contactEmail, notes: v.notes };
    const req: Observable<BusinessDetail | CreatedBusiness> = this.data
      ? this.api.put<BusinessDetail>(`/platform/businesses/${this.data.uuid}`, { ...business, revision: this.data.revision })
      : this.api.post<CreatedBusiness>('/platform/businesses', { ...business, admin: v.admin });
    req.subscribe({
      next: (result) => {
        this.notify.success(this.data ? 'Business saved.' : 'Business created.');
        this.ref.close(result);
      },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ====================================================================== suspend

@Component({
  selector: 'app-suspend-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Suspend {{ data.name }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted" style="margin-top: 0">
          Everyone in this business is signed out and cannot sign in until you reactivate it.
          Nothing is deleted: their data comes back exactly as it was.
        </p>
        <mat-form-field class="full">
          <mat-label>Reason (only you see this)</mat-label>
          <textarea matInput rows="3" formControlName="reason" placeholder="e.g. Subscription unpaid since August"></textarea>
          <mat-error>{{ err() }}</mat-error>
        </mat-form-field>
        @if (error()) { <p class="negative">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" class="danger" [disabled]="busy()">Suspend</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.full { width: 100%; }`,
})
export class SuspendDialog {
  readonly data = inject<BusinessDetail>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SuspendDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({ reason: ['', [Validators.required, Validators.maxLength(500)]] });

  err(): string {
    return controlError(this.form.controls.reason, 'Reason');
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.api.post<BusinessDetail>(`/platform/businesses/${this.data.uuid}/suspend`, { reason: this.form.value.reason, revision: this.data.revision }).subscribe({
      next: (updated) => { this.notify.success(`${this.data.name} is suspended.`); this.ref.close(updated); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ====================================================================== add another admin

@Component({
  selector: 'app-add-admin-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Add an admin to {{ data.name }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted" style="margin-top: 0">For when the business's admin has left or lost access. They get a temporary password.</p>
        <div class="form-grid">
          <mat-form-field class="span-2"><mat-label>Name</mat-label><input matInput formControlName="userName" /><mat-error>{{ err('userName', 'Name') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>Email (to sign in)</mat-label><input matInput formControlName="email" type="email" autocomplete="off" /><mat-error>{{ err('email', 'Email') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>Mobile</mat-label><input matInput formControlName="phoneNumber" inputmode="tel" placeholder="01712345678" /><mat-error>{{ err('phoneNumber', 'Mobile') }}</mat-error></mat-form-field>
        </div>
        @if (error()) { <p class="negative">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="busy()">Add admin</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class AddAdminDialog {
  readonly data = inject<BusinessDetail>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AddAdminDialog>);
  private readonly api = inject(ApiService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({
    userName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phoneNumber: ['', [Validators.required, bdMobileValidator]],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.api.post<IssuedCredentials>(`/platform/businesses/${this.data.uuid}/admins`, this.form.getRawValue()).subscribe({
      next: (credentials) => this.ref.close(credentials),
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}

// ====================================================================== show a temporary password once

export interface CredentialsDialogData {
  credentials: IssuedCredentials;
  businessName: string;
  businessCode: string;
}

@Component({
  selector: 'app-credentials-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Sign-in details for {{ data.credentials.userName }}</h2>
    <mat-dialog-content>
      <p class="warn-box">
        <mat-icon>visibility_off</mat-icon>
        <span>This password is shown <strong>only now</strong>. Copy it before closing. If it is lost, reset it from the business page.</span>
      </p>
      <dl class="creds">
        <dt>Business</dt><dd>{{ data.businessName }} <span class="muted">({{ data.businessCode }})</span></dd>
        <dt>Email</dt><dd>{{ data.credentials.email }}</dd>
        <dt>Temporary password</dt><dd class="password">{{ data.credentials.temporaryPassword }}</dd>
        @if (signInUrl) { <dt>Sign in at</dt><dd>{{ signInUrl }}</dd> }
      </dl>
      <p class="muted small">They will be asked to choose their own password at first sign-in.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="copy()"><mat-icon>content_copy</mat-icon>{{ copied() ? 'Copied' : 'Copy message' }}</button>
      <button mat-flat-button mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
  styles: `
    .warn-box { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 14px; padding: 10px 12px; border-radius: 10px;
      background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); font-size: 13px; line-height: 1.45; }
    .warn-box mat-icon { flex: none; }
    .creds { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
    .creds dt { color: var(--erp-muted); }
    .creds dd { margin: 0; word-break: break-all; }
    .password { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 17px; font-weight: 600; letter-spacing: .04em; }
    .small { font-size: 12.5px; margin: 14px 0 0; }
  `,
})
export class CredentialsDialog {
  readonly data = inject<CredentialsDialogData>(MAT_DIALOG_DATA);
  private readonly notify = inject(NotifyService);
  private readonly platform = inject(PlatformService);
  readonly copied = signal(false);

  /** The website's address. Inside the Android app the origin is the app itself, so it is left out. */
  readonly signInUrl = this.platform.isNative ? null : `${location.origin}/login`;

  async copy(): Promise<void> {
    const c = this.data.credentials;
    const lines = [
      `Your ${APP_INFO.name} account for ${this.data.businessName} is ready.`,
      this.signInUrl ? `Sign in at: ${this.signInUrl}` : null,
      `Email: ${c.email}`,
      `Temporary password: ${c.temporaryPassword}`,
      'You will be asked to choose your own password when you first sign in.',
    ].filter((l): l is string => !!l);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.copied.set(true);
    } catch {
      this.notify.error('Could not copy automatically. Select the details and copy them by hand.');
    }
  }
}

/** Opens the one-time credentials dialog. It cannot be dismissed by clicking outside. */
export function showCredentials(dialog: MatDialog, layout: LayoutService, data: CredentialsDialogData): void {
  dialog.open(CredentialsDialog, { ...layout.dialog(data, '480px'), disableClose: true });
}
