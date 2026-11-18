import { t } from '../../core/i18n/i18n';
import { MemoLine, MemoNote, QuantityType } from '../../core/models';
import { formatMoney } from '../../shared/pipes';

/**
 * Memo scan (AI plan, feature 3): a photo of the supplier's memo becomes a draft purchase order.
 * The server reads and checks it; this file shrinks the photo before it is sent and words the
 * server's notes ("MATHS", "PRICE"...) in the person's language.
 */

/** Longest side sent to the model. Larger photos cost more and read no better. */
const MAX_SIDE = 1568;

/**
 * The photo as a JPEG, at most 1568 px on its longer side, as base64. A phone photo of 4-12 MB
 * becomes about 200-500 KB, which uploads quickly on mobile data. The camera's rotation is applied.
 */
export async function shrinkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image');
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: through an <img>, which also applies the rotation.
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('unreadable'));
      img.src = URL.createObjectURL(file);
    });
  }
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-canvas');
  // White under a transparent PNG (a screenshot of a PDF bill, say) rather than black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  else URL.revokeObjectURL(source.src);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** A scanned line kept beside its editor line: what the memo said, and what was put in the draft. */
export interface LineScan {
  memo: MemoLine;
  /** The scan it came from, to report on save how many of its lines were kept. */
  usageId: string | null;
  /** The values proposed, to tell on save whether the person changed the line. Null: no product was found. */
  proposed: ProposedLine | null;
  /** Set once the person picked a product for an unmatched line and the memo's numbers were applied. */
  applied: boolean;
}

export interface ProposedLine {
  productUuid: string;
  quantityType: QuantityType;
  totalQuantity: number;
  perUnitPrice: number;
}

/** Whether a saved line is exactly as the scan proposed it. */
export function unchanged(p: ProposedLine | null, v: { productUuid: string | null; quantityType: QuantityType; totalQuantity: number | null; perUnitPrice: number | null }): boolean {
  return !!p && v.productUuid === p.productUuid && v.quantityType === p.quantityType
    && Number(v.totalQuantity) === p.totalQuantity && Number(v.perUnitPrice) === p.perUnitPrice;
}

/** "2 ctn × Tk 480.00 = Tk 960.00": the line as the memo wrote it. */
export function memoLineSummary(m: MemoLine): string {
  const parts: string[] = [];
  if (m.memoQuantity !== null) parts.push(`${m.memoQuantity}${m.memoUnit ? ' ' + m.memoUnit : ''}`);
  if (m.memoUnitPrice !== null) parts.push(`× ${formatMoney(m.memoUnitPrice)}`);
  if (m.memoLineTotal !== null) parts.push(`= ${formatMoney(m.memoLineTotal)}`);
  return parts.join(' ');
}

/** A line's note in the person's language. */
export function lineNoteText(n: MemoNote): string {
  switch (n.code) {
    case 'NO_PRODUCT': return t('No matching product was found. Choose the product.');
    case 'CHECK_PRODUCT': return t('Check the product: the name is only similar.');
    case 'UNCLEAR': return t('Hard to read on the photo. Check this line.');
    case 'MATHS': return t('Quantity × rate does not match the memo\'s amount ({amount}).', { amount: formatMoney(n.amount) });
    case 'UNIT': return n.text
      ? t('Check the quantity: the memo\'s unit is "{unit}".', { unit: n.text })
      : t('Check the quantity and unit.');
    case 'PRICE': return t('The rate is far from the usual price ({amount}).', { amount: formatMoney(n.amount) });
    case 'NO_PRICE': return t('No rate on the memo: the usual price is used.');
    case 'NO_QTY': return t('No quantity on the memo: 1 is used.');
    default: return n.code;
  }
}

/** A note on the whole memo in the person's language. */
export function memoNoteText(n: MemoNote, draftTotal: number): string {
  switch (n.code) {
    case 'NOT_A_MEMO': return t('This photo does not look like a memo or bill.');
    case 'NO_SUPPLIER': return t('Supplier "{name}" is not in your list. Choose the supplier, or add them first.', { name: n.text ?? '' });
    case 'CHECK_SUPPLIER': return t('Check the supplier: "{name}" on the memo is only similar.', { name: n.text ?? '' });
    case 'TOTAL': return t('The memo\'s total is {memo} but the lines add up to {lines}. A line may be missing or misread, or there is a discount.',
      { memo: formatMoney(n.amount), lines: formatMoney(draftTotal) });
    case 'DATE': return t('The memo\'s date ({date}) looks wrong, so the order date was left as it was.', { date: n.text ?? '' });
    case 'DUPLICATE': return t('Purchase order #{no} was already entered from this memo.', { no: n.text ?? '' });
    case 'TOO_MANY_LINES': return t('Only the first 60 lines were read.');
    default: return n.code;
  }
}
