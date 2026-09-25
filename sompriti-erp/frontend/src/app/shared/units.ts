import { QuantityType, Uom } from '../core/models';

/**
 * Units of measure, mirroring the server's rules in Domain/Rules.
 *
 * PCS and BOX are counted in whole units. KG and LITRE are measured, so they carry up to
 * three decimal places - enough for grams and millilitres.
 */

export const UOM_OPTIONS: readonly Uom[] = ['PCS', 'BOX', 'KG', 'LITRE'];

/** KG and LITRE can be half a unit; pieces and boxes cannot. */
export function allowsFractions(unit: Uom | QuantityType | null | undefined): boolean {
  return unit === 'KG' || unit === 'LITRE';
}

/** Only BOX products need a pcs-per-box conversion. */
export function requiresPcsPerBox(uom: Uom | null | undefined): boolean {
  return uom === 'BOX';
}

/**
 * How a line for this product may be entered. A BOX product can also be sold loose by the
 * piece; everything else is ordered in its own unit.
 */
export function entryTypesFor(uom: Uom | null | undefined): QuantityType[] {
  switch (uom) {
    case 'BOX':
      return ['BOX', 'PCS'];
    case 'KG':
      return ['KG'];
    case 'LITRE':
      return ['LITRE'];
    default:
      return ['PCS'];
  }
}

/** "kg", "litre", "pcs", "box" - for use after a number. */
export function shortLabel(unit: Uom | QuantityType | null | undefined): string {
  switch (unit) {
    case 'BOX':
      return 'box';
    case 'KG':
      return 'kg';
    case 'LITRE':
      return 'litre';
    default:
      return 'pcs';
  }
}

/** The unit stock is counted in: pieces for PCS and BOX products, kg or litres otherwise. */
export function stockLabel(uom: Uom | null | undefined): string {
  return uom === 'KG' ? 'kg' : uom === 'LITRE' ? 'litre' : 'pcs';
}

/** Field label for the quantity input, e.g. "Kg" or "Pcs". */
export function quantityLabel(unit: QuantityType | null | undefined): string {
  const s = shortLabel(unit);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Step for a number input: 0.001 where fractions are allowed, otherwise 1. */
export function quantityStep(unit: Uom | QuantityType | null | undefined): number {
  return allowsFractions(unit) ? 0.001 : 1;
}

/** Measured quantities need a decimal keypad on phones; counted ones a numeric one. */
export function quantityInputMode(unit: Uom | QuantityType | null | undefined): 'decimal' | 'numeric' {
  return allowsFractions(unit) ? 'decimal' : 'numeric';
}
