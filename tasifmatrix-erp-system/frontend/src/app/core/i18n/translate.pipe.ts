import { Pipe, PipeTransform } from '@angular/core';
import { TParams, t } from './i18n';

/**
 * {{ 'Sales orders' | t }}  ·  {{ 'Showing {n} of {total}' | t: { n: 5, total: 20 } }}
 *
 * Impure on purpose: the same text must re-render when the language changes.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  transform(text: string | null | undefined, params?: TParams): string {
    return t(text, params);
  }
}
