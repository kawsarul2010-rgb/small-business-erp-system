import { PasswordToggle } from '../../shared/password-toggle';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { controlError, passwordValidator } from '../../shared/form-errors';
import { AuthLayout } from '../../shared/auth-layout';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export function matchValidator(group: AbstractControl) {
  const a = group.get('newPassword')?.value;
  const b = group.get('confirmPassword');
  if (b && b.value && a !== b.value) b.setErrors({ ...(b.errors ?? {}), mismatch: true });
  return null;
}

@Component({
  selector: 'app-reset-password',
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, AuthLayout, PasswordToggle],
  template: `
    <app-auth-layout>
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>{{ 'Set a new password' | t }}</h1>
        @if (done()) {
          <p>{{ 'Your password has been reset. You can now log in with the new password.' | t }}</p>
          <a mat-flat-button class="full-width" routerLink="/login">{{ 'Log in' | t }}</a>
        } @else if (!token) {
          <div class="alert error"><mat-icon>error</mat-icon><span>{{ 'This reset link is invalid. Request a new one.' | t }}</span></div>
          <a mat-button routerLink="/forgot-password">{{ 'Request a new link' | t }}</a>
        } @else {
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'New password' | t }}</mat-label>
            <input matInput #pwNewPassword type="password" formControlName="newPassword" autocomplete="new-password" />
          <app-password-toggle matSuffix [for]="pwNewPassword" />
            <mat-hint>{{ 'At least 8 characters with a letter and a number' | t }}</mat-hint>
            <mat-error>{{ err('newPassword') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Confirm new password' | t }}</mat-label>
            <input matInput #pwConfirmPassword type="password" formControlName="confirmPassword" autocomplete="new-password" />
          <app-password-toggle matSuffix [for]="pwConfirmPassword" />
            <mat-error>{{ err('confirmPassword') }}</mat-error>
          </mat-form-field>
          @if (error()) { <div class="alert error" role="alert"><mat-icon>error</mat-icon><span>{{ error() | t }}</span></div> }
          <button mat-flat-button class="full-width submit cta" type="submit" [disabled]="busy()">{{ 'Reset password' | t }}</button>
        }
      </form>
    </app-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(ApiService);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
  readonly form = inject(FormBuilder).nonNullable.group(
    {
      newPassword: ['', [Validators.required, passwordValidator]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchValidator },
  );
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  err(name: string): string {
    return controlError(this.form.get(name), 'Password');
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.api.post('/auth/reset-password', { token: this.token, newPassword: this.form.getRawValue().newPassword }).subscribe({
      next: () => this.done.set(true),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
