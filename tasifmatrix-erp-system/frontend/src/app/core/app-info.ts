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
  return `© ${span} ${APP_INFO.publisher.name}. All rights reserved.`;
}
