import { environment } from '../../environments/environment';
import { t } from './i18n/i18n';

/**
 * Product identity and publisher credit.
 *
 * Every place that shows the product name, the version or who makes it reads from here,
 * so the credit stays identical on desktop, on phones and inside the Android app.
 *
 * This is the software's own identity. Each business using it sees its own name alongside
 * (see the shell), and its own name on its invoices and reports.
 */
export const APP_INFO = {
  name: 'Tasif Matrix ERP',
  version: '1.0.0',
  /** Year the product was first released; the copyright line grows from it. */
  since: 2026,
  publisher: {
    name: 'Tasif Matrix Limited',
    location: 'Bangladesh',
  },
} as const;

/** "Bangladesh" - the line under the publisher's name. */
export const PUBLISHER_LINE = APP_INFO.publisher.location;

/** "by Tasif Matrix Limited" - the short form used in footers. */
export const PUBLISHED_BY = `by ${APP_INFO.publisher.name}`;

/** "© 2026 Tasif Matrix Limited. All rights reserved." (a range once the year moves on). */
export function copyrightLine(now: Date = new Date()): string {
  const year = now.getFullYear();
  const span = year > APP_INFO.since ? `${APP_INFO.since}-${year}` : `${APP_INFO.since}`;
  return t('© {years} {name}. All rights reserved.', { years: span, name: APP_INFO.publisher.name });
}

/**
 * The product's website. Inside the Android app that is the server the app talks to (set in
 * environment.mobile.ts, so it follows a move to a new domain); in a browser it is the address
 * the page was opened from.
 */
export function websiteUrl(): string {
  const base = environment.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
}

/** "tasifmatrix.com" - the website without https:// for display. */
export function websiteLabel(url: string = websiteUrl()): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
}
