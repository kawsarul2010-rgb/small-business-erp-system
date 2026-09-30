import { Component, input } from '@angular/core';

let nextId = 0;

/**
 * The Tasif Matrix mark: a "T" picked out of a 3 x 3 matrix on an indigo-to-teal tile.
 * Drawn as SVG so it stays sharp at every size and needs no image file.
 */
@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" role="img" aria-label="Tasif Matrix" focusable="false">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#6d6af8" />
          <stop offset=".5" stop-color="#4f46e5" />
          <stop offset="1" stop-color="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" [attr.fill]="'url(#' + gid + ')'" />
      <g fill="#fff">
        <rect x="7" y="7" width="7" height="7" rx="2" />
        <rect x="16.5" y="7" width="7" height="7" rx="2" />
        <rect x="26" y="7" width="7" height="7" rx="2" />
        <rect x="16.5" y="16.5" width="7" height="7" rx="2" />
        <rect x="16.5" y="26" width="7" height="7" rx="2" />
      </g>
      <g fill="#fff" opacity=".26">
        <rect x="7" y="16.5" width="7" height="7" rx="2" />
        <rect x="26" y="16.5" width="7" height="7" rx="2" />
        <rect x="7" y="26" width="7" height="7" rx="2" />
        <rect x="26" y="26" width="7" height="7" rx="2" />
      </g>
    </svg>
  `,
  styles: `:host { display: inline-flex; flex: none; } svg { display: block; }`,
})
export class AppLogo {
  readonly size = input(36);
  /** Unique per instance: a gradient defined inside a hidden copy would not paint the others. */
  readonly gid = `tm-logo-${++nextId}`;
}
