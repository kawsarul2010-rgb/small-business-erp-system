import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LayoutService } from '../../core/layout.service';
import { Paged, Product, Uom } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { ListFooter } from '../../shared/list-footer';
import { ListState } from '../../shared/list-state';
import { MoneyPipe, QtyPipe } from '../../shared/pipes';
import { SECONDARY_UOM_OPTIONS, UOM_OPTIONS, allowsFractions, baseUnit, baseUnitLabel, boxSizeLabel, shortLabel, stockLabel } from '../../shared/units';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { t } from '../../core/i18n/i18n';

@Component({
  selector: 'app-products',
  imports: [TranslatePipe, 
    MatTableModule, MatSortModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatTooltipModule, MatCheckboxModule, MatMenuModule, ListFooter, MoneyPipe, QtyPipe,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'Products' | t }}</h1>
          @if (!layout.isHandset()) {
            <div class="subtitle">{{ 'Prices and stock are per unit. A BOX product says what its box holds — 12 pcs, 25 kg, 5 litres — and stock is counted in that unit.' | t }}</div>
          }
        </div>
        @if (auth.isAdmin() && !layout.isHandset()) {
          <div class="actions"><button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>{{ 'New product' | t }}</button></div>
        }
      </div>

      <div class="card">
        <div class="toolbar">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'Search name or code' | t }}</mat-label>
            <input matInput (input)="list.search($any($event.target).value)" />
          </mat-form-field>
          <mat-checkbox (change)="lowOnly.set($event.checked); list.resetToFirstPage()">{{ 'Low stock only' | t }}</mat-checkbox>
        </div>
        @if (list.loading()) { <mat-progress-bar mode="indeterminate" /> }

        @if (layout.isHandset()) {
          <div class="m-list">
            @for (p of list.items(); track p.uuid) {
              <div class="m-card">
                <div class="m-card-head">
                  <div>
                    <div class="m-title">{{ p.productName }}</div>
                    <div class="m-sub">{{ p.productCode }} · {{ p.uom | t }}@if (boxSize(p); as b) { · {{ b }} }</div>
                  </div>
                  <div class="m-right">
                    <span class="m-amount" [class.negative]="p.lowStockThreshold !== null && p.currentStock <= p.lowStockThreshold">
                      {{ p.currentStock | qty }} <span class="unit">{{ stockUnit(p) }}</span>
                    </span>
                    @if (auth.isAdmin()) {
                      <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Actions' | t"><mat-icon>more_vert</mat-icon></button>
                      <mat-menu #menu="matMenu">
                        <button mat-menu-item (click)="edit(p)"><mat-icon>edit</mat-icon>{{ 'Edit' | t }}</button>
                        <button mat-menu-item (click)="remove(p)"><mat-icon>delete</mat-icon>{{ 'Delete' | t }}</button>
                      </mat-menu>
                    }
                  </div>
                </div>
                <div class="m-meta two">
                  <div><span class="k">{{ 'Purchase / {unit}' | t: { unit: stockUnit(p) } }}</span><span class="v">{{ p.productPurchasePrice | money: false }}</span></div>
                  <div><span class="k">{{ 'Sales / {unit}' | t: { unit: stockUnit(p) } }}</span><span class="v">{{ p.productSalesPrice | money: false }}</span></div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
              <ng-container matColumnDef="productCode"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Code' | t }}</th><td mat-cell *matCellDef="let p" class="code">{{ p.productCode }}</td></ng-container>
              <ng-container matColumnDef="productName"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'Name' | t }}</th><td mat-cell *matCellDef="let p">{{ p.productName }}</td></ng-container>
              <ng-container matColumnDef="uom"><th mat-header-cell *matHeaderCellDef>{{ 'UOM' | t }}</th><td mat-cell *matCellDef="let p" class="nowrap">{{ p.uom | t }}@if (boxSize(p); as b) { <span class="muted"> · {{ b }}</span> }</td></ng-container>
              <ng-container matColumnDef="productPurchasePrice"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Purchase / unit' | t }}</th><td mat-cell *matCellDef="let p" class="num nowrap">{{ p.productPurchasePrice | money }}</td></ng-container>
              <ng-container matColumnDef="productSalesPrice"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Sales / unit' | t }}</th><td mat-cell *matCellDef="let p" class="num nowrap">{{ p.productSalesPrice | money }}</td></ng-container>
              <ng-container matColumnDef="currentStock"><th mat-header-cell *matHeaderCellDef mat-sort-header class="num">{{ 'Stock' | t }}</th>
                <td mat-cell *matCellDef="let p" class="num" [class.negative]="p.lowStockThreshold !== null && p.currentStock <= p.lowStockThreshold">{{ p.currentStock | qty }} <span class="muted">{{ stockUnit(p) }}</span></td></ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let p" class="num nowrap">
                  @if (auth.isAdmin()) {
                    <button mat-icon-button [matTooltip]="'Edit' | t" (click)="edit(p)"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button [matTooltip]="'Delete' | t" (click)="remove(p)"><mat-icon>delete</mat-icon></button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        }

        @if (!list.loading() && list.items().length === 0) { <div class="empty">{{ (list.error() ?? 'No products found.') | t }}</div> }
        <app-list-footer [list]="list" [pageSizes]="[10, 20, 50, 100]" />
      </div>

      @if (auth.isAdmin() && layout.isHandset()) {
        <button mat-fab class="fab" [attr.aria-label]="'New product' | t" (click)="edit()"><mat-icon>add</mat-icon></button>
      }
    </div>
  `,
  styles: `.unit { font-size: 11px; font-weight: 500; color: var(--erp-muted); }`,
})
export class ProductsPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  readonly lowOnly = signal(false);
  readonly columns = ['productCode', 'productName', 'uom', 'productPurchasePrice', 'productSalesPrice', 'currentStock', 'actions'];

  /** Stock is counted in the product's base unit: pcs, kg or litre. */
  stockUnit(p: Product): string {
    return stockLabel(p);
  }

  /** "12 pcs/box", "25 kg/box" - null when the product has no box size. */
  boxSize(p: Product): string | null {
    return boxSizeLabel(p);
  }
  readonly list = new ListState<Product>((q) => this.api.get<Paged<Product>>('/products', { ...q, lowStockOnly: this.lowOnly() }));

  ngOnInit(): void {
    this.list.reload();
  }

  edit(product?: Product): void {
    this.dialog.open(ProductDialog, this.layout.dialog(product ?? null)).afterClosed().subscribe((saved) => saved && this.list.resetToFirstPage());
  }

  remove(p: Product): void {
    this.notify.confirm({ title: 'Delete product', message: t('Delete {name} ({code})?', { name: p.productName, code: p.productCode }), confirmText: 'Delete', danger: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/products/${p.uuid}`, { revision: p.revision }).subscribe({
          next: () => { this.notify.success('Product deleted.'); this.list.resetToFirstPage(); },
          error: (e) => this.notify.error(e),
        });
      });
  }
}

@Component({
  selector: 'app-product-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'Edit product' : 'New product') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field class="span-2"><mat-label>{{ 'Product name' | t }}</mat-label><input matInput formControlName="productName" /><mat-error>{{ err('productName', 'Product name') }}</mat-error></mat-form-field>
          <mat-form-field><mat-label>{{ 'Product code' | t }}</mat-label><input matInput formControlName="productCode" /><mat-error>{{ err('productCode', 'Product code') }}</mat-error></mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'UOM' | t }}</mat-label>
            <mat-select formControlName="uom">
              @for (u of uomOptions; track u) { <mat-option [value]="u">{{ u | t }}</mat-option> }
            </mat-select>
            <mat-hint>{{ (isBox() ? 'A box — say what it holds below' : (measured() ? 'Measured — quantities may be fractional' : 'Counted in whole units')) | t }}</mat-hint>
          </mat-form-field>

          @if (isBox()) {
            <mat-form-field>
              <mat-label>{{ 'A box contains' | t }}</mat-label>
              <mat-select formControlName="secondaryUom">
                @for (u of secondaryOptions; track u) { <mat-option [value]="u">{{ u | t }}</mat-option> }
              </mat-select>
              <mat-hint>{{ 'Stock is counted in this unit' | t }}</mat-hint>
              <mat-error>{{ err('secondaryUom', 'Secondary UOM') }}</mat-error>
            </mat-form-field>
          }

          @if (isBox() || form.value.uom === 'PCS') {
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ '{unit} per box' | t: { unit: unitTitle() } }}</mat-label>
              <input matInput type="number" [attr.inputmode]="measured() ? 'decimal' : 'numeric'" min="0" [step]="measured() ? 0.001 : 1" formControlName="unitPerBox" />
              <mat-hint>{{ (isBox() ? 'Required for BOX' : 'Optional — enables BOX entry on orders') | t }}</mat-hint>
              <mat-error>{{ err('unitPerBox', 'Units per box') }}</mat-error>
            </mat-form-field>
          }

          <mat-form-field floatLabel="always"><mat-label>{{ 'Purchase price per {unit}' | t: { unit: unit() } }}</mat-label><span matTextPrefix>Tk&nbsp;</span><input matInput type="number" inputmode="decimal" min="0" step="0.01" formControlName="productPurchasePrice" /><mat-error>{{ err('productPurchasePrice', 'Purchase price') }}</mat-error></mat-form-field>
          <mat-form-field floatLabel="always"><mat-label>{{ 'Sales price per {unit}' | t: { unit: unit() } }}</mat-label><span matTextPrefix>Tk&nbsp;</span><input matInput type="number" inputmode="decimal" min="0" step="0.01" formControlName="productSalesPrice" /><mat-error>{{ err('productSalesPrice', 'Sales price') }}</mat-error></mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'Low stock alert at ({unit})' | t: { unit: unit() } }}</mat-label>
            <input matInput type="number" [attr.inputmode]="measured() ? 'decimal' : 'numeric'" min="0" [step]="measured() ? 0.001 : 1" formControlName="lowStockThreshold" />
            <mat-hint>{{ 'Optional' | t }}</mat-hint>
          </mat-form-field>
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
export class ProductDialog {
  readonly data = inject<Product | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ProductDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(FormBuilder).group({
    productName: [this.data?.productName ?? '', [Validators.required, Validators.maxLength(200)]],
    productCode: [this.data?.productCode ?? '', [Validators.required, Validators.maxLength(50)]],
    uom: [(this.data?.uom ?? 'PCS') as Uom, Validators.required],
    secondaryUom: [this.data?.secondaryUom ?? null as Uom | null],
    productPurchasePrice: [this.data?.productPurchasePrice ?? null as number | null, [Validators.required, Validators.min(0)]],
    productSalesPrice: [this.data?.productSalesPrice ?? null as number | null, [Validators.required, Validators.min(0)]],
    unitPerBox: [this.data?.unitPerBox ?? null as number | null, [Validators.min(1)]],
    lowStockThreshold: [this.data?.lowStockThreshold ?? null as number | null, [Validators.min(0)]],
  });

  readonly uomOptions = UOM_OPTIONS;
  readonly secondaryOptions = SECONDARY_UOM_OPTIONS;

  private readonly uomValue = signal<Uom>(this.data?.uom ?? 'PCS');
  private readonly secondaryValue = signal<Uom | null>(this.data?.secondaryUom ?? null);

  readonly isBox = computed(() => this.uomValue() === 'BOX');
  /** The unit stock is counted in: the box contents for a BOX product, else its own unit. */
  readonly base = computed(() => baseUnit({ uom: this.uomValue(), secondaryUom: this.secondaryValue() }));
  /** KG and LITRE are measured, so quantities and thresholds may be fractional. */
  readonly measured = computed(() => allowsFractions(this.base()));
  readonly unit = computed(() => shortLabel(this.base()));
  readonly unitTitle = computed(() => baseUnitLabel(this.base()));

  constructor() {
    const sync = () => {
      const uom = this.form.controls.uom.value;
      const secondary = this.form.controls.secondaryUom;
      this.uomValue.set(uom ?? 'PCS');

      // A secondary unit only means something for a BOX product.
      if (uom !== 'BOX') {
        if (secondary.value !== null) secondary.setValue(null, { emitEvent: false });
      } else if (secondary.value === null) {
        secondary.setValue('PCS', { emitEvent: false });
      }
      secondary.setValidators(uom === 'BOX' ? [Validators.required] : []);
      secondary.updateValueAndValidity({ emitEvent: false });
      this.secondaryValue.set(secondary.value);

      const perBox = this.form.controls.unitPerBox;
      // Only a box has a box size; a loose product measured by weight has none.
      if (uom === 'KG' || uom === 'LITRE') perBox.setValue(null, { emitEvent: false });
      perBox.setValidators(uom === 'BOX' ? [Validators.required, Validators.min(0.001)] : [Validators.min(0.001)]);
      perBox.updateValueAndValidity({ emitEvent: false });
    };
    sync();
    this.form.controls.uom.valueChanges.pipe(takeUntilDestroyed()).subscribe(sync);
    this.form.controls.secondaryUom.valueChanges.pipe(takeUntilDestroyed()).subscribe(sync);
  }

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const body = { ...this.form.getRawValue(), revision: this.data?.revision ?? null };
    const req = this.data ? this.api.put<Product>(`/products/${this.data.uuid}`, body) : this.api.post<Product>('/products', body);
    req.subscribe({
      next: () => { this.notify.success('Product saved.'); this.ref.close(true); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.busy.set(false); },
    });
  }
}
