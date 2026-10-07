import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, problemOf } from '../../core/api.service';
import { APP_INFO } from '../../core/app-info';
import { LayoutService } from '../../core/layout.service';
import { AppRelease, AppUpdateType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { t } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { PostBody } from '../../shared/post-body';

/** Written as icon: '...' so the icon font build includes them. */
const TYPES: { value: AppUpdateType; label: string; icon: string; hint: string }[] = [
  { value: 'MINOR', label: 'Minor - optional update', icon: 'tips_and_updates', hint: 'People see "An update is available" and can choose Later. The app keeps working.' },
  { value: 'MAJOR', label: 'Major - required update', icon: 'lock_clock', hint: 'People who have an older version cannot use the app until they update it from Google Play.' },
];

const NOTES_MAX = 1000;

/**
 * The super admin's list of Android app versions. Each version, once Google Play has published it,
 * is either a minor update (offered) or a major one (required): the installed app checks this list
 * when it starts.
 */
@Component({
  selector: 'app-app-versions',
  imports: [TranslatePipe, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, PostBody],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <div>
          <h1>{{ 'App versions' | t }}</h1>
          <div class="subtitle">{{ 'Tell the Android app when a newer version is on Google Play, and whether people must install it.' | t }}</div>
        </div>
        <div class="actions">
          <button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>{{ 'Add version' | t }}</button>
        </div>
      </div>

      <section class="card card-pad how">
        <mat-icon>info</mat-icon>
        <div>
          <strong>{{ 'How to release a new version' | t }}</strong>
          <ol>
            <li>{{ 'Raise the version in frontend/src/app/core/app-info.ts (now {v}), build with ./build-aab.sh and upload it to Google Play.' | t: { v: current } }}</li>
            <li>{{ 'When Google Play shows the new version, add it here as minor or major.' | t }}</li>
          </ol>
          <span class="muted">{{ 'Adding it before Google Play publishes it would ask people to install an update they cannot get yet.' | t }}</span>
        </div>
      </section>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @for (r of releases(); track r.uuid) {
        <article class="card release" [class.draft]="!r.isPublished">
          <span class="ver-badge" [class.major]="r.updateType === 'MAJOR'"><mat-icon>{{ r.updateType === 'MAJOR' ? 'lock_clock' : 'tips_and_updates' }}</mat-icon></span>
          <div class="rel-main">
            <div class="rel-top">
              <h2>{{ 'Version {v}' | t: { v: r.versionName } }}</h2>
              <span class="chip" [class.major]="r.updateType === 'MAJOR'">{{ (r.updateType === 'MAJOR' ? 'Required update' : 'Optional update') | t }}</span>
              @if (!r.isPublished) { <span class="chip off">{{ 'Not active' | t }}</span> }
            </div>
            @if (r.releaseNotes) { <app-post-body class="notes" [text]="r.releaseNotes" /> }
            <div class="meta">{{ 'Last changed by {name}, {date}' | t: { name: r.updatedByUserName, date: (r.updatedDate | date: 'd MMM yyyy, h:mm a') } }}</div>
          </div>
          <div class="rel-actions">
            <button mat-icon-button (click)="edit(r)" [matTooltip]="'Edit' | t" [attr.aria-label]="'Edit' | t"><mat-icon>edit</mat-icon></button>
            <button mat-icon-button class="danger" (click)="remove(r)" [matTooltip]="'Delete' | t" [attr.aria-label]="'Delete' | t"><mat-icon>delete</mat-icon></button>
          </div>
        </article>
      } @empty {
        @if (!loading() && !error()) {
          <div class="card empty-card">
            <span class="empty-icon"><mat-icon>system_update_alt</mat-icon></span>
            <h2>{{ 'No versions yet' | t }}</h2>
            <p>{{ 'Until you add one, the app never asks anyone to update.' | t }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 900px; }
    .how { display: flex; gap: 12px; margin-bottom: 16px; font-size: 13.5px; line-height: 1.55; }
    .how > mat-icon { flex: none; color: var(--erp-brand); }
    .how ol { margin: 6px 0; padding-left: 20px; }
    .release { display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; margin-bottom: 12px; }
    .release.draft { border-style: dashed; opacity: .85; }
    .ver-badge { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .ver-badge.major { background: var(--erp-tint-rose-bg); color: var(--erp-tint-rose-fg); }
    .rel-main { flex: 1; min-width: 0; }
    .rel-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .rel-top h2 { margin: 0; font-size: 16px; font-weight: 700; }
    .chip { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--erp-chip-info-bg); color: var(--erp-chip-info-fg); }
    .chip.major { background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); }
    .chip.off { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .notes { margin-top: 8px; font-size: 14px; }
    .meta { margin-top: 8px; font-size: 12px; color: var(--erp-muted); }
    .rel-actions { display: flex; flex: none; margin: -6px -8px 0 0; }
    .danger { color: var(--erp-negative); }
    .empty-card { padding: 40px 24px; text-align: center; }
    .empty-icon { display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .empty-icon mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .empty-card h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
    .empty-card p { margin: 0; color: var(--erp-muted); font-size: 13.5px; }
  `,
})
export class AppVersionsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly layout = inject(LayoutService);
  private readonly notify = inject(NotifyService);

  readonly current = APP_INFO.version;
  readonly releases = signal<AppRelease[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<AppRelease[]>('/platform/app-releases').subscribe({
      next: (r) => { this.releases.set(r); this.error.set(null); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load the versions.'); this.loading.set(false); },
    });
  }

  edit(release?: AppRelease): void {
    this.dialog.open(AppReleaseDialog, this.layout.dialog(release ?? null, '560px')).afterClosed().subscribe((saved) => {
      if (saved) this.load();
    });
  }

  remove(r: AppRelease): void {
    this.notify
      .confirm({ title: 'Delete version', message: t('Delete version {v}? The app will no longer ask anyone to install it.', { v: r.versionName }), confirmText: 'Delete', danger: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/platform/app-releases/${r.uuid}`).subscribe({
          next: () => { this.notify.success('Version deleted.'); this.load(); },
          error: (e) => this.notify.error(e),
        });
      });
  }
}

// ====================================================================== add / edit dialog

@Component({
  selector: 'app-app-release-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule,
    MatSlideToggleModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'Edit version' : 'Add version') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field class="full">
          <mat-label>{{ 'Version' | t }}</mat-label>
          <input matInput formControlName="versionName" inputmode="decimal" autocomplete="off" [placeholder]="'e.g. 1.0.1' | t" />
          <mat-hint>{{ 'Exactly as the new app shows it in About.' | t }}</mat-hint>
          <mat-error>{{ err('versionName', 'Version') }}</mat-error>
        </mat-form-field>

        <div class="field">
          <div class="field-label">{{ 'Type of update' | t }}</div>
          <mat-button-toggle-group formControlName="updateType" hideSingleSelectionIndicator class="toggles" [attr.aria-label]="'Type of update' | t">
            @for (ty of types; track ty.value) {
              <mat-button-toggle [value]="ty.value"><mat-icon>{{ ty.icon }}</mat-icon>{{ ty.label | t }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <div class="field-hint" [class.major]="type() === 'MAJOR'">{{ hint() | t }}</div>
        </div>

        <mat-form-field class="full">
          <mat-label>{{ "What's new" | t }}</mat-label>
          <textarea matInput formControlName="releaseNotes" rows="5" [maxlength]="notesMax" [placeholder]="'Shown to people in the update message. Optional.' | t"></textarea>
          <mat-hint align="end">{{ form.controls.releaseNotes.value.length }} / {{ notesMax }}</mat-hint>
          <mat-error>{{ err('releaseNotes', "What's new") }}</mat-error>
        </mat-form-field>

        <div class="switch-row" [class.off]="!form.controls.isPublished.value">
          <mat-icon>{{ form.controls.isPublished.value ? 'visibility' : 'visibility_off' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ 'Active' | t }}</span>
            <span class="switch-hint">{{ 'Turn on once Google Play shows this version. While off, the app ignores it.' | t }}</span>
          </div>
          <mat-slide-toggle formControlName="isPublished" [attr.aria-label]="'Active' | t" />
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full { width: 100%; }
    .field { margin: 14px 0 18px; }
    .field-label { font-size: 13px; font-weight: 600; color: var(--erp-muted); margin-bottom: 8px; }
    .toggles { display: flex; width: 100%; }
    .toggles mat-button-toggle { flex: 1; }
    .toggles mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; }
    .field-hint { font-size: 12.5px; color: var(--erp-muted); margin-top: 8px; line-height: 1.45; }
    .field-hint.major { color: var(--erp-negative); }
    @media (max-width: 600px) {
      .toggles { flex-direction: column; }
      .toggles mat-button-toggle + mat-button-toggle { border-left: 0; border-top: solid 1px var(--erp-border); }
    }
  `,
})
export class AppReleaseDialog {
  readonly data = inject<AppRelease | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AppReleaseDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly types = TYPES;
  readonly notesMax = NOTES_MAX;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    versionName: [this.data?.versionName ?? '', [Validators.required, Validators.pattern(/^\s*\d{1,4}(\.\d{1,4}){0,3}\s*$/)]],
    updateType: [this.data?.updateType ?? ('MINOR' as AppUpdateType)],
    releaseNotes: [this.data?.releaseNotes ?? '', Validators.maxLength(NOTES_MAX)],
    isPublished: [this.data?.isPublished ?? true],
  });
  readonly type = toSignal(this.form.controls.updateType.valueChanges, { initialValue: this.form.controls.updateType.value });
  readonly hint = () => TYPES.find((x) => x.value === this.type())?.hint ?? '';

  err(path: string, label: string): string {
    const c = this.form.get(path);
    if (path === 'versionName' && c?.hasError('pattern')) return t('Write the version as numbers and dots, e.g. 1.0.1.');
    return controlError(c, label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const body = { ...this.form.getRawValue(), revision: this.data?.revision ?? null };
    const req = this.data ? this.api.put<AppRelease>(`/platform/app-releases/${this.data.uuid}`, body) : this.api.post<AppRelease>('/platform/app-releases', body);
    req.subscribe({
      next: (r) => { this.notify.success('Saved.'); this.ref.close(r); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
