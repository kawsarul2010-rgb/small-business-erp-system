import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ApiService, problemOf } from '../../core/api.service';
import { durationLabel } from '../../core/billing';
import { BusinessDetail, BusinessSubscription } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MoneyPipe } from '../../shared/pipes';

/**
 * Special package prices for one business. An empty price means the business pays its size's
 * price; a price here replaces it (0 makes the package free for this business).
 */
@Component({
  selector: 'app-special-prices-dialog',
  imports: [TranslatePipe, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>{{ 'Special prices for {name}' | t: { name: data.business.name } }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="muted intro">{{ 'Leave a price empty to charge the normal price for its size ({size}). A special price replaces it for this business only.' | t: { size: data.subscription.sizeName ?? ('no size' | t) } }}</p>
        <div class="rows">
          <div formArrayName="rows">
            @for (row of rows.controls; track $index; let i = $index) {
              <div class="row" [formGroupName]="i">
                <div class="plan">
                  <strong>{{ prices[i].planName }}</strong>
                  <span class="muted small">{{ length(prices[i].durationMonths) }}@if (!prices[i].isActive) { · {{ 'not offered' | t }} }</span>
                  <span class="small normal">{{ 'Normal price' | t }}:
                    @if (prices[i].sizePrice !== null) { {{ prices[i].sizePrice | money }} } @else { <span class="muted">{{ 'not offered to this size' | t }}</span> }</span>
                </div>
                <mat-form-field class="price" subscriptSizing="dynamic" floatLabel="always">
                  <mat-label>{{ 'Special price' | t }}</mat-label>
                  <input matInput type="number" min="0" inputmode="decimal" formControlName="price" [placeholder]="'Normal' | t" />
                  <span matTextPrefix>Tk&nbsp;</span>
                </mat-form-field>
              </div>
            } @empty {
              <p class="muted">{{ 'There are no packages yet.' | t }}</p>
            }
          </div>
        </div>
        @if (error()) { <p class="negative">{{ error() | t }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="clearAll()" class="clear">{{ 'Clear all' | t }}</button>
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close>{{ 'Cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="busy() || form.invalid">{{ 'Save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .intro { margin: 0 0 12px; font-size: 13.5px; line-height: 1.5; }
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--erp-border); }
    .plan { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .normal { color: var(--erp-muted); }
    .price { width: 160px; flex: none; }
    .small { font-size: 12.5px; }
    .spacer { flex: 1; }
    .clear { color: var(--erp-negative); }
    @media (max-width: 600px) { .row { flex-wrap: wrap; } .price { width: 100%; } }
  `,
})
export class SpecialPricesDialog {
  readonly data = inject<{ business: BusinessDetail; subscription: BusinessSubscription }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SpecialPricesDialog>);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder);

  readonly prices = this.data.subscription.prices ?? [];
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    rows: this.fb.array(this.prices.map((p) => this.fb.group({ price: [p.specialPrice as number | null, Validators.min(0)] }))),
  });

  get rows(): FormArray {
    return this.form.controls.rows;
  }

  length(months: number): string {
    return durationLabel(months);
  }

  clearAll(): void {
    this.rows.controls.forEach((c) => c.get('price')!.setValue(null));
  }

  save(): void {
    this.busy.set(true);
    const values = this.rows.getRawValue() as { price: number | string | null }[];
    const body = {
      prices: this.prices.map((p, i) => {
        const raw = values[i].price;
        return { planUuid: p.planUuid, price: raw === null || raw === '' ? null : Number(raw) };
      }),
    };
    this.api.put<BusinessSubscription>(`/platform/billing/businesses/${this.data.business.uuid}/prices`, body).subscribe({
      next: (s) => { this.notify.success('Special prices saved.'); this.ref.close(s); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not save.'); this.busy.set(false); },
    });
  }
}
