import { Component, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * Eye button that shows or hides the password typed into a field. Hidden by default.
 *
 *   <input matInput #pw type="password" ... />
 *   <app-password-toggle matSuffix [for]="pw" />
 */
@Component({
  selector: 'app-password-toggle',
  imports: [TranslatePipe, MatButtonModule, MatIconModule],
  template: `
    <button mat-icon-button type="button" (click)="toggle()"
            [attr.aria-label]="(shown() ? 'Hide password' : 'Show password') | t" [attr.aria-pressed]="shown()">
      <mat-icon>{{ shown() ? 'visibility_off' : 'visibility' }}</mat-icon>
    </button>
  `,
  styles: `:host { display: inline-flex; } button { color: var(--erp-muted); }`,
})
export class PasswordToggle {
  readonly for = input.required<HTMLInputElement>();
  readonly shown = signal(false);

  toggle(): void {
    this.shown.update((v) => !v);
    this.for().type = this.shown() ? 'text' : 'password';
  }
}
