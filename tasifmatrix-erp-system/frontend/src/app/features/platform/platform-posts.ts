import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, problemOf } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { PlatformPost, PostBusiness, PostChannel } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { t } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { PostBody } from '../../shared/post-body';

/** Written as icon: '...' so the icon font build includes them. */
const CHANNELS: { value: PostChannel; label: string; icon: string; hint: string }[] = [
  { value: 'ALL', label: 'Website and app', icon: 'devices', hint: 'Shown on the website and in the Android app.' },
  { value: 'WEB', label: 'Website only', icon: 'computer', hint: 'Not shown in the Android app. Use this for anything about paying, such as how to renew.' },
  { value: 'APP', label: 'App only', icon: 'mobile', hint: 'Shown only in the Android app.' },
];

const TITLE_MAX = 150;
const BODY_MAX = 5000;

/**
 * The super admin's posts to the businesses: news, maintenance notices, how to renew...
 * Each post chooses where it appears (website, Android app or both), which businesses see it,
 * and whether only their admins do. Businesses read them on their Announcements page.
 */
@Component({
  selector: 'app-platform-posts',
  imports: [TranslatePipe, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, PostBody],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <div>
          <h1>{{ 'Posts' | t }}</h1>
          <div class="subtitle">{{ 'Messages for the businesses. They read them on their Announcements page, on the website and in the Android app.' | t }}</div>
        </div>
        <div class="actions">
          <button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>{{ 'New post' | t }}</button>
        </div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @for (p of posts(); track p.uuid) {
        <article class="card post" [class.draft]="!p.isPublished">
          <header class="post-head">
            <div class="post-title">
              <h2>@if (p.isPinned) { <mat-icon class="pin" [matTooltip]="'Pinned' | t">push_pin</mat-icon> }{{ p.title }}</h2>
              <div class="chips">
                @if (p.isPublished) {
                  <span class="chip ok">{{ 'Published' | t }}</span>
                } @else {
                  <span class="chip muted-chip">{{ 'Draft' | t }}</span>
                }
                <span class="chip" [class.web]="p.showOn === 'WEB'"><mat-icon>{{ channelIcon(p.showOn) }}</mat-icon>{{ channelLabel(p.showOn) | t }}</span>
                <span class="chip" [matTooltip]="audienceNames(p)">
                  <mat-icon>storefront</mat-icon>
                  @if (p.allBusinesses) { {{ 'All businesses' | t }} } @else {
                    {{ (p.businesses.length === 1 ? '1 business' : '{n} businesses') | t: { n: p.businesses.length } }}
                  }
                </span>
                @if (p.adminsOnly) { <span class="chip"><mat-icon>shield_person</mat-icon>{{ 'Admins only' | t }}</span> }
              </div>
            </div>
            <div class="post-actions">
              <button mat-icon-button (click)="edit(p)" [matTooltip]="'Edit' | t" [attr.aria-label]="'Edit' | t"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button class="danger" (click)="remove(p)" [matTooltip]="'Delete' | t" [attr.aria-label]="'Delete' | t"><mat-icon>delete</mat-icon></button>
            </div>
          </header>
          <app-post-body class="post-body" [text]="p.body" />
          <footer class="post-meta">
            @if (p.publishedDate) { {{ 'Published {date}' | t: { date: (p.publishedDate | date: 'd MMM yyyy, h:mm a') } }} · }
            {{ 'Last changed by {name}, {date}' | t: { name: p.updatedByUserName, date: (p.updatedDate | date: 'd MMM yyyy, h:mm a') } }}
          </footer>
        </article>
      } @empty {
        @if (!loading() && !error()) {
          <div class="card empty-card">
            <span class="empty-icon"><mat-icon>campaign</mat-icon></span>
            <h2>{{ 'No posts yet' | t }}</h2>
            <p>{{ 'Write a post to tell the businesses about news, maintenance or how to renew their subscription.' | t }}</p>
            <button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>{{ 'New post' | t }}</button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 900px; }
    .post { padding: 16px 18px 14px; margin-bottom: 14px; }
    .post.draft { border-style: dashed; }
    .post-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .post-title { flex: 1; min-width: 0; }
    .post-title h2 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
    .pin { font-size: 18px; width: 18px; height: 18px; vertical-align: -3px; margin-right: 6px; color: var(--erp-tint-amber-fg); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px;
      background: var(--erp-chip-neutral-bg); color: var(--erp-chip-neutral-fg); }
    .chip mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .chip.ok { background: var(--erp-chip-success-bg); color: var(--erp-chip-success-fg); }
    .chip.web { background: var(--erp-chip-info-bg); color: var(--erp-chip-info-fg); }
    .chip.muted-chip { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .post-actions { display: flex; flex: none; margin: -6px -8px 0 0; }
    .danger { color: var(--erp-negative); }
    .post-body { font-size: 14px; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
    .post-meta { margin-top: 10px; font-size: 12px; color: var(--erp-muted); }
    .empty-card { padding: 44px 24px; text-align: center; }
    .empty-icon { display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .empty-icon mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .empty-card h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
    .empty-card p { margin: 0 auto 16px; color: var(--erp-muted); font-size: 13.5px; max-width: 46ch; }
  `,
})
export class PlatformPostsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly layout = inject(LayoutService);
  private readonly notify = inject(NotifyService);

  readonly posts = signal<PlatformPost[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<PlatformPost[]>('/platform/posts').subscribe({
      next: (p) => { this.posts.set(p); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load posts.'); this.loading.set(false); },
    });
  }

  channelLabel(c: PostChannel): string {
    return CHANNELS.find((x) => x.value === c)?.label ?? c;
  }

  channelIcon(c: PostChannel): string {
    return CHANNELS.find((x) => x.value === c)?.icon ?? 'devices';
  }

  audienceNames(p: PlatformPost): string {
    return p.allBusinesses ? '' : p.businesses.map((b) => b.name).join(', ');
  }

  edit(post?: PlatformPost): void {
    this.dialog.open(PostDialog, this.layout.dialog(post ?? null, '640px')).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }

  remove(p: PlatformPost): void {
    this.notify
      .confirm({ title: 'Delete post', message: t('Delete "{title}"? The businesses will no longer see it.', { title: p.title }), confirmText: 'Delete', danger: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/platform/posts/${p.uuid}`).subscribe({
          next: () => { this.notify.success('Post deleted.'); this.load(); },
          error: (e) => this.notify.error(e),
        });
      });
  }
}

// ====================================================================== post dialog

@Component({
  selector: 'app-post-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule,
    MatSelectModule, MatSlideToggleModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'Edit post' : 'New post') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field class="full">
          <mat-label>{{ 'Title' | t }}</mat-label>
          <input matInput formControlName="title" [maxlength]="titleMax" [placeholder]="'e.g. New: print invoices in Bangla' | t" />
          <mat-hint align="end">{{ form.controls.title.value.length }} / {{ titleMax }}</mat-hint>
          <mat-error>{{ err('title', 'Title') }}</mat-error>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>{{ 'Message' | t }}</mat-label>
          <textarea matInput formControlName="body" rows="8" [maxlength]="bodyMax"></textarea>
          <mat-hint align="end">{{ form.controls.body.value.length }} / {{ bodyMax }}</mat-hint>
          <mat-error>{{ err('body', 'Message') }}</mat-error>
        </mat-form-field>
        <p class="body-help"><mat-icon>link</mat-icon>{{ 'Line breaks are kept. Web addresses, emails and phone numbers become links.' | t }}</p>

        <div class="field">
          <div class="field-label">{{ 'Show on' | t }}</div>
          <mat-button-toggle-group formControlName="showOn" hideSingleSelectionIndicator class="toggles" [attr.aria-label]="'Show on' | t">
            @for (c of channels; track c.value) {
              <mat-button-toggle [value]="c.value"><mat-icon>{{ c.icon }}</mat-icon>{{ c.label | t }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <div class="field-hint" [class.web]="showOn() === 'WEB'">{{ channelHint() | t }}</div>
        </div>

        <div class="field">
          <div class="field-label">{{ 'Who sees it' | t }}</div>
          <mat-button-toggle-group formControlName="allBusinesses" hideSingleSelectionIndicator class="toggles" [attr.aria-label]="'Who sees it' | t">
            <mat-button-toggle [value]="true"><mat-icon>public</mat-icon>{{ 'All businesses' | t }}</mat-button-toggle>
            <mat-button-toggle [value]="false"><mat-icon>checklist</mat-icon>{{ 'Chosen businesses' | t }}</mat-button-toggle>
          </mat-button-toggle-group>
          @if (!allBusinesses()) {
            <mat-form-field class="full pick">
              <mat-label>{{ 'Businesses' | t }}</mat-label>
              <mat-select formControlName="businessUuids" multiple>
                @for (b of businesses(); track b.uuid) {
                  <mat-option [value]="b.uuid">{{ b.name }} <span class="muted">({{ b.code }})</span></mat-option>
                }
              </mat-select>
              <mat-error>{{ err('businessUuids', 'Businesses') }}</mat-error>
            </mat-form-field>
          }
        </div>

        <div class="switch-row" [class.off]="!form.controls.adminsOnly.value">
          <mat-icon>shield_person</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Admins only' | t }}</span>
            <span class="switch-hint">{{ 'Only the admins of these businesses see it, not their staff.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="adminsOnly" [attr.aria-label]="'Admins only' | t" />
        </div>
        <div class="switch-row" [class.off]="!form.controls.isPinned.value">
          <mat-icon>push_pin</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Pin to the top' | t }}</span>
            <span class="switch-hint">{{ 'Stays above newer posts until you unpin it.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="isPinned" [attr.aria-label]="'Pin to the top' | t" />
        </div>
        <div class="switch-row" [class.off]="!form.controls.isPublished.value">
          <mat-icon>{{ form.controls.isPublished.value ? 'visibility' : 'visibility_off' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Published' | t }}</span>
            <span class="switch-hint">{{ 'Turn off to keep it as a draft that no business sees.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="isPublished" [attr.aria-label]="'Published' | t" />
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ (form.controls.isPublished.value ? 'Publish' : 'Save draft') | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    mat-form-field + mat-form-field { margin-top: 8px; }
    .body-help { display: flex; gap: 6px; align-items: flex-start; margin: 2px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--erp-muted); }
    .body-help mat-icon { flex: none; font-size: 16px; width: 16px; height: 16px; margin-top: 1px; }
    .field { margin: 18px 0 16px; }
    .field-label { font-size: 13px; font-weight: 600; color: var(--erp-muted); margin-bottom: 8px; }
    .toggles { display: flex; width: 100%; }
    .toggles mat-button-toggle { flex: 1; }
    .toggles mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; }
    .field-hint { font-size: 12.5px; color: var(--erp-muted); margin-top: 8px; line-height: 1.45; }
    .field-hint.web { color: var(--erp-tint-indigo-fg); }
    .pick { margin-top: 12px; }
    @media (max-width: 600px) {
      .toggles { flex-direction: column; }
      .toggles mat-button-toggle + mat-button-toggle { border-left: 0; border-top: solid 1px var(--mat-standard-button-toggle-divider-color, var(--erp-border)); }
    }
  `,
})
export class PostDialog implements OnInit {
  readonly data = inject<PlatformPost | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PostDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly channels = CHANNELS;
  readonly titleMax = TITLE_MAX;
  readonly bodyMax = BODY_MAX;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly businesses = signal<PostBusiness[]>([]);

  readonly form = inject(FormBuilder).nonNullable.group({
    title: [this.data?.title ?? '', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    body: [this.data?.body ?? '', [Validators.required, Validators.maxLength(BODY_MAX)]],
    showOn: [this.data?.showOn ?? ('ALL' as PostChannel)],
    allBusinesses: [this.data?.allBusinesses ?? true],
    businessUuids: [this.data?.businesses.map((b) => b.uuid) ?? ([] as string[])],
    adminsOnly: [this.data?.adminsOnly ?? false],
    isPinned: [this.data?.isPinned ?? false],
    isPublished: [this.data?.isPublished ?? true],
  });

  readonly showOn = toSignal(this.form.controls.showOn.valueChanges, { initialValue: this.form.controls.showOn.value });
  readonly allBusinesses = toSignal(this.form.controls.allBusinesses.valueChanges, { initialValue: this.form.controls.allBusinesses.value });
  readonly channelHint = computed(() => CHANNELS.find((c) => c.value === this.showOn())?.hint ?? '');

  ngOnInit(): void {
    this.api.get<PostBusiness[]>('/platform/posts/businesses').subscribe({
      next: (b) => this.businesses.set(b),
      error: () => this.businesses.set([]),
    });
  }

  err(path: string, label: string): string {
    return controlError(this.form.get(path), label);
  }

  save(): void {
    const v = this.form.getRawValue();
    if (!v.allBusinesses && v.businessUuids.length === 0) {
      this.form.controls.businessUuids.setErrors({ required: true });
      this.form.controls.businessUuids.markAsTouched();
    }
    if (this.form.invalid || (!v.allBusinesses && v.businessUuids.length === 0)) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const body = { ...v, businessUuids: v.allBusinesses ? [] : v.businessUuids, revision: this.data?.revision ?? null };
    const req = this.data ? this.api.put<PlatformPost>(`/platform/posts/${this.data.uuid}`, body) : this.api.post<PlatformPost>('/platform/posts', body);
    req.subscribe({
      next: (p) => { this.notify.success(p.isPublished ? 'Post published.' : 'Draft saved.'); this.ref.close(p); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
