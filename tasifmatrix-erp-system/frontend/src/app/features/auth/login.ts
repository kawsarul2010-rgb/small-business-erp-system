import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../shared/auth-layout';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-login',
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule, AuthLayout],
  template: `
    <app-auth-layout>
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>{{ 'Log in' | t }}</h1>
        <p class="lead">{{ 'Welcome back. Sign in to continue to your business.' | t }}</p>
        @if (expired) { <div class="alert info"><mat-icon>schedule</mat-icon><span>{{ 'Your session expired. Please log in again.' | t }}</span></div> }

        <mat-form-field>
          <mat-label>{{ 'Email' | t }}</mat-label>
          <mat-icon matPrefix class="field-icon">mail</mat-icon>
          <input matInput type="email" formControlName="email" autocomplete="username" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'Password' | t }}</mat-label>
          <mat-icon matPrefix class="field-icon">lock</mat-icon>
          <input matInput [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
          <button mat-icon-button matSuffix type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="(showPassword() ? 'Hide password' : 'Show password') | t">
            <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        @if (error()) { <div class="alert error" role="alert"><mat-icon>error</mat-icon><span>{{ error() | t }}</span></div> }
        @if (busy()) { <mat-progress-bar mode="indeterminate" /> }
        <button mat-flat-button class="full-width submit cta" type="submit" [disabled]="busy()">{{ (busy() ? 'Logging in…' : 'Log in') | t }}</button>

        <div class="links">
          <a routerLink="/forgot-password">{{ 'Forgot password?' | t }}</a>
          <a routerLink="/register">{{ 'Create an account' | t }}</a>
        </div>
      </form>
    </app-auth-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly expired = this.route.snapshot.queryParamMap.has('expired');

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: (user) => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
        void this.router.navigateByUrl(user.mustChangePassword ? '/change-password' : returnUrl);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
