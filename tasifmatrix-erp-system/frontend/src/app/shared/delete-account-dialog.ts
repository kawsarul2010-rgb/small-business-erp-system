import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService, problemOf } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from './form-errors';
import { PasswordToggle } from './password-toggle';

interface DeletionInfo {
  mustCloseBusiness: boolean;
  businessName: string | null;
  businessCode: string | null;
  otherUsers: number;
}

/**
 * Deletes the signed-in account (Google Play requires this in the app). The business's only admin
 * closes the whole business instead, after typing its code; everyone else just leaves.
 */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule, PasswordToggle],
  template: `
    <h2 mat-dialog-title>{{ (info()?.mustCloseBusiness ? 'Close business and delete account' : 'Delete my account') | t }}</h2>
    @if (!info() && !loadError()) { <mat-progress-bar mode="indeterminate" /> }
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content>
        @if (loadError()) { <p class="negative">{{ loadError() | t }}</p> }
        @if (info(); as i) {
          @if (i.mustCloseBusiness) {
            <div class="warn-box">
              <mat-icon>warning</mat-icon>
              <div>
                <strong>{{ 'You are the only admin of {name}.' | t: { name: i.businessName } }}</strong>
                {{ 'Deleting your account closes the business. These are deleted for good:' | t }}
                <ul>
                  <li>{{ 'its companies, customers, suppliers and products' | t }}</li>
                  <li>{{ 'all stock, orders, payments, invoices and SMS' | t }}</li>
                  <li>{{ (i.otherUsers === 1 ? 'your account and 1 other account in the business' : 'your account and {n} other accounts in the business') | t: { n: i.otherUsers } }}</li>
                </ul>
                {{ 'Your subscription payments are kept, as accounting records.' | t }}
              </div>
            </div>
            <p class="hint">
              {{ 'Want the business to carry on without you? Make someone else an admin on the Users page first, then delete only your account.' | t }}
              <a routerLink="/users" mat-dialog-close>{{ 'Open Users' | t }}</a>
            </p>
            <mat-form-field class="full">
              <mat-label>{{ 'Business code' | t }}</mat-label>
              <input matInput formControlName="businessCode" autocomplete="off" autocapitalize="none" spellcheck="false" [placeholder]="i.businessCode ?? ''" />
              <mat-hint>{{ 'Type {code} to confirm' | t: { code: i.businessCode } }}</mat-hint>
              <mat-error>{{ err('businessCode', 'Business code') }}</mat-error>
            </mat-form-field>
          } @else {
            <p>{{ 'This deletes your account for good:' | t }}</p>
            <ul class="plain">
              <li>{{ 'your name, email, mobile number and password are erased' | t }}</li>
              <li>{{ 'you are signed out on every device' | t }}</li>
              <li>{{ 'records you entered for {name} (orders, payments, stock) stay with the business, without your name' | t: { name: i.businessName } }}</li>
            </ul>
          }
          <mat-form-field class="full">
            <mat-label>{{ 'Your password' | t }}</mat-label>
            <input matInput #pw type="password" formControlName="password" autocomplete="current-password" />
            <app-password-toggle matSuffix [for]="pw" />
            <mat-error>{{ err('password', 'Password') }}</mat-error>
          </mat-form-field>
          <mat-checkbox formControlName="understood">{{ 'I understand this cannot be undone.' | t }}</mat-checkbox>
          @if (error()) { <p class="negative">{{ error() | t }}</p> }
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        @if (info(); as i) {
          <button mat-flat-button class="danger-btn" type="submit" [disabled]="busy() || !canSubmit()">
            {{ (i.mustCloseBusiness ? 'Close business and delete' : 'Delete my account') | t }}
          </button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; margin-top: 8px; }
    .warn-box { display: flex; gap: 12px; padding: 14px 16px; border-radius: 12px; font-size: 13.5px; line-height: 1.55;
      background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); }
    .warn-box > mat-icon { flex: none; }
    .warn-box strong { display: block; margin-bottom: 2px; }
    .warn-box ul { margin: 6px 0; padding-left: 18px; }
    .hint { font-size: 13px; color: var(--erp-muted); line-height: 1.5; margin: 12px 0 4px; }
    .hint a { color: var(--erp-brand); font-weight: 600; }
    ul.plain { margin: 0 0 8px; padding-left: 18px; line-height: 1.6; font-size: 14px; }
    mat-checkbox { margin: 4px 0 0 -8px; }
    .danger-btn { background: var(--erp-negative) !important; color: #fff !important; }
    .danger-btn:disabled { opacity: .5; }
  `,
})
export class DeleteAccountDialog implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<DeleteAccountDialog>);

  readonly info = signal<DeletionInfo | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', Validators.required],
    businessCode: [''],
    understood: [false],
  });
  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly canSubmit = computed(() => {
    const v = this.values();
    const i = this.info();
    if (!i || !v.understood || !v.password) return false;
    return !i.mustCloseBusiness || (v.businessCode ?? '').trim().toLowerCase() === (i.businessCode ?? '').toLowerCase();
  });

  ngOnInit(): void {
    this.api.get<DeletionInfo>('/auth/delete-account').subscribe({
      next: (i) => this.info.set(i),
      error: (e) => this.loadError.set(problemOf(e).title ?? 'Could not load your account.'),
    });
  }

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  submit(): void {
    const i = this.info();
    if (!i || !this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.api.post<void>('/auth/delete-account', {
      password: v.password,
      closeBusiness: i.mustCloseBusiness,
      businessCode: i.mustCloseBusiness ? v.businessCode.trim() : null,
    }).subscribe({
      next: () => {
        this.ref.close(true);
        this.auth.accountDeleted(i.mustCloseBusiness);
      },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
