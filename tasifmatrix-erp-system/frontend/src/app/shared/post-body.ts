import { Component, computed, input } from '@angular/core';

export interface TextPart {
  kind: 'text' | 'link';
  text: string;
  href?: string;
}

// An email, a Bangladesh mobile number, an address with http(s)://, or a bare address with a
// common ending (tasifmatrix.com/billing) - the endings keep "Mr.Rahim" or "e.g." from becoming links.
const PATTERN = new RegExp(
  [
    String.raw`([\w.+-]+@[\w-]+(?:\.[\w-]+)+)`,
    String.raw`((?:\+?88)?01[3-9]\d{8})(?!\d)`,
    String.raw`(https?:\/\/[^\s]+)`,
    String.raw`((?:[a-z0-9-]+\.)+(?:com|net|org|app|io|bd|info|co|me|dev|xyz|shop|store|biz|online|site|tech)(?![a-z0-9-])(?::\d+)?(?:\/[^\s]*)?)`,
  ].join('|'),
  'gi',
);
const TRAILING = /[.,;:!?)\]'"]+$/;

/**
 * Splits plain text into text and links: web addresses open in the browser, emails in the mail
 * app and mobile numbers in the phone app. Nothing else is interpreted, so a post cannot inject markup.
 */
export function linkify(body: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of body.matchAll(PATTERN)) {
    let raw = m[0];
    const start = m.index ?? 0;
    const trail = raw.match(TRAILING)?.[0] ?? '';
    raw = raw.slice(0, raw.length - trail.length);
    if (!raw) continue;
    if (start > last) parts.push({ kind: 'text', text: body.slice(last, start) });
    const href = m[1] ? `mailto:${raw}` : m[2] ? `tel:${raw}` : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push({ kind: 'link', text: raw, href });
    last = start + raw.length;
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}

/** A post's message: its lines as typed, with addresses, emails and phone numbers as links. */
@Component({
  selector: 'app-post-body',
  template: `@for (p of parts(); track $index) {@if (p.kind === 'link') {<a [href]="p.href" target="_blank" rel="noopener noreferrer">{{ p.text }}</a>} @else {<span>{{ p.text }}</span>}}`,
  styles: `
    :host { display: block; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
    a { color: var(--erp-brand); font-weight: 550; text-decoration: underline; text-underline-offset: 2px; }
  `,
})
export class PostBody {
  readonly text = input.required<string>();
  readonly parts = computed(() => linkify(this.text()));
}
