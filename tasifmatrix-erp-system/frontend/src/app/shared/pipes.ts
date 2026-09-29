import { Pipe, PipeTransform } from '@angular/core';
import { QuantityType, Uom } from '../core/models';
import { shortLabel } from './units';

const moneyFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Up to 3 decimals, and none at all for whole numbers: 12, 2.5, 0.75 - never 2.500.
const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function formatMoney(value: number | null | undefined, symbol = true): string {
  if (value === null || value === undefined) return '-';
  return (symbol ? 'Tk ' : '') + moneyFormat.format(value);
}

/** 1234.5 -> "Tk 1,234.50" */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, symbol = true): string {
    return formatMoney(value, symbol);
  }
}

/** 2.5 -> "2.5"; with a unit, 2.5 -> "2.5 kg". */
@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(value: number | null | undefined, unit?: Uom | QuantityType | null): string {
    if (value === null || value === undefined) return '-';
    const text = qtyFormat.format(value);
    return unit ? `${text} ${shortLabel(unit)}` : text;
  }
}

/** "MOBILE_BANKING" -> "Mobile Banking" */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return enumLabel(value);
  }
}

export function enumLabel(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
