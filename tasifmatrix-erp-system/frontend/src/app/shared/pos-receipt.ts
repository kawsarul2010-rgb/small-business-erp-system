import { AfterViewInit, Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ApiService, problemOf } from '../core/api.service';
import { currentLang, t } from '../core/i18n/i18n';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { OrderReceipt } from '../core/models';
import { APP_INFO } from '../core/app-info';
import { enumLabel, formatMoney } from './pipes';
import { shortLabel } from './units';

/** Thermal receipt rolls: 80 mm (counter printers) and 58 mm (small and portable printers). */
export type PaperWidth = 80 | 58;

const PAPER_KEY = 'tasifmatrix.posPaper';

/** The paper is a property of the printer at this counter, so it is remembered per device. */
export function savedPaperWidth(): PaperWidth {
  try {
    return localStorage.getItem(PAPER_KEY) === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

function savePaperWidth(w: PaperWidth): void {
  try {
    localStorage.setItem(PAPER_KEY, String(w));
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** Printable width of each roll: printers leave about 4 mm (80 mm) and 5 mm (58 mm) each side. */
const PRINT_WIDTH_MM: Record<PaperWidth, number> = { 80: 72, 58: 48 };

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function esc(text: string | null | undefined): string {
  return (text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Sep 2026". Order dates are plain dates (yyyy-MM-dd), read as such so no time zone moves the day. */
function dateText(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** "16 Oct 2026, 9:05 PM" */
function nowText(): string {
  const n = new Date();
  const h = n.getHours() % 12 || 12;
  return `${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]} ${n.getFullYear()}, ${h}:${String(n.getMinutes()).padStart(2, '0')} ${n.getHours() < 12 ? 'AM' : 'PM'}`;
}

/**
 * A complete HTML page for one receipt, sized for the roll. Black only, no backgrounds and no
 * images, because a thermal printer has one colour and backgrounds waste paper. Labels follow the
 * app language; numbers stay in Latin digits so amounts read the same on every receipt.
 */
export function receiptHtml(r: OrderReceipt, paper: PaperWidth): string {
  const o = r.order;
  const b = r.business;
  const sales = o.transactionType === 'SALES';
  // A previous due is owed money from before the business used the app: no products, no invoice.
  const prev = o.isOpeningDue;
  const docTitle = prev ? t('Previous due') : sales ? t('Sales invoice') : t('Purchase order');
  const small = paper === 58;
  const money = (v: number) => formatMoney(v, false);
  const fontUrl = (w: number) => new URL(`fonts/noto-sans-bengali-${w}.woff2`, document.baseURI).href;

  const lines = o.lines
    .map((l, i) => {
      const how =
        l.quantityType === 'BOX' && l.boxQuantity != null && l.perBoxPrice != null
          ? `${qtyFormat.format(l.boxQuantity)} ${esc(shortLabel('BOX'))} (${qtyFormat.format(l.totalQuantity)} ${esc(shortLabel(l.baseUom))}) × ${money(l.perBoxPrice)}`
          : `${qtyFormat.format(l.totalQuantity)} ${esc(shortLabel(l.baseUom))} × ${money(l.perUnitPrice)}`;
      return `<div class="item"><div class="name">${i + 1}. ${esc(l.productName)}</div>
        <div class="row"><span class="how">${how}</span><span class="amt">${money(l.totalPrice)}</span></div></div>`;
    })
    .join('');

  const status =
    o.postingStatus === 'DRAFT' ? t('DRAFT - not final') : o.postingStatus === 'VOID' ? t('VOID - cancelled') : null;
  const contact = [b.phone ? `${esc(t('Phone'))}: ${esc(b.phone)}` : null].filter(Boolean).join(' · ');
  const party = `${esc(o.party.name)}${o.party.code ? ` (${esc(o.party.code)})` : ''}`;
  const printed = nowText();

  return `<!doctype html><html lang="${currentLang()}"><head><meta charset="utf-8">
<title>${esc(docTitle)} ${esc(o.orderNumber)}</title>
<style>
@font-face { font-family: 'Noto Sans Bengali'; font-weight: 400; src: url('${fontUrl(400)}') format('woff2'); unicode-range: U+0980-09FE, U+0964-0965, U+200C-200D, U+25CC; }
@font-face { font-family: 'Noto Sans Bengali'; font-weight: 700; src: url('${fontUrl(700)}') format('woff2'); unicode-range: U+0980-09FE, U+0964-0965, U+200C-200D, U+25CC; }
@page { size: ${paper}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${paper}mm; padding: 3mm ${(paper - PRINT_WIDTH_MM[paper]) / 2}mm 4mm;
  font: ${small ? 11 : 12}px/1.35 Arial, Helvetica, 'Noto Sans Bengali', 'Nirmala UI', sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.c { text-align: center; }
.biz { font-size: ${small ? 15 : 17}px; font-weight: 700; line-height: 1.2; text-align: center; word-wrap: break-word; }
.sub { font-size: ${small ? 10 : 11}px; text-align: center; word-wrap: break-word; }
.title { margin-top: 5px; font-size: ${small ? 12 : 13}px; font-weight: 700; text-align: center; letter-spacing: .04em; text-transform: uppercase; }
.status { margin-top: 3px; border: 1.5px solid #000; padding: 2px; text-align: center; font-weight: 700; }
hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
hr.solid { border-top: 1.5px solid #000; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.row > :first-child { min-width: 0; overflow-wrap: anywhere; }
.row > .amt, .row > .v { flex: none; text-align: right; white-space: nowrap; }
.meta .row span:first-child { white-space: nowrap; }
.meta .v { white-space: normal; text-align: right; overflow-wrap: anywhere; }
.item { margin: 0 0 4px; }
.name { font-weight: 700; overflow-wrap: anywhere; }
.how { padding-left: 10px; }
.tot { font-size: ${small ? 12 : 13}px; }
.grand { font-size: ${small ? 14 : 16}px; font-weight: 700; }
.due { font-weight: 700; }
.note { margin-top: 4px; overflow-wrap: anywhere; }
.foot { margin-top: 8px; text-align: center; font-size: ${small ? 10 : 11}px; }
.thanks { font-weight: 700; font-size: ${small ? 11 : 12}px; }
.count { margin-top: 3px; font-size: ${small ? 10 : 11}px; }
.by { margin-top: 3px; font-size: ${small ? 9 : 10}px; }
</style></head><body>
<div class="biz">${esc(b.name)}</div>
${b.address ? `<div class="sub">${esc(b.address)}</div>` : ''}
${contact ? `<div class="sub">${contact}</div>` : ''}
${b.licenseNumber ? `<div class="sub">${esc(t('License'))}: ${esc(b.licenseNumber)}</div>` : ''}
<div class="title">${esc(docTitle)}</div>
${status ? `<div class="status">${esc(status)}</div>` : ''}
<hr>
<div class="meta">
  <div class="row"><span>${esc(sales && !prev ? t('Invoice no.') : t('Order no.'))}</span><span class="v"><b>${esc(o.orderNumber)}</b></span></div>
  <div class="row"><span>${esc(t('Date'))}</span><span class="v">${dateText(o.orderDate)}</span></div>
  <div class="row"><span>${esc(sales ? t('Customer') : t('Supplier'))}</span><span class="v">${party}</span></div>
  ${o.party.mobileNumber ? `<div class="row"><span>${esc(t('Mobile'))}</span><span class="v">${esc(o.party.mobileNumber)}</span></div>` : ''}
  <div class="row"><span>${esc(t('Payment'))}</span><span class="v">${esc(prev ? t('Previous due') : enumLabel(o.paymentType))}</span></div>
</div>
<hr>
${lines || `<div class="c">${esc(prev ? t('Carried forward from before this account was opened.') : t('No line items.'))}</div>`}
<hr class="solid">
<div class="row grand"><span>${esc(t('Total'))}</span><span class="amt">Tk ${money(o.totalAmount)}</span></div>
<div class="row tot"><span>${esc(t('Paid'))}</span><span class="amt">${money(o.totalPaidAmount)}</span></div>
<div class="row tot due"><span>${esc(t('Due'))}</span><span class="amt">${money(o.dueAmount)}</span></div>
${prev ? '' : `<div class="count">${esc(t('{n} item(s)', { n: o.lines.length }))}</div>`}
${o.notes ? `<hr><div class="note">${esc(t('Note'))}: ${esc(o.notes)}</div>` : ''}
<hr>
<div class="foot">
  ${sales && !prev ? `<div class="thanks">${esc(t('Thank you for your purchase!'))}</div>` : ''}
  <div>${esc(t('Printed {date}', { date: printed }))}</div>
  <div class="by">${esc(t('Powered by {app}', { app: APP_INFO.name }))} · tasifmatrix.com.bd</div>
</div>
</body></html>`;
}

export interface PosReceiptData {
  /** e.g. "/sales-orders/{uuid}" - the receipt endpoint is "{path}/receipt". */
  path: string;
}

/**
 * Prints an order on a POS (thermal) receipt printer from the browser.
 *
 * The receipt is an ordinary web page sized to the roll, printed through the printer's own
 * driver, so it works with any USB or network receipt printer that Windows or macOS can print
 * to, and Bangla prints as well as English. The preview shows the receipt at its real width.
 */
@Component({
  selector: 'app-pos-receipt-dialog',
  imports: [TranslatePipe, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule],
  styles: `
    .bar { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .bar .label { font-size: 13px; color: var(--erp-muted); }
    .stage { display: flex; justify-content: center; padding: 18px 12px; border-radius: 14px; background: var(--erp-card-2); max-height: 62vh; overflow: auto; }
    iframe { display: block; border: 0; background: #fff; box-shadow: 0 6px 18px rgba(15, 23, 42, .18); transition: width .15s ease; }
    .tip { display: flex; gap: 8px; margin: 12px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--erp-muted); }
    .tip mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; }
    .err { color: var(--erp-negative, #b91c1c); }
  `,
  template: `
    <h2 mat-dialog-title>{{ 'POS receipt' | t }}</h2>
    <mat-dialog-content>
      <div class="bar">
        <span class="label">{{ 'Receipt paper' | t }}</span>
        <mat-button-toggle-group [value]="paper()" (change)="setPaper($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'Receipt paper' | t">
          <mat-button-toggle [value]="80">80 mm</mat-button-toggle>
          <mat-button-toggle [value]="58">58 mm</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <p class="err">{{ error() | t }}</p> }
      <div class="stage" [hidden]="!html()">
        <iframe #frame [style.width.px]="previewWidth()" [title]="'Receipt preview' | t"></iframe>
      </div>
      <p class="tip">
        <mat-icon>info</mat-icon>
        <span>{{ 'In the print window choose your receipt printer, set Margins to None and Scale to 100%. The paper size is remembered on this device.' | t }}</span>
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | t }}</button>
      <button mat-flat-button (click)="print()" [disabled]="!html() || printing()"><mat-icon>receipt_long</mat-icon>{{ 'Print receipt' | t }}</button>
    </mat-dialog-actions>
  `,
})
export class PosReceiptDialog implements OnInit, AfterViewInit {
  readonly data = inject<PosReceiptData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');

  readonly paper = signal<PaperWidth>(savedPaperWidth());
  readonly receipt = signal<OrderReceipt | null>(null);
  readonly loading = signal(true);
  readonly printing = signal(false);
  readonly error = signal<string | null>(null);
  private readonly viewReady = signal(false);

  readonly html = computed(() => {
    const r = this.receipt();
    return r ? receiptHtml(r, this.paper()) : null;
  });
  /** The roll at screen size: 1 mm = 96/25.4 CSS pixels. */
  readonly previewWidth = computed(() => Math.round((this.paper() * 96) / 25.4));

  constructor() {
    effect(() => {
      const html = this.html();
      if (html && this.viewReady()) this.render(html);
    });
  }

  ngOnInit(): void {
    this.api.get<OrderReceipt>(`${this.data.path}/receipt`).subscribe({
      next: (r) => { this.receipt.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(problemOf(e).title ?? 'Could not load the order.'); this.loading.set(false); },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  setPaper(w: PaperWidth): void {
    this.paper.set(w);
    savePaperWidth(w);
  }

  private render(html: string): void {
    const frame = this.frame().nativeElement;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const fit = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height)}px`; };
    requestAnimationFrame(fit);
    void doc.fonts?.ready.then(() => requestAnimationFrame(fit));
  }

  async print(): Promise<void> {
    const frame = this.frame().nativeElement;
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return;
    this.printing.set(true);
    try {
      await doc.fonts?.ready;
      // A receipt is as long as its content. Give the page exactly that height so the printer
      // feeds no blank paper after the last line (plus a little for the cutter).
      const heightMm = Math.ceil((doc.body.getBoundingClientRect().height * 25.4) / 96) + 4;
      let page = doc.getElementById('page-size') as HTMLStyleElement | null;
      if (!page) {
        page = doc.createElement('style');
        page.id = 'page-size';
        doc.head.appendChild(page);
      }
      page.textContent = `@page { size: ${this.paper()}mm ${heightMm}mm; margin: 0; }`;
      win.focus();
      win.print();
    } finally {
      this.printing.set(false);
    }
  }
}
