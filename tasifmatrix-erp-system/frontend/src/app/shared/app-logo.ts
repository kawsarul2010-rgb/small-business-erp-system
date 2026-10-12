import { Component, input } from '@angular/core';

let nextId = 0;

/**
 * The Tasif Matrix Limited mark ("Matrix T"): a solid T on an indigo-to-teal tile, the rest of
 * the 3 x 3 matrix as faint cells, and one mint "spark" cell. Same geometry as the brand files
 * (Tasif Matrix Logo/svg/tasifmatrix-logo-mark.svg), scaled to a 40-unit box.
 * Drawn as SVG so it stays sharp at every size and needs no image file.
 */
@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" role="img" aria-label="Tasif Matrix" focusable="false">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#6d6af8" />
          <stop offset=".55" stop-color="#4f46e5" />
          <stop offset="1" stop-color="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9.6" [attr.fill]="'url(#' + gid + ')'" />
      <g fill="#fff">
        <rect x="6.8" y="6.8" width="26.4" height="7.2" rx="2.2" />
        <rect x="16.4" y="10.4" width="7.2" height="22.8" rx="2.2" />
      </g>
      <g fill="#fff" opacity=".28">
        <rect x="6.8" y="16.4" width="7.2" height="7.2" rx="2.2" />
        <rect x="26" y="16.4" width="7.2" height="7.2" rx="2.2" />
        <rect x="6.8" y="26" width="7.2" height="7.2" rx="2.2" />
      </g>
      <rect x="26" y="26" width="7.2" height="7.2" rx="2.2" fill="#5eead4" />
    </svg>
  `,
  styles: `:host { display: inline-flex; flex: none; } svg { display: block; }`,
})
export class AppLogo {
  readonly size = input(36);
  /** Unique per instance: a gradient defined inside a hidden copy would not paint the others. */
  readonly gid = `tm-logo-${++nextId}`;
}
