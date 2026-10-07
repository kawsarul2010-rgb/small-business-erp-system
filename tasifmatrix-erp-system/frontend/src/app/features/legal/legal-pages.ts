import { DatePipe } from '@angular/common';
import { Component, Injectable, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { APP_INFO, websiteLabel, websiteUrl } from '../../core/app-info';
import { AuthService } from '../../core/auth.service';
import { currentLang } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PostBody } from '../../shared/post-body';
import { Block, DELETION, LAST_UPDATED, LegalDoc, PRIVACY } from './legal-content';
import { LegalLayout } from './legal-layout';

/** The support contact the super admin set (Subscriptions > Billing), shown as "how to reach us". */
@Injectable({ providedIn: 'root' })
export class SupportContact {
  private readonly api = inject(ApiService);
  readonly email = signal<string | null>(null);
  readonly phone = signal<string | null>(null);
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.get<{ supportEmail?: string | null; supportPhone?: string | null }>('/auth/signup-options').subscribe({
      next: (o) => { this.email.set(o.supportEmail ?? null); this.phone.set(o.supportPhone ?? null); },
      error: () => { this.loaded = false; },
    });
  }
}

/** Renders one document: title, date, introduction and sections. */
@Component({
  selector: 'app-legal-doc',
  imports: [TranslatePipe, DatePipe],
  template: `
    <h1>{{ doc().title }}</h1>
    <p class="updated">{{ 'Last updated {date}' | t: { date: (updated | date: 'd MMMM yyyy') } }}</p>
    <p class="intro">{{ doc().intro }}</p>
    <ng-content />
    @for (s of doc().sections; track s.heading) {
      <h2>{{ s.heading }}</h2>
      @for (b of s.blocks; track $index) {
        @if (isList(b)) {
          <ul>@for (item of b.list; track $index) { <li>{{ item }}</li> }</ul>
        } @else {
          <p>{{ b }}</p>
        }
      }
    }
  `,
  styles: `
    :host { display: block; font-size: 15px; line-height: 1.7; color: var(--erp-text); }
    h1 { font-size: 26px; line-height: 1.25; letter-spacing: -0.02em; margin: 0; }
    .updated { margin: 6px 0 18px; font-size: 13px; color: var(--erp-muted); }
    .intro { font-size: 15.5px; }
    h2 { font-size: 17px; margin: 26px 0 6px; letter-spacing: -0.01em; }
    p { margin: 0 0 10px; }
    ul { margin: 0 0 12px; padding-left: 22px; }
    li { margin: 0 0 6px; }
    @media (max-width: 600px) { h1 { font-size: 22px; } :host { font-size: 14.5px; } }
  `,
})
export class LegalDocView {
  readonly doc = input.required<LegalDoc>();
  readonly updated = LAST_UPDATED;

  isList(b: Block): b is { list: string[] } {
    return typeof b !== 'string';
  }
}

/** "Contact us": the publisher, the support email and phone if set, and the website. */
@Component({
  selector: 'app-legal-contact',
  imports: [TranslatePipe, MatIconModule, PostBody],
  template: `
    <h2>{{ 'Contact us' | t }}</h2>
    <div class="contact">
      <div class="who"><strong>{{ app.publisher.name }}</strong>, {{ app.publisher.location | t }}</div>
      @if (contact.email(); as e) { <div class="row"><mat-icon>mail</mat-icon><app-post-body [text]="e" /></div> }
      @if (contact.phone(); as p) { <div class="row"><mat-icon>call</mat-icon><app-post-body [text]="p" /></div> }
      <div class="row"><mat-icon>language</mat-icon><a [href]="website" target="_blank" rel="noopener">{{ websiteText }}</a></div>
    </div>
  `,
  styles: `
    h2 { font-size: 17px; margin: 26px 0 8px; }
    .contact { padding: 14px 16px; border-radius: 12px; background: var(--erp-card-2); border: 1px solid var(--erp-border); font-size: 14.5px; }
    .who { margin-bottom: 6px; }
    .row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .row mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--erp-muted); flex: none; }
    a { color: var(--erp-brand); font-weight: 550; text-decoration: underline; text-underline-offset: 2px; }
  `,
})
export class LegalContact {
  readonly contact = inject(SupportContact);
  readonly app = APP_INFO;
  readonly website = websiteUrl();
  readonly websiteText = websiteLabel(this.website);

  constructor() {
    this.contact.load();
  }
}

/** The public privacy policy (linked from Google Play, sign-in, sign-up and About). */
@Component({
  selector: 'app-privacy-page',
  imports: [LegalLayout, LegalDocView, LegalContact],
  template: `
    <app-legal-layout>
      <app-legal-doc [doc]="doc()" />
      <app-legal-contact />
    </app-legal-layout>
  `,
})
export class PrivacyPage {
  readonly doc = computed(() => PRIVACY[currentLang() === 'bn' ? 'bn' : 'en']);
}

/**
 * How to delete an account and what happens to the data - the "delete account URL" Google Play
 * asks for. Signed-in visitors go straight to the delete dialog; others sign in first.
 * After a deletion the app comes back here with ?done=account|business.
 */
@Component({
  selector: 'app-delete-account-page',
  imports: [TranslatePipe, RouterLink, MatButtonModule, MatIconModule, LegalLayout, LegalDocView, LegalContact],
  template: `
    <app-legal-layout>
      @if (done(); as d) {
        <div class="done" role="status">
          <mat-icon>check_circle</mat-icon>
          <div>
            <strong>{{ (d === 'business' ? 'Your business was closed and your account deleted.' : 'Your account has been deleted.') | t }}</strong>
            {{ 'You have been signed out. Thank you for using {name}.' | t: { name: app.name } }}
          </div>
        </div>
      }
      <app-legal-doc [doc]="doc()">
        @if (!done()) {
          <div class="cta">
            @if (auth.isLoggedIn()) {
              <a mat-flat-button class="danger-btn" routerLink="/profile" [queryParams]="{ delete: 1 }"><mat-icon>delete_forever</mat-icon>{{ 'Delete my account' | t }}</a>
            } @else {
              <a mat-flat-button routerLink="/login" [queryParams]="{ returnUrl: '/profile?delete=1' }"><mat-icon>login</mat-icon>{{ 'Sign in to delete your account' | t }}</a>
            }
          </div>
        }
      </app-legal-doc>
      <app-legal-contact />
    </app-legal-layout>
  `,
  styles: `
    .cta { margin: 6px 0 4px; }
    .cta a { height: 44px; }
    .danger-btn { background: var(--erp-negative) !important; color: #fff !important; }
    .done { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 22px; padding: 14px 16px; border-radius: 12px; font-size: 14.5px; line-height: 1.55;
      background: var(--erp-chip-success-bg); color: var(--erp-chip-success-fg); }
    .done mat-icon { flex: none; }
    .done strong { display: block; }
  `,
})
export class DeleteAccountPage {
  readonly auth = inject(AuthService);
  readonly app = APP_INFO;
  readonly doc = computed(() => DELETION[currentLang() === 'bn' ? 'bn' : 'en']);
  readonly done = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('done'));
}
