import { Injectable, effect } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { t } from './i18n';

/** The table pager's words ("Items per page", "1 – 20 of 54") in the chosen language. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  constructor() {
    super();
    this.translate();
    // Again whenever the language changes (t() reads the language signal).
    effect(() => {
      this.translate();
      this.changes.next();
    });
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return t('0 of {total}', { total: length });
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return t('{from} – {to} of {total}', { from: start + 1, to: end, total: length });
  };

  private translate(): void {
    this.itemsPerPageLabel = t('Items per page:');
    this.nextPageLabel = t('Next page');
    this.previousPageLabel = t('Previous page');
    this.firstPageLabel = t('First page');
    this.lastPageLabel = t('Last page');
  }
}
