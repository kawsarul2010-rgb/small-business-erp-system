import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LabelPipe } from '../../shared/pipes';

@Component({
  selector: 'app-profile',
  imports: [RouterLink, MatButtonModule, MatIconModule, LabelPipe],
  template: `
    <div class="page">
      <div class="page-header"><h1>My profile</h1></div>
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
            <div class="item"><span class="icon-badge"><mat-icon>mail</mat-icon></span><div><span class="k">Email</span><span class="v">{{ u.email }}</span></div></div>
            <div class="item"><span class="icon-badge teal"><mat-icon>call</mat-icon></span><div><span class="k">Mobile</span><span class="v">{{ u.phoneNumber }}</span></div></div>
            <div class="item"><span class="icon-badge violet"><mat-icon>groups</mat-icon></span><div><span class="k">Linked buyer</span><span class="v">{{ u.customerName ?? 'Not linked' }}</span></div></div>
            <div class="item"><span class="icon-badge amber"><mat-icon>local_shipping</mat-icon></span><div><span class="k">Linked supplier</span><span class="v">{{ u.supplierName ?? 'Not linked' }}</span></div></div>
          </div>

          @if (u.role === 'USER' && !u.customerUuid && !u.supplierUuid) {
            <p class="muted note">Your account is waiting for an administrator to link it to a customer or supplier. Reports will appear after that.</p>
          }
          <div class="actions">
            <a mat-stroked-button routerLink="/change-password"><mat-icon>key</mat-icon>Change password</a>
          </div>
        </div>
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
    @media (max-width: 840px) {
      .banner { padding: 18px 16px; }
      .details { grid-template-columns: 1fr; padding: 18px 16px 4px; }
      .note { padding: 0 16px; }
      .actions { padding: 14px 16px 18px; }
    }
  `,
})
export class ProfilePage implements OnInit {
  readonly auth = inject(AuthService);
  readonly initials = computed(() => {
    const parts = (this.auth.user()?.userName ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  });
  ngOnInit(): void {
    this.auth.reloadMe().subscribe({ error: () => {} });
  }
}
