import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthLayout } from '../../shared/auth-layout';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, AuthLayout],
  template: `
    <app-auth-layout>
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>Forgot password</h1>
        @if (sent()) {
          <p>If an account exists for <strong>{{ form.value.email }}</strong>, we have emailed a link to reset your password. The link expires in 30 minutes.</p>
          <a mat-flat-button class="full-width" routerLink="/login">Back to log in</a>
        } @else {
          <p class="lead">Enter your account email and we will send you a reset link.</p>
          <mat-form-field>
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" />
          </mat-form-field>
          @if (error()) { <div class="alert error" role="alert"><mat-icon>error</mat-icon><span>{{ error() }}</span></div> }
          <button mat-flat-button class="full-width submit cta" type="submit" [disabled]="busy()">Send reset link</button>
          <div class="links"><span></span><a routerLink="/login">Back to log in</a></div>
        }
      </form>
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly api = inject(ApiService);
  readonly form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.api.post('/auth/forgot-password', this.form.getRawValue()).subscribe({
      next: () => this.sent.set(true),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
