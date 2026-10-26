import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
import { Observable, catchError, map, of } from 'rxjs';
import { ApiService, dateToIso, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { OrderDetail, Paged, Party } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, bdMobileValidator, controlError } from '../../shared/form-errors';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';
import { formatMoney } from '../../shared/pipes';
import { OpeningDueDialog, OpeningDueDialogData } from '../orders/opening-due-dialog';

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
                    <button mat-menu-item (click)="addPreviousDue(p)"><mat-icon>history</mat-icon>{{ 'Add previous due' | t }}</button>
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
                  <button mat-icon-button [matTooltip]="'Add previous due' | t" (click)="addPreviousDue(p)"><mat-icon>history</mat-icon></button>
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

  /** Records what this customer or supplier owed before the business started using the app. */
  addPreviousDue(p: Party): void {
    const data: OpeningDueDialogData = { kind: this.kind() === 'customer' ? 'sales' : 'purchase', party: { uuid: p.uuid, name: p.name, code: p.code } };
    this.dialog.open(OpeningDueDialog, this.layout.dialog(data, '520px'));
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
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatDatepickerModule],
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
        @if (!p) {
          <!-- A business moving to the app brings its old dues along without the old orders. -->
          <div class="prev-due">
            <div class="prev-due-head">
              <mat-icon>history</mat-icon>
              <div>
                <div class="switch-title">{{ 'Previous due (optional)' | t }}</div>
                <div class="switch-hint">{{ (data.kind === 'customer'
                  ? 'Did this customer already owe you money before you started using the app? Enter it here.'
                  : 'Did you already owe this supplier money before you started using the app? Enter it here.') | t }}</div>
              </div>
            </div>
            <div class="form-grid">
              <mat-form-field floatLabel="always">
                <mat-label>{{ 'Previous due' | t }}</mat-label>
                <span matTextPrefix>Tk&nbsp;</span>
                <input matInput type="number" min="0" step="0.01" formControlName="previousDue" placeholder="0" />
                <mat-error>{{ err('previousDue', 'Previous due') }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'Due as of' | t }}</mat-label>
                <input matInput [matDatepicker]="pdp" formControlName="previousDueDate" />
                <mat-datepicker-toggle matIconSuffix [for]="pdp" /><mat-datepicker #pdp />
              </mat-form-field>
            </div>
          </div>
        }
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .prev-due { margin-top: 14px; padding: 12px 14px 0; border: 1px dashed var(--erp-border); border-radius: 12px; }
    .prev-due-head { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
    .prev-due-head mat-icon { color: var(--erp-chip-warn-fg); flex: none; }
    .prev-due-head .switch-title { display: block; font-weight: 600; }
    .prev-due-head .switch-hint { display: block; font-size: 12.5px; color: var(--erp-muted); }
  `,
})
export class PartyDialog {
  readonly data = inject<{ kind: PartyKind; party: Party | null }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PartyDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly p = this.data.party;
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
    // New customer or supplier only: what they owed before the business used the app.
    previousDue: [null as number | null, [Validators.min(0)]],
    previousDueDate: [new Date() as Date | null],
  });

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const path = this.data.kind === 'customer' ? '/customers' : '/suppliers';
    const { previousDue, previousDueDate, ...fields } = this.form.getRawValue();
    const body = { ...fields, revision: this.p?.revision ?? null };
    const req = this.p ? this.api.put<Party>(`${path}/${this.p.uuid}`, body) : this.api.post<Party>(path, body);
    req.subscribe({
      next: (saved) => {
        if (this.p || !previousDue || previousDue <= 0) {
          this.notify.success('Saved {name} ({code}).', { name: saved.name, code: saved.code });
          this.ref.close(saved);
          return;
        }
        // The customer or supplier is saved; their previous due goes in as a second step.
        this.savePreviousDue(saved, previousDue, previousDueDate).subscribe((ok) => {
          if (ok) this.notify.success('Saved {name} ({code}) with a previous due of {amount}.', { name: saved.name, code: saved.code, amount: formatMoney(previousDue) });
          this.ref.close(saved);
        });
      },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }

  /** True when saved. On failure the party stays saved and the user is told to add the due from the list. */
  private savePreviousDue(party: Party, amount: number, date: Date | null): Observable<boolean> {
    const api = this.data.kind === 'customer' ? '/sales-orders' : '/purchase-orders';
    return this.api.post<OrderDetail>(`${api}/opening-due`, { partyUuid: party.uuid, amount, dueDate: dateToIso(date) }).pipe(
      map(() => true),
      catchError((e) => {
        this.notify.error('{name} was saved, but the previous due was not ({reason}). Use "Add previous due" in the list to add it.',
          { name: party.name, reason: errorMessage(e) });
        return of(false);
      }),
    );
  }
}
