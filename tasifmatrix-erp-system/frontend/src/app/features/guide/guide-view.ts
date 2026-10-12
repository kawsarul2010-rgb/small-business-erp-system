import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { currentLang } from '../../core/i18n/i18n';
import { PlatformService } from '../../core/platform.service';
import { GUIDE, GuideLang, GuideSection } from './guide-content';

/**
 * The step-by-step user guide, in English or Bangla (chosen here, independent of the app
 * language). Each part is one annotated screenshot whose numbered markers match the numbered
 * steps beside it. Signed in, it shows the sections for the user's role; on the public help
 * page it shows everything.
 */
@Component({
  selector: 'app-guide-view',
  imports: [MatButtonToggleModule, MatIconModule],
  template: `
    <div class="guide" [attr.lang]="lang()">
      <header class="head">
        <div class="titles">
          <h1>{{ text().title }}</h1>
          <p class="sub">{{ text().subtitle }}</p>
        </div>
        <mat-button-toggle-group class="lang" [value]="lang()" (change)="lang.set($event.value)" hideSingleSelectionIndicator aria-label="Guide language / নির্দেশিকার ভাষা">
          <mat-button-toggle value="en" lang="en">English</mat-button-toggle>
          <mat-button-toggle value="bn" lang="bn">বাংলা</mat-button-toggle>
        </mat-button-toggle-group>
      </header>

      <nav class="toc card" [attr.aria-label]="text().contents">
        <div class="toc-title">{{ text().contents }}</div>
        <div class="toc-grid">
          @for (s of sections(); track s.id; let i = $index) {
            <button type="button" class="toc-item" (click)="jump(s.id)">
              <span class="toc-icon"><mat-icon>{{ s.icon }}</mat-icon></span>
              <span class="toc-text"><span class="toc-no">{{ i + 1 }}</span>{{ s.title }}</span>
            </button>
          }
        </div>
      </nav>

      @for (s of sections(); track s.id; let i = $index) {
        <section class="sec card" [id]="'guide-' + s.id">
          <div class="sec-head">
            <span class="sec-icon"><mat-icon>{{ s.icon }}</mat-icon></span>
            <div>
              <div class="sec-no">{{ text().section }} {{ i + 1 }}</div>
              <h2>{{ s.title }}</h2>
            </div>
          </div>
          @if (s.intro) { <p class="intro">{{ s.intro }}</p> }

          @for (p of s.parts; track $index) {
            <div class="part" [class.no-shot]="!p.shot">
              @if (p.shot) {
                <button type="button" class="shot" (click)="zoom.set(src(p.shot))" [attr.aria-label]="text().enlarge">
                  <img [src]="src(p.shot)" [alt]="p.title ?? s.title" loading="lazy" width="720" height="1480" />
                  <span class="zoom"><mat-icon>zoom_in</mat-icon></span>
                </button>
              }
              <div class="steps">
                @if (p.title) { <h3>{{ p.title }}</h3> }
                <ol>
                  @for (st of p.steps; track $index) {
                    <li><span class="num">{{ $index + 1 }}</span><span class="st">{{ st }}</span></li>
                  }
                </ol>
              </div>
            </div>
          }

          @if (s.tips?.length) {
            <div class="tips">
              <mat-icon>lightbulb</mat-icon>
              <ul>@for (tip of s.tips; track $index) { <li>{{ tip }}</li> }</ul>
            </div>
          }
          @if (s.faq?.length) {
            <div class="faq">
              @for (f of s.faq; track $index) {
                <details><summary>{{ f.q }}</summary><p>{{ f.a }}</p></details>
              }
            </div>
          }
          <button type="button" class="top" (click)="jump(null)"><mat-icon>arrow_upward</mat-icon>{{ text().contents }}</button>
        </section>
      }
    </div>

    @if (zoom(); as z) {
      <div class="lightbox" (click)="zoom.set(null)" role="dialog" aria-modal="true">
        <img [src]="z" alt="" />
        <button type="button" class="close" (click)="zoom.set(null)" aria-label="Close"><mat-icon>close</mat-icon></button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .guide { max-width: 980px; margin: 0 auto; }
    .guide[lang='bn'] { line-height: 1.7; }
    .head { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }
    h1 { font-size: 26px; line-height: 1.2; letter-spacing: -0.02em; margin: 0; }
    .sub { margin: 6px 0 0; color: var(--erp-muted); font-size: 14px; max-width: 60ch; }
    .lang { flex: none; }

    .toc { padding: 16px; margin-bottom: 16px; }
    .toc-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--erp-faint); margin-bottom: 10px; }
    .toc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
    .toc-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--erp-border);
      background: var(--erp-card); color: var(--erp-text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
    .toc-item:hover { border-color: var(--erp-brand); background: var(--erp-card-2); }
    .toc-icon, .sec-icon { display: grid; place-items: center; flex: none; border-radius: 10px; background: var(--erp-brand-soft); color: var(--erp-brand-fg); }
    .toc-icon { width: 34px; height: 34px; }
    .toc-icon mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .toc-no { font-weight: 700; color: var(--erp-faint); margin-right: 6px; }

    .sec { padding: 20px 22px; margin-bottom: 16px; scroll-margin-top: 80px; }
    .sec-head { display: flex; align-items: center; gap: 12px; }
    .sec-icon { width: 44px; height: 44px; border-radius: 12px; }
    .sec-no { font-size: 12px; font-weight: 600; color: var(--erp-faint); text-transform: uppercase; letter-spacing: .05em; }
    h2 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
    .intro { margin: 12px 0 0; font-size: 14.5px; color: var(--erp-text); line-height: 1.6; }

    .part { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 22px; align-items: start; margin-top: 18px; padding-top: 18px; border-top: 1px dashed var(--erp-border); }
    .part.no-shot { grid-template-columns: minmax(0, 1fr); }
    .shot { position: relative; display: block; padding: 6px; border: 0; border-radius: 26px; background: #0f0f1f; cursor: zoom-in;
      box-shadow: 0 10px 24px rgba(15, 23, 42, .18); width: 250px; }
    .shot img { display: block; width: 100%; height: auto; border-radius: 20px; }
    .zoom { position: absolute; right: 12px; bottom: 12px; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%;
      background: rgba(15, 15, 31, .7); color: #fff; }
    .zoom mat-icon { font-size: 18px; width: 18px; height: 18px; }
    h3 { font-size: 15px; margin: 2px 0 10px; }
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.55; }
    .num { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; margin-top: 1px;
      background: #f59e0b; color: #fff; font-weight: 700; font-size: 12.5px; box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(0, 0, 0, .25); }
    .no-shot .num { background: var(--erp-brand); }

    .tips { display: flex; gap: 10px; margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); font-size: 14px; line-height: 1.55; }
    .tips mat-icon { flex: none; }
    .tips ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
    .faq { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    details { border: 1px solid var(--erp-border); border-radius: 12px; padding: 10px 14px; background: var(--erp-card); }
    summary { cursor: pointer; font-weight: 600; font-size: 14.5px; }
    details p { margin: 8px 0 2px; font-size: 14px; line-height: 1.6; color: var(--erp-text); }
    .top { display: inline-flex; align-items: center; gap: 4px; margin-top: 14px; border: 0; background: none; padding: 4px 0; color: var(--erp-brand); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .top mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .lightbox { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(8, 8, 20, .86); cursor: zoom-out; }
    .lightbox img { max-width: 100%; max-height: 100%; border-radius: 16px; }
    .close { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; width: 44px; height: 44px; border-radius: 50%; border: 0;
      background: rgba(255, 255, 255, .15); color: #fff; display: grid; place-items: center; cursor: pointer; }

    @media (max-width: 700px) {
      h1 { font-size: 22px; }
      .head .lang { width: 100%; }
      .head .lang mat-button-toggle { flex: 1; }
      .toc { padding: 12px; }
      .toc-grid { grid-template-columns: minmax(0, 1fr); }
      .sec { padding: 16px 14px; }
      .part { grid-template-columns: minmax(0, 1fr); gap: 14px; }
      .shot { width: min(260px, 78%); margin: 0 auto; }
    }
  `,
})
export class GuideView {
  /** Show only the sections for the signed-in user's role (false on the public help page). */
  readonly forRole = input(true);

  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  readonly lang = signal<GuideLang>(currentLang() === 'bn' ? 'bn' : 'en');
  readonly zoom = signal<string | null>(null);

  readonly text = computed(() => GUIDE[this.lang()].text);
  readonly sections = computed<GuideSection[]>(() => {
    const role = this.forRole() ? this.auth.user()?.role : null;
    return GUIDE[this.lang()].sections.filter(
      (s) => (!s.webOnly || !this.platform.isNative) && (!role || !s.roles || s.roles.includes(role)),
    );
  });

  src(shot: string): string {
    return `guide/${this.lang()}/${shot}.webp`;
  }

  jump(id: string | null): void {
    const el = id ? document.getElementById('guide-' + id) : document.querySelector('app-guide-view');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

