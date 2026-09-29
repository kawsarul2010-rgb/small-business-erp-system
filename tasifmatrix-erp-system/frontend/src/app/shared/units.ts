import { QuantityType, Uom } from '../core/models';

/**
 * Units of measure, mirroring the server's rules in Domain/Rules.
 *
 * A product's PRIMARY unit is `uom`. When that is BOX, `secondaryUom` says what the box
 * holds and `unitPerBox` how much of it:
 *
 *   BOX + PCS   + 12  -> a carton of 12 pieces
 *   BOX + KG    + 25  -> a 25 kg sack
 *   BOX + LITRE + 5   -> a 5 litre tin
 *
 * The BASE unit - what stock is counted in and prices are quoted in - is the secondary unit
 * for a BOX product, and the product's own unit otherwise. PCS and BOX are counted in whole
 * units; KG and LITRE are measured, so they carry up to three decimals.
 */

/** A product's unit, as the order editor and product form need it. */
export interface UnitInfo {
  uom: Uom;
  secondaryUom?: Uom | null;
  unitPerBox?: number | null;
}

export const UOM_OPTIONS: readonly Uom[] = ['PCS', 'BOX', 'KG', 'LITRE'];

/** What a box may contain - anything except another box. */
export const SECONDARY_UOM_OPTIONS: readonly Uom[] = ['PCS', 'KG', 'LITRE'];

/** KG and LITRE can be half a unit; pieces and boxes cannot. */
export function allowsFractions(unit: Uom | QuantityType | null | undefined): boolean {
  return unit === 'KG' || unit === 'LITRE';
}

/** A BOX product must say what its box holds and how much of it. */
export function requiresSecondaryUom(uom: Uom | null | undefined): boolean {
  return uom === 'BOX';
}

/**
 * The unit stock is counted in and prices are quoted in. Accepts a product, or a bare unit
 * for the callers that only have one (in which case BOX falls back to pieces).
 */
export function baseUnit(p: UnitInfo | Uom | null | undefined): Uom {
  if (!p) return 'PCS';
  if (typeof p === 'string') return p === 'BOX' ? 'PCS' : p;
  return p.uom === 'BOX' ? p.secondaryUom ?? 'PCS' : p.uom;
}

/** The base unit expressed as a line's quantity type. */
export function baseQuantityType(p: UnitInfo | Uom | null | undefined): QuantityType {
  return baseUnit(p) as QuantityType;
}

/**
 * How a line for this product may be entered: by the box when it has a box size, and always
 * in its base unit - so a 25 kg sack can be ordered as 2 boxes or as 12.5 kg.
 */
export function entryTypesFor(p: UnitInfo | null | undefined): QuantityType[] {
  const base = baseQuantityType(p);
  return (p?.unitPerBox ?? 0) > 0 ? ['BOX', base] : [base];
}

/** Title case of the base unit, e.g. "Kg" - for field labels. */
export function baseUnitLabel(p: UnitInfo | Uom | null | undefined): string {
  return quantityLabel(baseUnit(p));
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

/** The unit stock is counted in, as a label. */
export function stockLabel(p: UnitInfo | Uom | null | undefined): string {
  return shortLabel(baseUnit(p));
}

/** Field label for a quantity input, e.g. "Kg" or "Pcs". */
export function quantityLabel(unit: QuantityType | Uom | null | undefined): string {
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

/** "12 pcs/box", "25 kg/box" - how a box size reads next to a product. */
export function boxSizeLabel(p: UnitInfo | null | undefined): string | null {
  if (!p?.unitPerBox) return null;
  return `${p.unitPerBox} ${shortLabel(baseUnit(p))}/box`;
}
