import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslatePipe } from '../core/i18n/translate.pipe';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslatePipe, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title | t }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message | t }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">{{ 'Cancel' | t }}</button>
      <button mat-flat-button [class.danger]="data.danger" [mat-dialog-close]="true" cdkFocusInitial>
        {{ (data.confirmText ?? 'Confirm') | t }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `.message { white-space: pre-line; margin: 0; }`,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
