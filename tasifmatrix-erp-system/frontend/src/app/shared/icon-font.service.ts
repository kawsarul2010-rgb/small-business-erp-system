import { Injectable, NgZone, inject } from '@angular/core';
import { ICON_CODEPOINTS } from './icon-codepoints';

/**
 * The app ships a small Material Symbols subset (about 40 KB) so icons also work offline,
 * for example inside the Android app. A subset cannot keep the ligature rules that turn
 * "add" into an icon, so this service swaps the icon name for its code point in every
 * <mat-icon> element, including ones created later by dialogs and menus.
 */
@Injectable({ providedIn: 'root' })
export class IconFontService {
  private readonly zone = inject(NgZone);
  private observer?: MutationObserver;
  private readonly reported = new Set<string>();

  start(): void {
    if (typeof document === 'undefined' || this.observer) return;
    this.applyAll(document.body);
    // Outside Angular: this only touches text nodes and must not trigger change detection.
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'characterData') {
            const host = record.target.parentElement;
            if (host?.tagName === 'MAT-ICON') this.apply(host);
          }
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) this.applyAll(node);
          });
        }
      });
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  private applyAll(root: HTMLElement): void {
    if (root.tagName === 'MAT-ICON') this.apply(root);
    root.querySelectorAll?.('mat-icon').forEach((el) => this.apply(el as HTMLElement));
  }

  private apply(el: HTMLElement): void {
    const name = (el.textContent ?? '').trim();
    const codePoint = ICON_CODEPOINTS[name];
    if (codePoint) {
      if (el.textContent !== codePoint) setIconText(el, codePoint);
      el.classList.remove('icon-unmapped');
      return;
    }
    // Already a code point (a single character from the private use area): nothing to do.
    if (name.length <= 1) return;
    // An icon name the subset does not carry would otherwise render as raw text such as
    // "visibility". Hide it instead, and say so in development so it gets added.
    if (/^[a-z0-9_]+$/.test(name)) {
      el.classList.add('icon-unmapped');
      if (!this.reported.has(name)) {
        this.reported.add(name);
        console.warn(`[icons] "${name}" is missing from the bundled subset - run tools/build-icon-font.py`);
      }
    }
  }
}

/**
 * Writes the code point into the text node the template already owns instead of replacing it.
 * Assigning textContent would swap in a new node, and a binding such as
 * {{ shown ? 'visibility_off' : 'visibility' }} would keep updating the old, detached node -
 * the icon would then never change after the first render.
 */
function setIconText(el: HTMLElement, value: string): void {
  const texts = Array.from(el.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
  const target = texts.find((t) => t.data.trim() !== '') ?? texts[0];
  if (!target) {
    el.textContent = value;
    return;
  }
  target.data = value;
  for (const t of texts) if (t !== target && t.data !== '') t.data = '';
}
