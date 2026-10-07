import { PasswordToggle } from '../../shared/password-toggle';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { PlatformService } from '../../core/platform.service';
import { applyServerErrors, bdMobileValidator, controlError, passwordValidator } from '../../shared/form-errors';
import { AuthLayout } from '../../shared/auth-layout';
import { BUSINESS_CODE_PATTERN, suggestBusinessCode } from '../../shared/business-code';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import { SignupOptions } from '../../core/models';
import { durationLabel } from '../../core/billing';
import { formatMoney } from '../../shared/pipes';

type Mode = 'business' | 'join';

/**
 * Two ways to sign up:
 * - Register a business: creates a new business with this person as its admin (owner).
 * - Join a business: creates a USER account in an existing business, found by its code.
 * The choice is in the URL (?type=business / ?type=join), so the browser's Back button returns
 * to the choice. A shared link with ?business=CODE goes straight to joining that business.
 */
@Component({
  selector: 'app-register',
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressBarModule, AuthLayout, PasswordToggle],
  template: `
    <app-auth-layout>
      @switch (mode()) {
        @case (null) {
          <div class="card auth-card">
            <h1>{{ 'Create account' | t }}</h1>
            <p class="lead">{{ 'How do you want to use the app?' | t }}</p>
            <div class="choices">
              <button type="button" class="choice" (click)="choose('business')">
                <span class="icon-badge"><mat-icon>add_business</mat-icon></span>
                <span class="choice-text">
                  <span class="choice-title">{{ 'Register my business' | t }}</span>
                  <span class="choice-hint">{{ 'Start a new business account. You become its admin and can add your staff.' | t }}</span>
                </span>
                <mat-icon class="chev">chevron_right</mat-icon>
              </button>
              <button type="button" class="choice" (click)="choose('join')">
                <span class="icon-badge teal"><mat-icon>group_add</mat-icon></span>
                <span class="choice-text">
                  <span class="choice-title">{{ 'Join a business' | t }}</span>
                  <span class="choice-hint">{{ 'Your business already uses the app and gave you its business code.' | t }}</span>
                </span>
                <mat-icon class="chev">chevron_right</mat-icon>
              </button>
            </div>
            <div class="links"><span></span><a routerLink="/login">{{ 'I already have an account' | t }}</a></div>
          </div>
        }

        @case ('business') {
          <form class="card auth-card" [formGroup]="businessForm" (ngSubmit)="submitBusiness()">
            @if (businessSignup()) { <a class="back" routerLink="/register">{{ 'Other options' | t }}</a> }
            <h1>{{ 'Register my business' | t }}</h1>
            <p class="lead">{{ 'Create your business account. You will be its admin.' | t }}</p>

            <div class="section">{{ 'Business' | t }}</div>
            <mat-form-field>
              <mat-label>{{ 'Business name' | t }}</mat-label>
              <input matInput formControlName="businessName" autocomplete="organization" (input)="nameChanged()" />
              <mat-error>{{ errB('businessName', 'Business name') }}</mat-error>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'Business code' | t }}</mat-label>
              <input matInput formControlName="businessCode" autocapitalize="off" spellcheck="false" (input)="codeTouched = true" [placeholder]="'e.g. rahim-store' | t" />
              <mat-hint>{{ 'Your staff enter this code to join your business.' | t }}</mat-hint>
              <mat-error>{{ codeError() }}</mat-error>
            </mat-form-field>
            @if (sizes().length > 0) {
              <mat-form-field subscriptSizing="dynamic" class="size-field">
                <mat-label>{{ 'Business size' | t }}</mat-label>
                <mat-select formControlName="businessSizeUuid" panelClass="size-panel">
                  @for (z of sizes(); track z.uuid) {
                    <mat-option [value]="z.uuid">
                      <span class="opt-name">{{ z.name }}</span>
                      @if (z.description) { <span class="opt-desc"> - {{ z.description }}</span> }
                    </mat-option>
                  }
                </mat-select>
                <mat-error>{{ errB('businessSizeUuid', 'Business size') }}</mat-error>
              </mat-form-field>
            }
            <!-- In the Android app only the free trial is mentioned: prices and paying stay on the website (Google Play rules). -->
            @if (options()?.billingEnabled && (!inApp || options()!.trialDays > 0)) {
              <div class="pricing">
                <mat-icon>sell</mat-icon>
                <div>
                  @if (options()!.trialDays > 0) {
                    <strong>{{ (options()!.trialDays === 1 ? 'Free for the first day.' : 'Free for the first {n} days.') | t: { n: options()!.trialDays } }}</strong>
                    @if (!inApp) { {{ 'No payment needed to start.' | t }} }
                  }
                  @if (!inApp && priceLines().length > 0) {
                    <div class="price-list">
                      <span class="then">{{ (options()!.trialDays > 0 ? 'Then choose a package:' : 'Packages:') | t }}</span>
                      @for (line of priceLines(); track line) { <span class="price-chip">{{ line }}</span> }
                    </div>
                  } @else if (!inApp && sizes().length > 0 && !selectedSize()) {
                    <div class="then">{{ 'Choose your business size to see the prices.' | t }}</div>
                  }
                </div>
              </div>
            }

            <div class="section">{{ 'You (admin)' | t }}</div>
            <mat-form-field>
              <mat-label>{{ 'Full name' | t }}</mat-label>
              <input matInput formControlName="userName" autocomplete="name" />
              <mat-error>{{ errB('userName', 'Name') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Email' | t }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
              <mat-error>{{ errB('email', 'Email') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Mobile number' | t }}</mat-label>
              <input matInput formControlName="phoneNumber" placeholder="01712345678" autocomplete="tel" />
              <mat-error>{{ errB('phoneNumber', 'Mobile number') }}</mat-error>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'Password' | t }}</mat-label>
              <input matInput #pwBusiness type="password" formControlName="password" autocomplete="new-password" />
              <app-password-toggle matSuffix [for]="pwBusiness" />
              <mat-hint>{{ 'At least 8 characters with a letter and a number' | t }}</mat-hint>
              <mat-error>{{ errB('password', 'Password') }}</mat-error>
            </mat-form-field>

            @if (error()) { <div class="alert error" role="alert"><mat-icon>error</mat-icon><span>{{ error() | t }}</span></div> }
            @if (busy()) { <mat-progress-bar mode="indeterminate" /> }
            <button mat-flat-button class="full-width submit cta" type="submit" [disabled]="busy()">{{ 'Create business account' | t }}</button>
            <p class="consent">{{ 'By creating an account you agree to our' | t }} <a routerLink="/privacy" target="_blank">{{ 'Privacy policy' | t }}</a>.</p>
            <div class="links"><span></span><a routerLink="/login">{{ 'I already have an account' | t }}</a></div>
          </form>
        }

        @case ('join') {
          <form class="card auth-card" [formGroup]="joinForm" (ngSubmit)="submitJoin()">
            @if (businessSignup()) { <a class="back" routerLink="/register">{{ 'Other options' | t }}</a> }
            <h1>{{ (businessSignup() ? 'Join a business' : 'Create account') | t }}</h1>
            <p class="lead">{{ "Join your business's account. Ask your business for its code; its administrator then gives you access." | t }}</p>

            <mat-form-field>
              <mat-label>{{ 'Business code' | t }}</mat-label>
              <input matInput formControlName="businessCode" autocapitalize="off" autocomplete="organization" spellcheck="false" [placeholder]="'e.g. rahim-store' | t" />
              <mat-error>{{ errJ('businessCode', 'Business code') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Full name' | t }}</mat-label>
              <input matInput formControlName="userName" autocomplete="name" />
              <mat-error>{{ errJ('userName', 'Name') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Email' | t }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
              <mat-error>{{ errJ('email', 'Email') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Mobile number' | t }}</mat-label>
              <input matInput formControlName="phoneNumber" placeholder="01712345678" autocomplete="tel" />
              <mat-error>{{ errJ('phoneNumber', 'Mobile number') }}</mat-error>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'Password' | t }}</mat-label>
              <input matInput #pwJoin type="password" formControlName="password" autocomplete="new-password" />
              <app-password-toggle matSuffix [for]="pwJoin" />
              <mat-hint>{{ 'At least 8 characters with a letter and a number' | t }}</mat-hint>
              <mat-error>{{ errJ('password', 'Password') }}</mat-error>
            </mat-form-field>

            @if (error()) { <div class="alert error" role="alert"><mat-icon>error</mat-icon><span>{{ error() | t }}</span></div> }
            @if (busy()) { <mat-progress-bar mode="indeterminate" /> }
            <button mat-flat-button class="full-width submit cta" type="submit" [disabled]="busy()">{{ 'Create account' | t }}</button>
            <p class="consent">{{ 'By creating an account you agree to our' | t }} <a routerLink="/privacy" target="_blank">{{ 'Privacy policy' | t }}</a>.</p>
            <div class="links"><span></span><a routerLink="/login">{{ 'I already have an account' | t }}</a></div>
          </form>
        }
      }
    </app-auth-layout>
  `,
  styles: `
    .choices { display: flex; flex-direction: column; gap: 12px; }
    .choice {
      display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px; text-align: left;
      font: inherit; color: inherit; cursor: pointer;
      background: var(--erp-card); border: 1px solid var(--erp-border); border-radius: var(--erp-radius-sm);
      transition: border-color .15s, box-shadow .15s, background .15s;
    }
    .choice:hover { border-color: var(--erp-brand); box-shadow: var(--erp-shadow-hover); }
    .choice:focus-visible { outline: 2px solid var(--erp-brand); outline-offset: 2px; }
    .choice .icon-badge { flex: none; }
    .choice-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .choice-title { font-weight: 650; font-size: 15px; }
    .choice-hint { font-size: 13px; color: var(--erp-muted); line-height: 1.45; }
    .chev { flex: none; color: var(--erp-faint); }
    .back { display: inline-block; margin-bottom: 10px; font-size: 13px; font-weight: 550; color: var(--erp-brand); text-decoration: none; }
    .back::before { content: '← '; }
    .back:hover { text-decoration: underline; }
    .section { margin: 2px 0 10px; font-size: 12px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--erp-muted); }
    .section:not(:first-of-type) { margin-top: 8px; }
    .size-field { margin-top: 14px; }
    .opt-desc { color: var(--erp-muted); font-size: 13px; }
    .pricing { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0 6px; padding: 12px 14px; border-radius: var(--erp-radius-sm);
      background: var(--erp-tint-teal-bg); color: var(--erp-tint-teal-fg); font-size: 13.5px; line-height: 1.5; }
    .pricing mat-icon { flex: none; font-size: 20px; width: 20px; height: 20px; margin-top: 1px; }
    .consent { margin: 10px 0 0; text-align: center; font-size: 12.5px; color: var(--erp-muted); }
    .consent a { color: var(--erp-brand); font-weight: 550; }
    .price-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
    .price-chip { padding: 2px 10px; border-radius: 999px; background: var(--erp-card); color: var(--erp-text); font-size: 12.5px; font-weight: 600; border: 1px solid var(--erp-border); }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  /** Inside the Android app: no prices (see the pricing block). */
  readonly inApp = inject(PlatformService).isNative;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** A business can share a sign-up link that fills in its code: /register?business=rahim-store */
  private readonly sharedCode = this.route.snapshot.queryParamMap.get('business') ?? '';

  /** Whether the server lets people register a business; assumed yes until it says otherwise. */
  readonly businessSignup = signal(true);
  private readonly typeParam = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('type'))), { initialValue: null });

  /** null: still choosing. A shared business code or a server without business sign-up goes straight to joining. */
  readonly mode = computed<Mode | null>(() => {
    const type = this.typeParam();
    if (!this.businessSignup() || this.sharedCode) return 'join';
    return type === 'business' || type === 'join' ? type : null;
  });

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly joinForm = this.fb.group({
    businessCode: [this.sharedCode, [Validators.required, Validators.maxLength(30)]],
    userName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, bdMobileValidator]],
    password: ['', [Validators.required, passwordValidator]],
  });

  readonly businessForm = this.fb.group({
    businessName: ['', [Validators.required, Validators.maxLength(150)]],
    businessCode: ['', [Validators.required, Validators.pattern(BUSINESS_CODE_PATTERN)]],
    userName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, bdMobileValidator]],
    password: ['', [Validators.required, passwordValidator]],
    businessSizeUuid: [null as string | null],
  });

  /** What the server offers: business sign-up, sizes, free trial and package prices. */
  readonly options = signal<SignupOptions | null>(null);
  readonly sizes = computed(() => this.options()?.sizes ?? []);
  private readonly sizeValue = toSignal(this.businessForm.controls.businessSizeUuid.valueChanges, { initialValue: null });
  readonly selectedSize = computed(() => this.sizeValue());
  /** "Monthly - 1 month: Tk 100" for each package offered to the chosen size. */
  readonly priceLines = computed(() => {
    const size = this.selectedSize();
    if (!size) return [];
    return (this.options()?.plans ?? []).flatMap((p) => {
      const price = p.prices.find((x) => x.sizeUuid === size)?.price;
      if (price === undefined) return [];
      const length = durationLabel(p.durationMonths);
      return [length === p.name ? `${p.name}: ${formatMoney(price)}` : `${p.name} (${length}): ${formatMoney(price)}`];
    });
  });

  /** The code follows the business name until the person edits the code. */
  codeTouched = false;

  constructor() {
    this.auth.signupOptions().subscribe({
      next: (o) => {
        this.businessSignup.set(o.businessSignup);
        this.options.set(o);
        if ((o.sizes ?? []).length > 0) {
          this.businessForm.controls.businessSizeUuid.setValidators(Validators.required);
          this.businessForm.controls.businessSizeUuid.updateValueAndValidity();
        }
      },
      error: () => { /* keep the default; the server still decides on submit */ },
    });
  }

  choose(mode: Mode): void {
    this.error.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { type: mode } });
  }

  nameChanged(): void {
    if (!this.codeTouched) this.businessForm.controls.businessCode.setValue(suggestBusinessCode(this.businessForm.controls.businessName.value));
  }

  codeError(): string {
    const c = this.businessForm.controls.businessCode;
    if (c.errors?.['pattern']) return t('3-30 lowercase letters, numbers or hyphens; no hyphen at either end.');
    return controlError(c, 'Business code');
  }

  errB(name: string, label: string): string {
    return controlError(this.businessForm.get(name), label);
  }

  errJ(name: string, label: string): string {
    return controlError(this.joinForm.get(name), label);
  }

  submitBusiness(): void {
    const code = this.businessForm.controls.businessCode;
    code.setValue(code.value.trim().toLowerCase());
    if (this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const body = this.businessForm.getRawValue();
    this.auth.registerBusiness(body).subscribe({
      next: () => {
        // The business's company is set up from these details; the dashboard then shows how to invite staff.
        this.notify.success('Welcome! {name} is ready.', { name: body.businessName.trim() });
        void this.router.navigateByUrl('/');
      },
      error: (e) => {
        this.error.set(applyServerErrors(this.businessForm, e));
        this.busy.set(false);
      },
    });
  }

  submitJoin(): void {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const body = this.joinForm.getRawValue();
    this.auth.register({ ...body, businessCode: body.businessCode.trim().toLowerCase() }).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (e) => {
        this.error.set(applyServerErrors(this.joinForm, e));
        this.busy.set(false);
      },
    });
  }
}
