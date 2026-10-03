import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { Paged, Party } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, bdMobileValidator, controlError } from '../../shared/form-errors';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';

type PartyKind = 'customer' | 'supplier';

/** Customers and suppliers share this page; the kind comes from route data. */
@Component({
  selector: 'app-parties',
  imports: [TranslatePipe, RouterLink, MatTableModule, MatSortModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatTooltipModule, MatMenuModule, ListFooter],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ title() | t }}</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">{{ 'Codes are generated automatically. SMS payment notices go to the mobile number.' | t }}</div>
          }
        </div>
        @if (!layout.isHandset()) {
          <div class="actions"><button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>{{ (kind() === 'customer' ? 'New customer' : 'New supplier') | t }}</button></div>
        }
      </div>

      <div class="card">
        <div class="toolbar">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'Search name, code or mobile' | t }}</mat-label>
            <input matInput (input)="list.search($any($event.target).value)" />
          </mat-form-field>
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (p of list.items(); track p.uuid) {
              <div class="m-card">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ p.name }}</div>
                    <div class="m-sub">{{ p.code }} · {{ p.mobileNumber }}@if (!p.smsEnabled) { <span class="sms-off"><mat-icon>speaker_notes_off</mat-icon>{{ 'SMS off' | t }}</span> }</div>
                  </div>
                  <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Actions' | t"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #menu="matMenu">
                    <a mat-menu-item [routerLink]="ordersLink()" [queryParams]="{ partyUuid: p.uuid, partyLabel: p.name + ' (' + p.code + ')' }">
                      <mat-icon>receipt_long</mat-icon>{{ 'View orders' | t }}
                    </a>
                    <button mat-menu-item (click)="edit(p)"><mat-icon>edit</mat-icon>{{ 'Edit' | t }}</button>
                    @if (auth.isAdmin()) { <button mat-menu-item (click)="remove(p)"><mat-icon>delete</mat-icon>{{ 'Delete' | t }}</button> }
                  </mat-menu>
                </div>
                @if (p.address || p.city) {
                  <div class="m-sub address">{{ p.address }}@if (p.address && p.city) {, }{{ p.city }}</div>
                }
              </div>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
              <ng-container matColumnDef="code"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Code' | t }}</th><td mat-cell *matCellDef="let p" class="code">{{ p.code }}</td></ng-container>
              <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Name' | t }}</th><td mat-cell *matCellDef="let p">{{ p.name }}</td></ng-container>
              <ng-container matColumnDef="mobile"><th mat-header-cell *matHeaderCellDef>{{ 'Mobile' | t }}</th><td mat-cell *matCellDef="let p" class="nowrap">{{ p.mobileNumber }}@if (!p.smsEnabled) { <div class="sms-off"><mat-icon>speaker_notes_off</mat-icon>{{ 'SMS off' | t }}</div> }</td></ng-container>
              <ng-container matColumnDef="city"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'City' | t }}</th><td mat-cell *matCellDef="let p">{{ p.city }}</td></ng-container>
              <ng-container matColumnDef="address"><th mat-header-cell *matHeaderCellDef>{{ 'Address' | t }}</th><td mat-cell *matCellDef="let p">{{ p.address }}</td></ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let p" class="num nowrap">
                  <a mat-icon-button [matTooltip]="'Orders' | t" [routerLink]="ordersLink()" [queryParams]="{ partyUuid: p.uuid, partyLabel: p.name + ' (' + p.code + ')' }"><mat-icon>receipt_long</mat-icon></a>
                  <button mat-icon-button [matTooltip]="'Edit' | t" (click)="edit(p)"><mat-icon>edit</mat-icon></button>
                  @if (auth.isAdmin()) {
                    <button mat-icon-button [matTooltip]="'Delete' | t" (click)="remove(p)"><mat-icon>delete</mat-icon></button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        }

        @if (!list.loading() && list.items().length === 0) { <div class="empty">{{ (list.error() ?? (kind() === 'customer' ? 'No customers found.' : 'No suppliers found.')) | t }}</div> }
        <app-list-footer [list]="list" [pageSizes]="[10, 20, 50, 100]" />
      </div>

      @if (layout.isHandset()) {
        <button mat-fab class="fab" [attr.aria-label]="(kind() === 'customer' ? 'New customer' : 'New supplier') | t" (click)="edit()"><mat-icon>add</mat-icon></button>
      }
    </div>
  `,
  styles: `
    .address { margin-top: 8px; }
    .sms-off { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; font-size: 11.5px; font-weight: 600; color: var(--erp-chip-warn-fg); }
    div.sms-off { margin: 2px 0 0; }
    .sms-off mat-icon { font-size: 14px; width: 14px; height: 14px; }
  `,
})
export class PartiesPage implements OnInit {
  readonly kind = input<PartyKind>('customer');
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly title = computed(() => (this.kind() === 'customer' ? 'Customers' : 'Suppliers'));
  readonly path = computed(() => (this.kind() === 'customer' ? '/customers' : '/suppliers'));
  readonly ordersLink = computed(() => (this.kind() === 'customer' ? '/sales-orders' : '/purchase-orders'));
  readonly columns = ['code', 'name', 'mobile', 'city', 'address', 'actions'];
  readonly list = new ListState<Party>((q) => this.api.get<Paged<Party>>(this.path(), { ...q }));

  ngOnInit(): void {
    this.list.reload();
  }

  edit(party?: Party): void {
    this.dialog.open(PartyDialog, this.layout.dialog({ kind: this.kind(), party: party ?? null })).afterClosed()
      .subscribe((saved) => saved && this.list.resetToFirstPage());
  }

  remove(p: Party): void {
    this.notify.confirm({ title: this.kind() === 'customer' ? 'Delete customer' : 'Delete supplier', message: t('Delete {name} ({code})? Existing orders keep their history.', { name: p.name, code: p.code }), confirmText: 'Delete', danger: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`${this.path()}/${p.uuid}`, { revision: p.revision }).subscribe({
          next: () => { this.notify.success('Deleted.'); this.list.resetToFirstPage(); },
          error: (e) => this.notify.error(e),
        });
      });
  }
}

@Component({
  selector: 'app-party-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title>{{ dialogTitle | t }} @if (data.party) { <span class="code">#{{ data.party.code }}</span> }</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field class="span-2"><mat-label>{{ (data.kind === 'customer' ? 'Customer name' : 'Supplier name') | t }}</mat-label><input matInput formControlName="name" /><mat-error>{{ err('name', 'Name') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>{{ 'Mobile number' | t }}</mat-label><input matInput formControlName="mobileNumber" placeholder="01712345678" /><mat-error>{{ err('mobileNumber', 'Mobile number') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>{{ 'NID' | t }}</mat-label><input matInput formControlName="nid" /></mat-form-field>
          <mat-form-field><mat-label>{{ 'TIN' | t }}</mat-label><input matInput formControlName="tin" /></mat-form-field>
          <mat-form-field><mat-label>{{ 'City' | t }}</mat-label><input matInput formControlName="city" /></mat-form-field>
          <mat-form-field class="span-2"><mat-label>{{ 'Address' | t }}</mat-label><input matInput formControlName="address" /></mat-form-field>
          <mat-form-field><mat-label>{{ 'State / Division' | t }}</mat-label><input matInput formControlName="state" /></mat-form-field>
          <mat-form-field><mat-label>{{ 'Postal code' | t }}</mat-label><input matInput formControlName="postalCode" /></mat-form-field>
        </div>
        <div class="switch-row" [class.off]="!form.controls.smsEnabled.value">
          <mat-icon>{{ form.controls.smsEnabled.value ? 'sms' : 'speaker_notes_off' }}</mat-icon>
          <div class="switch-text">
            <span class="switch-title">{{ (data.kind === 'customer' ? 'Send SMS to this customer' : 'Send SMS to this supplier') | t }}</span>
            <span class="switch-hint">{{ (form.controls.smsEnabled.value ? 'Gets an SMS for orders that have SMS turned on.' : 'Never gets an SMS, even when an order has SMS turned on.') | t }}</span>
          </div>
          <mat-slide-toggle formControlName="smsEnabled" [attr.aria-label]="'SMS' | t" />
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PartyDialog {
  readonly data = inject<{ kind: PartyKind; party: Party | null }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PartyDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly p = this.data.party;
  readonly dialogTitle = this.data.kind === 'customer'
    ? (this.p ? 'Edit customer' : 'New customer')
    : (this.p ? 'Edit supplier' : 'New supplier');
  readonly form = inject(FormBuilder).group({
    name: [this.p?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    mobileNumber: [this.p?.mobileNumber ?? '', [Validators.required, bdMobileValidator]],
    nid: [this.p?.nid ?? ''],
    tin: [this.p?.tin ?? ''],
    address: [this.p?.address ?? ''],
    city: [this.p?.city ?? ''],
    state: [this.p?.state ?? ''],
    postalCode: [this.p?.postalCode ?? ''],
    smsEnabled: [this.p?.smsEnabled ?? true],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const path = this.data.kind === 'customer' ? '/customers' : '/suppliers';
    const body = { ...this.form.getRawValue(), revision: this.p?.revision ?? null };
    const req = this.p ? this.api.put<Party>(`${path}/${this.p.uuid}`, body) : this.api.post<Party>(path, body);
    req.subscribe({
      next: (saved) => { this.notify.success('Saved {name} ({code}).', { name: saved.name, code: saved.code }); this.ref.close(saved); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
