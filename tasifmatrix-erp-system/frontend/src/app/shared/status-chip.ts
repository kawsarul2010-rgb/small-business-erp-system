import { Component, computed, input } from '@angular/core';
import { enumLabel } from './pipes';

/** Small colored pill for statuses such as DRAFT / FINAL / VOID / SENT / FAILED. */
@Component({
  selector: 'app-status',
  template: `<span class="chip" [class]="'chip chip-' + tone()">{{ text() }}</span>`,
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 1px 10px 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 20px; white-space: nowrap; }
    .chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .85; }
    .chip-neutral { background: var(--erp-chip-neutral-bg); color: var(--erp-chip-neutral-fg); }
    .chip-info { background: var(--erp-chip-info-bg); color: var(--erp-chip-info-fg); }
    .chip-success { background: var(--erp-chip-success-bg); color: var(--erp-chip-success-fg); }
    .chip-warn { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .chip-danger { background: var(--erp-chip-danger-bg); color: var(--erp-chip-danger-fg); }
  `,
})
export class StatusChip {
  readonly value = input.required<string>();
  readonly text = computed(() => enumLabel(this.value()));
  readonly tone = computed(() => {
    switch (this.value()) {
      case 'FINAL':
      case 'SENT':
      case 'ACTIVE':
      case 'INCREASE':
        return 'success';
      case 'DRAFT':
      case 'PENDING':
      case 'TRIAL':
      case 'INITIATED':
        return 'info';
      case 'COMPLETED':
        return 'success';
      case 'GRACE_PERIOD':
        return 'warn';
      case 'EXPIRED':
        return 'danger';
      case 'VOID':
      case 'SUSPENDED':
      case 'CLOSED':
      case 'FAILED':
      case 'DELETED':
      case 'DECREASE':
        return 'danger';
      case 'SKIPPED':
      case 'MANAGER':
        return 'warn';
      default:
        return 'neutral';
    }
  });
}
