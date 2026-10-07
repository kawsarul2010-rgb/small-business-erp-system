import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DeleteAccountDialog } from '../../shared/delete-account-dialog';
import { LabelPipe } from '../../shared/pipes';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-profile',
  imports: [TranslatePipe, RouterLink, MatButtonModule, MatIconModule, LabelPipe],
  template: `
    <div class="page">
      <div class="page-header"><h1>{{ 'My profile' | t }}</h1></div>
      @if (auth.user(); as u) {
        <div class="card profile">
          <div class="banner">
            <span class="avatar">{{ initials() }}</span>
            <div class="who">
              <div class="name">{{ u.userName }}</div>
              <div class="tags">
                <span class="tag">{{ u.role | label }}</span>
                @if (u.businessName) { <span class="tag"><mat-icon>storefront</mat-icon>{{ u.businessName }}</span> }
              </div>
            </div>
          </div>

          <div class="details">
            <div class="item"><span class="icon-badge"><mat-icon>mail</mat-icon></span><div><span class="k">{{ 'Email' | t }}</span><span class="v">{{ u.email }}</span></div></div>
            <div class="item"><span class="icon-badge teal"><mat-icon>call</mat-icon></span><div><span class="k">{{ 'Mobile' | t }}</span><span class="v">{{ u.phoneNumber }}</span></div></div>
            <div class="item"><span class="icon-badge violet"><mat-icon>groups</mat-icon></span><div><span class="k">{{ 'Linked buyer' | t }}</span><span class="v">{{ u.customerName ?? ('Not linked' | t) }}</span></div></div>
            <div class="item"><span class="icon-badge amber"><mat-icon>local_shipping</mat-icon></span><div><span class="k">{{ 'Linked supplier' | t }}</span><span class="v">{{ u.supplierName ?? ('Not linked' | t) }}</span></div></div>
          </div>

          @if (u.role === 'USER' && !u.customerUuid && !u.supplierUuid) {
            <p class="muted note">{{ 'Your account is waiting for an administrator to link it to a customer or supplier. Reports will appear after that.' | t }}</p>
          }
          <div class="actions">
            <a mat-stroked-button routerLink="/change-password"><mat-icon>key</mat-icon>{{ 'Change password' | t }}</a>
          </div>
        </div>

        @if (u.role !== 'SUPER_ADMIN') {
          <section class="card danger-zone">
            <span class="icon-badge rose"><mat-icon>person_remove</mat-icon></span>
            <div class="dz-text">
              <h2>{{ 'Delete account' | t }}</h2>
              <p>{{ (u.role === 'ADMIN' ? 'Erase your account and sign out everywhere. If you are the only admin, the whole business is closed and its records deleted.' : 'Erase your account and sign out everywhere. The business keeps the records you entered.') | t }}</p>
              <a routerLink="/privacy" class="dz-link">{{ 'Privacy policy' | t }}</a>
            </div>
            <button mat-stroked-button class="dz-btn" (click)="deleteAccount()"><mat-icon>delete_forever</mat-icon>{{ 'Delete account' | t }}</button>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .profile { max-width: 720px; overflow: hidden; }
    .banner { display: flex; align-items: center; gap: 16px; padding: 22px 24px; color: #fff; background: var(--erp-hero-bg); }
    .avatar { display: grid; place-items: center; flex: none; width: 60px; height: 60px; border-radius: 50%; font-size: 20px; font-weight: 700; color: #3730a3; background: #fff; box-shadow: 0 4px 14px rgba(0, 0, 0, .18); }
    .who { min-width: 0; }
    .name { font-size: 20px; font-weight: 700; letter-spacing: -0.015em; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: rgba(255, 255, 255, .16); border: 1px solid rgba(255, 255, 255, .22); }
    .tag mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding: 22px 24px 6px; }
    .item { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .item > div { display: flex; flex-direction: column; min-width: 0; }
    .k { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--erp-faint); }
    .v { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note { padding: 0 24px; }
    .actions { padding: 16px 24px 22px; }
    .danger-zone { max-width: 720px; box-sizing: border-box; display: flex; align-items: center; gap: 14px; margin-top: 18px; padding: 18px 20px;
      border-color: color-mix(in srgb, var(--erp-negative) 35%, var(--erp-border)); }
    .danger-zone .icon-badge { flex: none; }
    .dz-text { flex: 1; min-width: 0; }
    .dz-text h2 { margin: 0; font-size: 15px; font-weight: 650; }
    .dz-text p { margin: 3px 0 0; font-size: 13px; line-height: 1.5; color: var(--erp-muted); }
    .dz-link { display: inline-block; margin-top: 4px; font-size: 12.5px; color: var(--erp-brand); font-weight: 550; }
    .dz-btn { flex: none; color: var(--erp-negative) !important; border-color: color-mix(in srgb, var(--erp-negative) 45%, transparent) !important; }
    @media (max-width: 840px) {
      .banner { padding: 18px 16px; }
      .details { grid-template-columns: 1fr; padding: 18px 16px 4px; }
      .note { padding: 0 16px; }
      .actions { padding: 14px 16px 18px; }
      .danger-zone { flex-wrap: wrap; padding: 16px; }
      .dz-text { flex-basis: calc(100% - 60px); }
      .dz-btn { width: 100%; }
    }
  `,
})
export class ProfilePage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  readonly initials = computed(() => {
    const parts = (this.auth.user()?.userName ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  });
  ngOnInit(): void {
    this.auth.reloadMe().subscribe({ error: () => {} });
    // Arriving from the public "Delete your account" page opens the dialog straight away.
    if (this.route.snapshot.queryParamMap.get('delete') === '1') this.deleteAccount();
  }

  deleteAccount(): void {
    this.dialog.open(DeleteAccountDialog, { width: '520px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'dialog' });
  }
}
