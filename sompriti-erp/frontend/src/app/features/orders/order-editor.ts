import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService, dateToIso, isoToDate, problemOf } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import {
  DropdownItem, OrderDetail, OrderKind, OrderLineRequest, OrderSaveRequest, PaymentType, Product, ProductDropdownItem, QuantityType, StockShortage, Uom,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { applyServerErrors, controlError } from '../../shared/form-errors';
import { MoneyPipe, QtyPipe } from '../../shared/pipes';
import { SearchSelect } from '../../shared/search-select';
import { allowsFractions, entryTypesFor, quantityInputMode, quantityLabel, quantityStep, shortLabel, stockLabel } from '../../shared/units';
import { orderMeta } from './order-kind';

type LineForm = FormGroup<{
  uuid: FormControl<string | null>;
  productUuid: FormControl<string | null>;
  quantityType: FormControl<QuantityType>;
  boxQuantity: FormControl<number | null>;
  pcsQuantity: FormControl<number | null>;
  totalQuantityPcs: FormControl<number | null>;
  perPcsPrice: FormControl<number | null>;
  perBoxPrice: FormControl<number | null>;
  totalPrice: FormControl<number | null>;
}>;

/** What the editor needs to know about a line's product. */
interface LineProduct {
  label: string;
  uom: Uom;
  pcsPerBox: number | null;
  defaultPrice: number;
  currentStock: number | null;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

@Component({
  selector: 'app-order-editor',
  imports: [
    ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule,
    MatIconModule, MatTooltipModule, MatProgressBarModule, SearchSelect, MoneyPipe, QtyPipe,
  ],
  templateUrl: './order-editor.html',
  styleUrl: './order-editor.scss',
})
export class OrderEditorPage implements OnInit {
  readonly kind = input<OrderKind>('sales');
  readonly id = input<string | undefined>(undefined);

  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder);

  readonly meta = computed(() => orderMeta(this.kind()));
  readonly isSales = computed(() => this.kind() === 'sales');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly shortages = signal<StockShortage[]>([]);
  readonly companies = signal<DropdownItem[]>([]);
  readonly order = signal<OrderDetail | null>(null);
  readonly today = new Date();

  /** Product info per line, parallel to the lines FormArray. */
  readonly lineProducts = signal<(LineProduct | null)[]>([]);
  readonly total = signal(0);
  readonly stockWarnings = signal<string[]>([]);

  readonly paymentTypes: { value: PaymentType; label: string }[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'DUE', label: 'Due' },
    { value: 'INSTALLMENT', label: 'Installment' },
  ];

  readonly form = this.fb.group({
    companyUuid: this.fb.control<string | null>(null, Validators.required),
    partyUuid: this.fb.control<string | null>(null, Validators.required),
    paymentType: this.fb.control<PaymentType>('CASH', { nonNullable: true, validators: Validators.required }),
    orderDate: this.fb.control<Date | null>(new Date(), Validators.required),
    notes: this.fb.control<string | null>(null, Validators.maxLength(1000)),
    lines: this.fb.array<LineForm>([]),
  });

  get lines(): FormArray<LineForm> {
    return this.form.controls.lines;
  }

  readonly fetchParties = (term: string) => this.api.get<DropdownItem[]>(`${this.meta().partyApi}/dropdown`, { search: term });
  readonly fetchProducts = (term: string) => this.api.get<ProductDropdownItem[]>('/products/dropdown', { search: term });
  readonly productHint = (p: ProductDropdownItem) => {
    const unit = stockLabel(p.uom);
    return `${p.currentStock} ${unit} in stock · Tk ${this.isSales() ? p.salesPrice : p.purchasePrice}/${unit}`;
  };

  ngOnInit(): void {
    const id = this.id();
    forkJoin({
      companies: this.api.get<DropdownItem[]>('/companies/dropdown'),
      order: id ? this.api.get<OrderDetail>(`${this.meta().api}/${id}`) : of(null),
    }).subscribe({
      next: ({ companies, order }) => {
        this.companies.set(companies);
        if (order) {
          if (order.postingStatus !== 'DRAFT') {
            this.notify.error(`Only DRAFT orders can be edited. This order is ${order.postingStatus}.`);
            void this.router.navigate([this.meta().route, order.uuid]);
            return;
          }
          this.loadOrder(order);
        } else {
          // SRS 6.1: the first company is selected by default
          if (companies.length > 0) this.form.controls.companyUuid.setValue(companies[0].uuid);
          this.addLine();
          this.loading.set(false);
        }
      },
      error: (e) => {
        this.error.set(problemOf(e).title ?? 'Could not load the order.');
        this.loading.set(false);
      },
    });
  }

  private loadOrder(order: OrderDetail): void {
    this.order.set(order);
    this.form.patchValue({
      companyUuid: order.company.uuid,
      partyUuid: order.party.uuid,
      paymentType: order.paymentType,
      orderDate: isoToDate(order.orderDate),
      notes: order.notes,
    });
    const productIds = [...new Set(order.lines.map((l) => l.productUuid))];
    const products$ = productIds.length
      ? forkJoin(productIds.map((pid) => this.api.get<Product>(`/products/${pid}`)))
      : of([] as Product[]);

    products$.subscribe({
      next: (products) => {
        const byId = new Map(products.map((p) => [p.uuid, p]));
        const metas: (LineProduct | null)[] = [];
        for (const l of order.lines) {
          const p = byId.get(l.productUuid);
          this.lines.push(this.newLine({
            uuid: l.uuid, productUuid: l.productUuid, quantityType: l.quantityType, boxQuantity: l.boxQuantity,
            pcsQuantity: l.pcsQuantity, totalQuantityPcs: l.totalQuantityPcs, perPcsPrice: l.perPcsPrice,
            perBoxPrice: l.perBoxPrice, totalPrice: l.totalPrice,
          }));
          metas.push({
            label: `${l.productName} (${l.productCode})`,
            // Fall back to the line's own quantity type when the product is no longer listed.
            uom: p?.uom ?? (l.quantityType === 'BOX' ? 'BOX' : (l.quantityType as Uom)),
            pcsPerBox: p?.pcsPerBox ?? l.pcsPerBoxSnapshot,
            defaultPrice: p ? (this.isSales() ? p.productSalesPrice : p.productPurchasePrice) : l.perPcsPrice,
            currentStock: p?.currentStock ?? null,
          });
        }
        this.lineProducts.set(metas);
        if (order.lines.length === 0) this.addLine();
        this.refresh();
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(problemOf(e).title ?? 'Could not load products.');
        this.loading.set(false);
      },
    });
  }

  // ---------------------------------------------------------------- lines

  private newLine(v?: Partial<OrderLineRequest>): LineForm {
    return this.fb.group({
      uuid: this.fb.control<string | null>(v?.uuid ?? null),
      productUuid: this.fb.control<string | null>(v?.productUuid ?? null, Validators.required),
      quantityType: this.fb.control<QuantityType>(v?.quantityType ?? 'PCS', { nonNullable: true }),
      boxQuantity: this.fb.control<number | null>(v?.boxQuantity ?? null, Validators.min(1)),
      pcsQuantity: this.fb.control<number | null>(v?.pcsQuantity ?? null, Validators.min(1)),
      totalQuantityPcs: this.fb.control<number | null>(v?.totalQuantityPcs ?? null, [Validators.required, Validators.min(1)]),
      perPcsPrice: this.fb.control<number | null>(v?.perPcsPrice ?? null, [Validators.required, Validators.min(0)]),
      perBoxPrice: this.fb.control<number | null>(v?.perBoxPrice ?? null, Validators.min(0)),
      totalPrice: this.fb.control<number | null>(v?.totalPrice ?? null, [Validators.required, Validators.min(0)]),
    }) as LineForm;
  }

  addLine(): void {
    this.lines.push(this.newLine());
    this.lineProducts.update((m) => [...m, null]);
    this.applyQuantityValidators(this.lines.length - 1);
  }

  removeLine(i: number): void {
    const line = this.lines.at(i);
    const hasContent = !!line.value.productUuid;
    const doRemove = () => {
      this.lines.removeAt(i);
      this.lineProducts.update((m) => m.filter((_, idx) => idx !== i));
      if (this.lines.length === 0) this.addLine();
      this.refresh();
    };
    if (!hasContent) return doRemove();
    this.notify
      .confirm({ title: 'Remove line', message: 'Remove this line item? The change is saved when you save the order.', confirmText: 'Remove', danger: true })
      .subscribe((ok) => ok && doRemove());
  }

  productMeta(i: number): LineProduct | null {
    return this.lineProducts()[i] ?? null;
  }

  canUseBox(i: number): boolean {
    return (this.productMeta(i)?.pcsPerBox ?? 0) > 0;
  }

  /** The units this line may be entered in, from the selected product. */
  entryTypes(i: number): QuantityType[] {
    return entryTypesFor(this.productMeta(i)?.uom ?? 'PCS');
  }

  /** "Pcs", "Kg", "Litre" - the label for this line's quantity field. */
  quantityLabelFor(i: number): string {
    return quantityLabel(this.lines.at(i).controls.quantityType.value);
  }

  /** Measured lines accept fractions; counted lines step by whole units. */
  quantityStepFor(i: number): number {
    return quantityStep(this.lines.at(i).controls.quantityType.value);
  }

  quantityModeFor(i: number): 'decimal' | 'numeric' {
    return quantityInputMode(this.lines.at(i).controls.quantityType.value);
  }

  /** "kg", "pcs" - the unit the line total is counted in. */
  unitFor(i: number): string {
    return shortLabel(this.lines.at(i).controls.quantityType.value);
  }

  /** The unit this line's product is stocked in. */
  stockUnitFor(i: number): string {
    return stockLabel(this.productMeta(i)?.uom ?? 'PCS');
  }

  onProductSelected(i: number, item: ProductDropdownItem | null): void {
    const line = this.lines.at(i);
    if (!item) {
      this.lineProducts.update((m) => m.map((x, idx) => (idx === i ? null : x)));
      this.refresh();
      return;
    }
    const meta: LineProduct = {
      label: item.label,
      uom: item.uom,
      pcsPerBox: item.pcsPerBox,
      defaultPrice: this.isSales() ? item.salesPrice : item.purchasePrice,
      currentStock: item.currentStock,
    };
    this.lineProducts.update((m) => m.map((x, idx) => (idx === i ? meta : x)));
    // A product is ordered in its own unit: boxes for a BOX product, kg for a KG one.
    const useBox = item.uom === 'BOX' && (item.pcsPerBox ?? 0) > 0;
    line.patchValue({
      quantityType: useBox ? 'BOX' : entryTypesFor(item.uom)[0],
      boxQuantity: useBox ? line.value.boxQuantity ?? 1 : null,
      pcsQuantity: useBox ? null : line.value.pcsQuantity ?? 1,
      perPcsPrice: meta.defaultPrice,
    });
    this.applyQuantityValidators(i);
    this.recalcQuantity(i);
  }

  onQuantityTypeChange(i: number): void {
    const line = this.lines.at(i);
    const ppb = this.productMeta(i)?.pcsPerBox ?? 0;
    if (line.value.quantityType === 'BOX') {
      const pcs = line.value.pcsQuantity ?? 0;
      line.patchValue({ boxQuantity: ppb > 0 ? Math.max(1, Math.round(pcs / ppb)) : 1, pcsQuantity: null });
    } else {
      line.patchValue({ pcsQuantity: line.value.totalQuantityPcs ?? 1, boxQuantity: null, perBoxPrice: null });
    }
    this.applyQuantityValidators(i);
    this.recalcQuantity(i);
  }

  /** Box or pcs quantity changed: total pcs = pcs, or boxes x pcs per box. */
  recalcQuantity(i: number): void {
    const line = this.lines.at(i);
    const v = line.getRawValue();
    const ppb = this.productMeta(i)?.pcsPerBox ?? 0;
    const total = v.quantityType === 'BOX' ? (v.boxQuantity ?? 0) * ppb : v.pcsQuantity ?? 0;
    line.controls.totalQuantityPcs.setValue(total || null);
    this.recalcFromPerPcs(i);
  }

  /** Per pcs price changed: derive per box price and total. */
  recalcFromPerPcs(i: number): void {
    const line = this.lines.at(i);
    const v = line.getRawValue();
    const ppb = this.productMeta(i)?.pcsPerBox ?? 0;
    const perPcs = v.perPcsPrice ?? 0;
    line.patchValue({
      perBoxPrice: v.quantityType === 'BOX' && ppb > 0 ? round2(perPcs * ppb) : null,
      totalPrice: round2((v.totalQuantityPcs ?? 0) * perPcs),
    });
    this.refresh();
  }

  /** Per box price changed: derive per pcs price; total = boxes x box price (SRS 7.2.1). */
  recalcFromPerBox(i: number): void {
    const line = this.lines.at(i);
    const v = line.getRawValue();
    const ppb = this.productMeta(i)?.pcsPerBox ?? 0;
    if (ppb <= 0) return;
    const perBox = v.perBoxPrice ?? 0;
    line.patchValue({ perPcsPrice: round2(perBox / ppb), totalPrice: round2((v.boxQuantity ?? 0) * perBox) });
    this.refresh();
  }

  /** Total pcs edited manually (e.g. extra loose pieces): total = pcs x per pcs price. */
  recalcFromTotalQty(i: number): void {
    const line = this.lines.at(i);
    const v = line.getRawValue();
    line.controls.totalPrice.setValue(round2((v.totalQuantityPcs ?? 0) * (v.perPcsPrice ?? 0)));
    this.refresh();
  }

  private applyQuantityValidators(i: number): void {
    const line = this.lines.at(i);
    const type = line.controls.quantityType.value;
    const isBox = type === 'BOX';
    // Measured units may be a fraction of one, so the minimum is the smallest step.
    const min = allowsFractions(type) ? 0.001 : 1;
    line.controls.boxQuantity.setValidators(isBox ? [Validators.required, Validators.min(1)] : []);
    line.controls.pcsQuantity.setValidators(isBox ? [] : [Validators.required, Validators.min(min)]);
    line.controls.boxQuantity.updateValueAndValidity({ emitEvent: false });
    line.controls.pcsQuantity.updateValueAndValidity({ emitEvent: false });
  }

  /** Recomputes the order total and sales stock warnings. */
  refresh(): void {
    const values = this.lines.getRawValue();
    this.total.set(round2(values.reduce((sum, l) => sum + (Number(l.totalPrice) || 0), 0)));

    if (!this.isSales()) return;
    const needed = new Map<string, number>();
    values.forEach((l) => l.productUuid && needed.set(l.productUuid, (needed.get(l.productUuid) ?? 0) + (Number(l.totalQuantityPcs) || 0)));
    const warnings: string[] = [];
    const seen = new Set<string>();
    values.forEach((l, i) => {
      const meta = this.productMeta(i);
      if (!l.productUuid || !meta || meta.currentStock === null || seen.has(l.productUuid)) return;
      seen.add(l.productUuid);
      const qty = needed.get(l.productUuid) ?? 0;
      if (qty > meta.currentStock) warnings.push(`${meta.label}: requested ${qty} pcs, only ${meta.currentStock} in stock.`);
    });
    this.stockWarnings.set(warnings);
  }

  err(control: FormControl | null, label: string): string {
    return controlError(control, label);
  }

  // ---------------------------------------------------------------- save

  save(): void {
    this.error.set(null);
    this.shortages.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please complete the highlighted fields.');
      return;
    }
    if (this.stockWarnings().length > 0) {
      this.error.set('Not enough stock for one or more lines. Reduce the quantity before saving.');
      return;
    }

    const v = this.form.getRawValue();
    const body: OrderSaveRequest = {
      companyUuid: v.companyUuid,
      partyUuid: v.partyUuid,
      paymentType: v.paymentType,
      orderDate: dateToIso(v.orderDate),
      notes: v.notes,
      revision: this.order()?.revision ?? null,
      lines: v.lines.map((l) => ({
        ...l,
        boxQuantity: l.quantityType === 'BOX' ? l.boxQuantity : null,
        pcsQuantity: l.quantityType === 'PCS' ? l.pcsQuantity : null,
        perBoxPrice: l.quantityType === 'BOX' ? l.perBoxPrice : null,
      })),
    };

    this.saving.set(true);
    const existing = this.order();
    const req = existing
      ? this.api.put<OrderDetail>(`${this.meta().api}/${existing.uuid}`, body)
      : this.api.post<OrderDetail>(this.meta().api, body);

    req.subscribe({
      next: (saved) => {
        this.notify.success(`${this.meta().singular} #${saved.orderNumber} saved as draft.`);
        void this.router.navigate([this.meta().route, saved.uuid]);
      },
      error: (e) => {
        const problem = problemOf(e);
        if (problem.code === 'INSUFFICIENT_STOCK' && Array.isArray(problem.details)) this.shortages.set(problem.details as StockShortage[]);
        this.error.set(applyServerErrors(this.form, e));
        this.saving.set(false);
      },
    });
  }

  cancel(): void {
    const o = this.order();
    void this.router.navigate(o ? [this.meta().route, o.uuid] : [this.meta().route]);
  }
}
